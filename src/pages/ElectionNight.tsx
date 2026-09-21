import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useEngine } from '../state/store';
import { GeoMap } from '../components/geo/GeoMap';
import { REGION_PRESETS, inferPreset, presetById, resolveScene } from '../lib/geo/presets';
import { loadGeometry, isParticipant, type LoadedGeometry } from '../lib/geo/loadGeo';
import { loadBaseline, emptyBaseline, parseBaselineCsv, type RegionBaseline } from '../lib/geo/baselines';
import { matchPartiesToBaseline } from '../lib/geo/partyMatch';
import { buildReturnsPlan, snapshotAt, unitsFromBaseline, type UnitInput } from '../lib/geo/returns';
import { onDark } from '../lib/partyColors';
import { runProbCalc } from '../lib/probCalc';
import type { RegionBinding } from '../lib/types';

const DURATION_S = 50; // wall-clock seconds for a full playback at speed 1×
const NOISE = { low: 220, medium: 90, high: 40 } as const;

const plural = (w: string) => (/[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`;
};

export function ElectionNight() {
  const { config, baseCalcResults, setConfig } = useEngine();
  const [presetId, setPresetId] = useState<string>(() => config?.regionBinding?.presetId ?? inferPreset(config?.region ?? '') ?? 'abstract');
  const [focus, setFocus] = useState<string>('all'); // 'all' or one group (Land / okres / state)
  const [geo, setGeo] = useState<LoadedGeometry | null>(null);
  const [baseline, setBaseline] = useState<RegionBaseline | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<'base' | 'draw'>('base');
  const [drawn, setDrawn] = useState<Record<string, number> | null>(null);
  const [noise, setNoise] = useState<keyof typeof NOISE>('medium');
  const [seedN, setSeedN] = useState(1);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const raf = useRef<number | null>(null);

  const binding: RegionBinding | undefined = config?.regionBinding;
  // configured participants (e.g. ['GA']) unless the user narrows/widens with the focus selector
  const participants: 'all' | string[] = focus !== 'all' ? [focus] : binding?.presetId === presetId ? binding.participants : 'all';
  const scene = useMemo(() => (presetId === 'abstract' ? null : resolveScene({ presetId, participants })), [presetId, participants]);

  useEffect(() => {
    if (!scene) { setGeo(null); setBaseline(null); return; }
    let live = true;
    setLoadError(null);
    setGeo(null);
    Promise.all([loadGeometry(scene.presetId), loadBaseline(scene.presetId)])
      .then(([g, b]) => {
        if (!live) return;
        setGeo(g);
        // a CSV pasted on the Build page replaces the bundled baseline for this preset
        const csv = config?.regionBinding?.presetId === scene.presetId ? config.regionBinding.baselineCsv : undefined;
        try { setBaseline(csv ? parseBaselineCsv(csv, g.features, scene.presetId).baseline : b); } catch { setBaseline(b); }
      })
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [scene?.presetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const partyIds = useMemo(() => config?.parties.map((p) => p.id) ?? [], [config]);
  const partyById = useMemo(() => Object.fromEntries((config?.parties ?? []).map((p) => [p.id, p])), [config]);

  const base = useMemo(() => {
    if (aggregate === 'draw' && drawn) return drawn;
    return Object.fromEntries((baseCalcResults ?? []).map((r) => [r.partyId, r.percentage]));
  }, [aggregate, drawn, baseCalcResults]);

  // regions taking part -> engine inputs -> plan
  const { plan, mapping } = useMemo(() => {
    if (!config) return { plan: null, mapping: {} as Record<string, string | null> };
    if (!scene) {
      const rng = (i: number) => 500 + ((i * 7919) % 4000);
      const synth: UnitInput[] = Array.from({ length: 120 }, (_, i) => ({ id: `u${i}`, name: `Unit ${i + 1}`, votes: rng(i) }));
      return { plan: buildReturnsPlan(partyIds, base, synth, {}, { seed: `${config.id}-${seedN}`, noise: NOISE[noise] }), mapping: {} };
    }
    if (!geo || !baseline) return { plan: null, mapping: {} };
    const feats = geo.features.filter((f) => isParticipant(f, scene.participants));
    const map = matchPartiesToBaseline(config.parties, baseline.keys);
    // regions with no result in the baseline (e.g. an obec that merged) still vote, weighted 1
    const { units, prevNational } = unitsFromBaseline(feats.map((f) => f.properties), baseline, map);
    return { plan: buildReturnsPlan(partyIds, base, units, prevNational, { seed: `${config.id}-${scene.presetId}-${seedN}`, noise: NOISE[noise] }), mapping: map };
  }, [config, scene, geo, baseline, base, partyIds, noise, seedN]);

  const snap = useMemo(() => (plan ? snapshotAt(plan, t) : null), [plan, t]);

  // playback clock
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let acc = 0;
    const step = (now: number) => {
      acc += now - last;
      last = now;
      if (acc >= 100) { // ~10 snapshots/s is plenty and keeps 2.9k-region maps smooth
        const dt = acc / 1000; acc = 0;
        setT((v) => {
          const n = Math.min(1, v + (dt * speed) / DURATION_S);
          if (n >= 1) setPlaying(false);
          return n;
        });
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, speed]);

  const fills = useMemo(() => {
    const out: Record<string, string> = {};
    if (!snap) return out;
    for (const u of snap.units) {
      if (!u.leader) continue;
      const p = partyById[u.leader];
      if (!p) continue;
      const strength = 0.4 + 0.6 * Math.min(1, u.margin * 3.5);
      out[u.id] = rgba(onDark(p.color), strength * (0.72 + 0.28 * u.f));
    }
    return out;
  }, [snap, partyById]);

  const groups = useGroups(geo);

  if (!config || !baseCalcResults) return <Navigate to="/build" replace />;

  const pct = snap?.pctReporting ?? 0;
  const ranked = snap?.ranked ?? [];
  const margin = ranked.length > 1 ? ranked[0].pct - ranked[1].pct : 0;
  const total = plan?.units.length ?? 0;
  const done = snap?.regionsComplete ?? 0;
  const called = t >= 1 || (pct > 0.55 && margin > 0.08 && done > 10);
  const preset = presetById(presetId);
  const unitWord = preset?.unit ?? 'unit';
  const hover = hoverId && snap && plan ? { u: snap.units.find((x) => x.id === hoverId), p: plan.units.find((x) => x.id === hoverId) } : null;

  const reset = () => { setPlaying(false); setT(0); setSeedN((n) => n + 1); };
  const drawScenario = () => {
    const { outcomes } = runProbCalc(config.parties, baseCalcResults, { simulations: 1, beta: 1, dateWeighting: { enabled: true, divisor: 100 } });
    setDrawn(outcomes[0].values);
    setAggregate('draw');
    setT(0);
    setPlaying(false);
  };
  const attach = (id: string) => {
    setPresetId(id);
    setFocus('all');
    setT(0);
    setPlaying(false);
    if (id !== 'abstract') setConfig({ ...config, regionBinding: { presetId: id, participants: 'all' } });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full bg-red-call ${playing || (t > 0 && !called) ? 'pulse-live' : ''}`} />
        <span className="font-data text-xs tracking-widest text-red-call uppercase">
          {called ? 'Race called' : t === 0 ? 'Standing by' : 'Live'}
        </span>
      </div>
      <h1 className="font-display font-800 text-3xl mb-1">Election Night — {config.title}</h1>
      <p className="text-ink-muted mb-6 max-w-3xl">
        Simulated returns at the smallest division we have data for. Each region's expected result is your aggregate plus how that region
        leaned in the previous election (guide III.II), then drawn with local noise and counted in batches.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-5">
        <label className="text-xs font-data uppercase text-ink-dim">
          Geography
          <select value={presetId} onChange={(e) => attach(e.target.value)} className="block mt-1 bg-panel-raised border border-hairline rounded px-3 py-2 text-sm normal-case text-ink">
            <option value="abstract">Abstract grid (no geography)</option>
            {REGION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {groups.length > 1 && (
          <label className="text-xs font-data uppercase text-ink-dim">
            Participating {preset?.groupLabel.toLowerCase()}
            <select value={focus} onChange={(e) => { setFocus(e.target.value); setT(0); setPlaying(false); }} className="block mt-1 bg-panel-raised border border-hairline rounded px-3 py-2 text-sm normal-case text-ink max-w-[14rem]">
              <option value="all">{binding?.presetId === presetId && binding.participants !== 'all' ? 'As configured' : 'All'}</option>
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

      {scene && baseline && (
        <p className="text-ink-dim text-xs font-data mb-4 max-w-4xl">
          <span className={`inline-block px-1.5 py-0.5 rounded mr-2 uppercase ${baseline.kind === 'measured' ? 'bg-cyan/15 text-cyan' : baseline.kind === 'modelled' ? 'bg-gold/15 text-gold' : 'bg-panel-raised text-ink-muted'}`}>
            baseline: {baseline.kind}
          </span>
          {baseline.kind === 'none' ? preset?.baselineNote : baseline.source}
          {scene.drilled && ' · drilled down to House districts'}
          {baseline.kind !== 'none' && Object.values(mapping).some((v) => v === null) &&
            ` · no previous-result column for ${config.parties.filter((p) => mapping[p.id] === null).map((p) => p.shortName).join(', ')} (they take the aggregate unadjusted)`}
        </p>
      )}
      {loadError && <p className="text-red-call text-sm font-data mb-4">Could not load geography: {loadError}</p>}

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-panel border border-hairline rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-700 text-lg">{scene ? `${plural(unitWord)[0].toUpperCase()}${plural(unitWord).slice(1)} reporting` : 'Units reporting'}</h2>
            <span className="font-data text-sm text-ink-muted">{done.toLocaleString()} / {total.toLocaleString()} complete · {(pct * 100).toFixed(0)}% of votes</span>
          </div>

          {scene ? (
            geo && plan ? (
              <div className="relative">
                <GeoMap geo={geo} participants={scene.participants} fills={fills} onHover={setHoverId} hoverId={hoverId} />
                {hover?.u && hover.p && (
                  <div className="absolute left-3 bottom-3 bg-panel-raised/95 border border-hairline-bright rounded px-3 py-2 text-xs font-data pointer-events-none min-w-[11rem]">
                    <div className="text-ink font-medium">{hover.p.name}</div>
                    {hover.p.group && <div className="text-ink-dim">{hover.p.group}</div>}
                    <div className="text-ink-dim mt-1">{(hover.u.f * 100).toFixed(0)}% counted · {Math.round(hover.p.votes).toLocaleString()} votes</div>
                    {hover.u.leader && Object.entries(hover.u.shares).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => (
                      <div key={id} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: onDark(partyById[id]?.color) }} /><span>{partyById[id]?.shortName}</span><span className="ml-auto">{(v * 100).toFixed(1)}%</span></div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-ink-dim text-sm font-data">{loadError ? '—' : `Loading ${preset?.label}…`}</div>
            )
          ) : (
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(15, 1fr)' }}>
              {plan?.units.map((u) => {
                const s = snap?.units.find((x) => x.id === u.id);
                return <div key={u.id} className="aspect-square rounded-[2px]" style={{ background: fills[u.id] ?? '#1a2233' }} title={s?.leader ? partyById[s.leader]?.name : undefined} />;
              })}
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
                      {scene && (snap?.leads[r.id] ?? 0) > 0 && (
                        <span className="text-ink-dim text-xs mr-2" title={`${plural(unitWord)} currently led`}>{snap!.leads[r.id]} {config.votingSystem === 'FPTP' ? 'seats' : plural(unitWord)}</span>
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
          {preset && <p className="text-ink-dim text-[10px] font-data mt-3 leading-snug">{preset.attribution}</p>}
          {!scene && (
            <p className="text-ink-dim text-xs mt-4">No geography attached — pick one above so returns land on real boundaries, or <Link to="/build" className="text-cyan hover:underline">set it on the Build page</Link>.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function useGroups(geo: LoadedGeometry | null): string[] {
  return useMemo(() => (geo ? [...new Set(geo.features.map((f) => f.properties.group).filter((g): g is string => !!g))].sort() : []), [geo]);
}
export { emptyBaseline };
