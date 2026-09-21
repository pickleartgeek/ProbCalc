import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useEngine } from '../state/store';
import { GeoMap } from '../components/geo/GeoMap';
import { PrecinctCanvas } from '../components/precinct/PrecinctCanvas';
import { prettyPrecinctId } from '../components/precinct/PrecinctTooltip';
import { BaselineShiftTable } from '../components/results/BaselineShiftTable';
import { REGION_PRESETS, presetById } from '../lib/geo/presets';
import { matchPartiesToBaseline } from '../lib/geo/partyMatch';
import { buildReturnsPlan, isTwoPartyBaseline, shiftDisplay, snapshotAt, swingRows, unitsFromBaseline, type UnitInput } from '../lib/geo/returns';
import { BUCKETS, makeLeaderScale } from '../lib/geo/forecast';
import { useGeoScene } from '../hooks/useGeoScene';
import { usePrecinctState } from '../hooks/usePrecinctState';
import { onDark } from '../lib/partyColors';
import { runProbCalc } from '../lib/probCalc';

const DURATION_S = 50; // wall-clock seconds for a full playback at speed 1×
const NOISE = { low: 220, medium: 90, high: 40 } as const;
const plural = (w: string) => (/[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
const pct = (v: number | undefined) => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);

export function ElectionNight() {
  const { config, baseCalcResults, setConfig, setRegionBinding } = useEngine();
  const [presetId, setPresetId] = useState<string | undefined>(undefined);
  const [focus, setFocus] = useState('all');
  const [aggregate, setAggregate] = useState<'base' | 'draw'>('base');
  const [drawn, setDrawn] = useState<Record<string, number> | null>(null);
  const [noise, setNoise] = useState<keyof typeof NOISE>('medium');
  const [seedN, setSeedN] = useState(1);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const raf = useRef<number | null>(null);

  const scene = useGeoScene(config, { presetId, focus });
  const preset = presetById(scene.presetId);

  // A single US state plays out on its REAL precincts when the file is there; otherwise on House districts.
  const usState = scene.scene?.drilled && scene.scene.presetId === 'us-house' && Array.isArray(scene.scene.participants) && scene.scene.participants.length === 1 ? scene.scene.participants[0] : null;
  const ps = usePrecinctState(usState);
  const precinctMode = !!usState && !!ps.layer && !!ps.baseline && !ps.error;

  const partyIds = useMemo(() => config?.parties.map((p) => p.id) ?? [], [config?.parties]);
  const partyById = useMemo(() => Object.fromEntries((config?.parties ?? []).map((p) => [p.id, p])), [config?.parties]);
  const partyMap = config?.regionBinding?.partyMap;

  const base = useMemo(() => {
    if (aggregate === 'draw' && drawn) return drawn;
    return Object.fromEntries((baseCalcResults ?? []).map((r) => [r.partyId, r.percentage]));
  }, [aggregate, drawn, baseCalcResults]);

  // the regions that vote: precincts, or the scene's regions, or an abstract grid
  const source = useMemo(() => {
    if (!config) return null;
    if (precinctMode && ps.baseline) {
      const mapping = { ...matchPartiesToBaseline(config.parties, ps.baseline.keys), ...(partyMap ?? {}) };
      const regions = ps.results.map((r) => { const { county, name } = prettyPrecinctId(r.id); return { id: r.id, name, group: county }; });
      return { kind: 'precinct' as const, mapping, keys: ps.baseline.keys, sourceLabel: ps.baseline.source, ...unitsFromBaseline(regions, ps.baseline, mapping) };
    }
    if (scene.scene && scene.geo && scene.baseline) {
      return { kind: 'geo' as const, mapping: scene.mapping, keys: scene.baseline.keys, sourceLabel: scene.baseline.source, units: scene.units, prevNational: scene.prevNational };
    }
    if (!scene.scene) {
      const synth: UnitInput[] = Array.from({ length: 120 }, (_, i) => ({ id: `u${i}`, name: `Unit ${i + 1}`, votes: 500 + ((i * 7919) % 4000) }));
      return { kind: 'grid' as const, mapping: {} as Record<string, string | null>, keys: [], sourceLabel: '', units: synth, prevNational: {} as Record<string, number | undefined> };
    }
    return null;
  }, [config, precinctMode, ps.baseline, ps.results, partyMap, scene.scene, scene.geo, scene.baseline, scene.mapping, scene.units, scene.prevNational]);

  const plan = useMemo(
    () => (config && source ? buildReturnsPlan(partyIds, base, source.units, source.prevNational, { seed: `${config.id}-${scene.scene?.presetId ?? 'grid'}-${seedN}`, noise: NOISE[noise] }) : null),
    [config, source, partyIds, base, scene.scene?.presetId, seedN, noise]
  );
  const unitIndex = useMemo(() => new Map((plan?.units ?? []).map((u, i) => [u.id, i])), [plan]);
  const snap = useMemo(() => (plan ? snapshotAt(plan, t) : null), [plan, t]);

  // playback clock (~10 snapshots/s keeps a 25k-precinct canvas smooth)
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let acc = 0;
    const step = (now: number) => {
      acc += now - last;
      last = now;
      if (acc >= 100) {
        const dt = acc / 1000; acc = 0;
        setT((v) => { const n = Math.min(1, v + (dt * speed) / DURATION_S); if (n >= 1) setPlaying(false); return n; });
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, speed]);

  const colorTable = useMemo(() => makeLeaderScale((config?.parties ?? []).map((p) => onDark(p.color))), [config?.parties]);
  const partyIndex = useMemo(() => new Map(partyIds.map((id, i) => [id, i])), [partyIds]);

  // colour per region for the current snapshot: a number for the canvas, a CSS colour for the SVG map
  const version = useRef(0);
  const { values, fills } = useMemo(() => {
    version.current++;
    const values: Record<string, number | undefined> = {};
    const fills: Record<string, string> = {};
    if (!snap) return { values, fills };
    for (const u of snap.units) {
      if (!u.leader) continue;
      const v = (partyIndex.get(u.leader) ?? 0) * BUCKETS + Math.round(Math.min(1, u.margin * 3.5) * (BUCKETS - 1));
      values[u.id] = v;
      fills[u.id] = colorTable(v);
    }
    return { values, fills };
  }, [snap, partyIndex, colorTable]);

  if (!config || !baseCalcResults) return <Navigate to="/build" replace />;

  const groups = scene.geo ? [...new Set(scene.geo.features.map((f) => f.properties.group).filter((g): g is string => !!g))].sort() : [];
  const pctCounted = snap?.pctReporting ?? 0;
  const ranked = snap?.ranked ?? [];
  const margin = ranked.length > 1 ? ranked[0].pct - ranked[1].pct : 0;
  const total = plan?.units.length ?? 0;
  const done = snap?.regionsComplete ?? 0;
  const called = t >= 1 || (pctCounted > 0.55 && margin > 0.08 && done > 10);
  const unitWord = precinctMode ? 'precinct' : preset?.unit ?? 'unit';
  const binding = config.regionBinding;
  const shiftRows = source && source.kind !== 'grid' ? swingRows(partyIds, base, source.mapping, source.prevNational, { twoParty: isTwoPartyBaseline(source.keys) }) : [];

  const reset = () => { setPlaying(false); setT(0); setSeedN((n) => n + 1); };
  const drawScenario = () => {
    const { outcomes } = runProbCalc(config.parties, baseCalcResults, { simulations: 1, beta: 1, dateWeighting: { enabled: true, divisor: 100 } });
    setDrawn(outcomes[0].values); setAggregate('draw'); setT(0); setPlaying(false);
  };
  const attach = (id: string) => {
    setPresetId(id === 'abstract' ? 'abstract' : id); setFocus('all'); setT(0); setPlaying(false);
    if (id !== 'abstract') setConfig({ ...config, regionBinding: { presetId: id, participants: 'all' } });
  };
  const remap = (partyId: string, key: string | null) => { if (binding) setRegionBinding({ ...binding, partyMap: { ...(binding.partyMap ?? {}), [partyId]: key } }); };

  const tipBody = (id: string, name: string, sub?: string, realVotes?: number) => {
    const i = unitIndex.get(id);
    const u = snap?.units[i ?? -1];
    if (i === undefined || !u || !plan) return <span className="text-ink-dim">no data</span>;
    const prev = source?.units[i]?.prev;
    const rows = u.leader ? Object.entries(u.shares).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];
    const disp = source ? shiftDisplay(partyIds, u.shares, prev, source.mapping, isTwoPartyBaseline(source.keys)) : {};
    return (
      <div>
        <div className="text-ink font-semibold leading-tight">{name}</div>
        <div className="text-ink-dim text-[10px]">{[sub, realVotes ? `${Math.round(realVotes).toLocaleString()} votes` : `${Math.round(plan.units[i].votes).toLocaleString()} votes`].filter(Boolean).join(' · ')}</div>
        <div className="text-ink-dim mt-0.5">{u.f > 0 ? `${Math.round(u.f * 100)}% counted` : 'not reporting yet'}</div>
        <div className="mt-1 space-y-0.5">
          {rows.map(([pid, v]) => {
            const { now: shown, before, delta: d } = disp[pid] ?? { now: v };
            return (
              <div key={pid} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: onDark(partyById[pid]?.color) }} />
                <span className="text-ink-muted">{partyById[pid]?.shortName}</span>
                <span className="ml-auto pl-3 text-right whitespace-nowrap">
                  {before !== undefined && <span className="text-ink-dim mr-1.5">{pct(before)} →</span>}
                  {pct(shown)}
                  {d !== undefined && <span className={`ml-1 ${d > 0.05 ? 'text-green-400' : d < -0.05 ? 'text-red-call' : 'text-ink-dim'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full bg-red-call ${playing || (t > 0 && !called) ? 'pulse-live' : ''}`} />
        <span className="font-data text-xs tracking-widest text-red-call uppercase">{called ? 'Race called' : t === 0 ? 'Standing by' : 'Live'}</span>
      </div>
      <h1 className="font-display font-800 text-3xl mb-1">Election Night — {config.title}</h1>
      <p className="text-ink-muted mb-6 max-w-3xl">
        Simulated returns at the smallest division we have data for. Each region's expected result is your aggregate plus how that region
        leaned in the previous election (guide III.II), then drawn with local noise and counted in batches.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-5">
        <label className="text-xs font-data uppercase text-ink-dim">
          Geography
          <select value={scene.presetId} onChange={(e) => attach(e.target.value)} className="block mt-1 bg-panel-raised border border-hairline rounded px-3 py-2 text-sm normal-case text-ink">
            <option value="abstract">Abstract grid (no geography)</option>
            {REGION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {groups.length > 1 && (
          <label className="text-xs font-data uppercase text-ink-dim">
            Participating {preset?.groupLabel.toLowerCase()}
            <select value={focus} onChange={(e) => { setFocus(e.target.value); setT(0); setPlaying(false); }} className="block mt-1 bg-panel-raised border border-hairline rounded px-3 py-2 text-sm normal-case text-ink max-w-[14rem]">
              <option value="all">{binding?.presetId === scene.presetId && binding.participants !== 'all' ? 'As configured' : 'All'}</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs font-data uppercase text-ink-dim">
          Aggregate
          <select value={aggregate} onChange={(e) => { const v = e.target.value as 'base' | 'draw'; if (v === 'draw' && !drawn) drawScenario(); else { setAggregate(v); setT(0); } }} className="block mt-1 bg-panel-raised border border-hairline rounded px-3 py-2 text-sm normal-case text-ink">
            <option value="base">BaseCalc average</option>
            <option value="draw">One ProbCalc draw</option>
          </select>
        </label>
        {aggregate === 'draw' && <button onClick={drawScenario} className="px-3 py-2 border border-hairline-bright rounded text-sm hover:bg-panel-raised">↻ New draw</button>}
        <label className="text-xs font-data uppercase text-ink-dim">
          Local variation
          <select value={noise} onChange={(e) => { setNoise(e.target.value as keyof typeof NOISE); setT(0); }} className="block mt-1 bg-panel-raised border border-hairline rounded px-3 py-2 text-sm normal-case text-ink">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>
      </div>

      {source && source.kind !== 'grid' && (
        <p className="text-ink-dim text-xs font-data mb-4 max-w-4xl">
          <span className={`inline-block px-1.5 py-0.5 rounded mr-2 uppercase ${(precinctMode ? 'measured' : scene.baseline?.kind) === 'measured' ? 'bg-cyan/15 text-cyan' : scene.baseline?.kind === 'modelled' ? 'bg-gold/15 text-gold' : 'bg-panel-raised text-ink-muted'}`}>
            baseline: {precinctMode ? 'measured' : scene.baseline?.kind}
          </span>
          {source.sourceLabel || preset?.baselineNote}
          {precinctMode && ` · ${ps.results.length.toLocaleString()} real precincts in ${usState}`}
          {usState && !precinctMode && !ps.loading && ' · no precinct file for this state, using House districts'}
        </p>
      )}
      {scene.error && <p className="text-red-call text-sm font-data mb-4">Could not load geography: {scene.error}</p>}

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-panel border border-hairline rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-700 text-lg">{scene.scene || precinctMode ? `${plural(unitWord)[0].toUpperCase()}${plural(unitWord).slice(1)} reporting` : 'Units reporting'}</h2>
            <span className="font-data text-sm text-ink-muted">{done.toLocaleString()} / {total.toLocaleString()} complete · {(pctCounted * 100).toFixed(0)}% of votes</span>
          </div>

          {precinctMode && ps.layer ? (
            <div className="relative rounded-lg overflow-hidden border border-hairline" style={{ height: 500 }} data-testid="night-precincts">
              <PrecinctCanvas
                layer={ps.layer}
                colorScale={(v) => colorTable(v)}
                values={values}
                drawVersion={version.current}
                background="#0a0e17"
                tooltip={(f) => { const { county, name } = prettyPrecinctId(f.id); return tipBody(f.id, name, county ? `county ${county}` : undefined, ps.resultsById.get(f.id)?.total); }}
              />
            </div>
          ) : scene.scene ? (
            scene.geo && plan ? (
              <GeoMap
                geo={scene.geo}
                participants={scene.scene.participants}
                fills={fills}
                tooltip={(id) => { const f = scene.features.find((x) => x.properties.id === id); return tipBody(id, f?.properties.name ?? id, f?.properties.group); }}
              />
            ) : (
              <div className="h-80 flex items-center justify-center text-ink-dim text-sm font-data">{scene.error ? '—' : usState && ps.loading ? `Loading ${usState} precincts…` : `Loading ${preset?.label}…`}</div>
            )
          ) : (
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(15, 1fr)' }}>
              {plan?.units.map((u) => <div key={u.id} className="aspect-square rounded-[2px]" style={{ background: fills[u.id] ?? '#1a2233' }} />)}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button onClick={() => { if (t >= 1) setT(0); setPlaying((p) => !p); }} disabled={!plan} className="px-4 py-2 bg-gold text-void font-display font-800 rounded disabled:opacity-30 hover:brightness-110">
              {playing ? '⏸ Pause' : t >= 1 ? '↺ Replay' : '▶ Play returns'}
            </button>
            <button onClick={() => { setPlaying(false); setT(1); }} disabled={!plan} className="px-3 py-2 border border-hairline-bright rounded text-sm hover:bg-panel-raised disabled:opacity-30">Skip to final</button>
            <button onClick={reset} className="px-3 py-2 border border-hairline rounded text-sm text-ink-muted hover:bg-panel-raised">New draw of the night</button>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-ink-dim font-data uppercase">Speed</span>
              <input type="range" min={0.5} max={6} step={0.5} value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} className="accent-gold w-24" />
            </div>
          </div>
          <input type="range" min={0} max={1} step={0.001} value={t} onChange={(e) => { setPlaying(false); setT(parseFloat(e.target.value)); }} className="w-full mt-3 accent-cyan" aria-label="Playback position" />
        </div>

        <div className="space-y-6">
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <h2 className="font-display font-700 text-lg mb-3">Running tally</h2>
            <div className="space-y-3">
              {ranked.map((r, i) => {
                const p = partyById[r.id];
                return (
                  <div key={r.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: onDark(p?.color) }} />
                        <span className="truncate">{p?.name}</span>
                        {i === 0 && called && <span className="text-[10px] font-data uppercase text-gold bg-gold/15 px-1.5 py-0.5 rounded">Winner</span>}
                      </div>
                      <span className="font-data shrink-0">
                        {(scene.scene || precinctMode) && (snap?.leads[r.id] ?? 0) > 0 && (
                          <span className="text-ink-dim text-xs mr-2" title={`${plural(unitWord)} currently led`}>{snap!.leads[r.id].toLocaleString()} {config.votingSystem === 'FPTP' && !precinctMode ? 'seats' : plural(unitWord)}</span>
                        )}
                        {(r.pct * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-panel-raised rounded overflow-hidden"><div className="h-full transition-all duration-150" style={{ width: `${r.pct * 100}%`, background: onDark(p?.color) }} /></div>
                  </div>
                );
              })}
            </div>
            <p className="text-ink-dim text-xs font-data mt-4">{Math.round(snap?.reportedVotes ?? 0).toLocaleString()} votes counted</p>
            {preset && !precinctMode && <p className="text-ink-dim text-[10px] font-data mt-3 leading-snug">{preset.attribution}</p>}
            {!scene.scene && <p className="text-ink-dim text-xs mt-4">No geography attached — pick one above so returns land on real boundaries, or <Link to="/build" className="text-cyan hover:underline">set it on the Build page</Link>.</p>}
          </div>

          {source && source.kind !== 'grid' && (
            <div className="bg-panel border border-hairline rounded-lg p-5">
              <BaselineShiftTable parties={config.parties} rows={shiftRows} keys={source.keys} onRemap={binding ? remap : undefined} source={source.sourceLabel} twoParty={isTwoPartyBaseline(source.keys)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
