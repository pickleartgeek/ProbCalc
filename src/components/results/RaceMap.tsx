import { useMemo, useRef } from 'react';
import type { ElectionConfig } from '../../lib/types';
import { useEngine } from '../../state/store';
import type { GeoScene } from '../../hooks/useGeoScene';
import { usePrecinctState } from '../../hooks/usePrecinctState';
import { matchPartiesToBaseline } from '../../lib/geo/partyMatch';
import { buildReturnsPlan, isTwoPartyBaseline, shiftDisplay, swingRows, unitsFromBaseline, type ReturnsPlan } from '../../lib/geo/returns';
import { encodeLeader, makeLeaderScale } from '../../lib/geo/forecast';
import { onDark } from '../../lib/partyColors';
import { PrecinctCanvas } from '../precinct/PrecinctCanvas';
import { prettyPrecinctId } from '../precinct/PrecinctTooltip';
import { USPrecinctMap } from '../USPrecinctMap';
import { PlaceholderMap } from '../PlaceholderMap';
import { GeoMap } from '../geo/GeoMap';
import { BaselineShiftTable } from './BaselineShiftTable';

interface Props {
  config: ElectionConfig;
  mode: 'base' | 'prob';
  /** the national/statewide aggregate to distribute: BaseCalc shares, or one ProbCalc draw's shares */
  aggregate: Record<string, number>;
  scene: GeoScene;
  /** bump for a fresh regional draw in ProbCalc mode */
  drawKey: number;
  /** what the abstract mosaic shows when no geography is attached (ProbCalc: win probabilities) */
  mosaicShares?: Record<string, number>;
}

const pct = (v: number | undefined) => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);

/**
 * The map on both Results views. What it shows depends on what the race is attached to:
 *   - a single US state  -> that state's REAL 2024 precincts, shifted by how far your aggregate sits from 2024
 *   - the whole US       -> the national choropleth with drill-down (real 2024 returns / a fresh simulation)
 *   - DE / SK / BG / …   -> the preset's regions, expected result = aggregate + each region's previous-election lean
 *   - nothing attached   -> the abstract district mosaic
 * BaseCalc mode shows the deterministic expectation; ProbCalc mode shows one sampled draw of the night.
 */
export function RaceMap({ config, mode, aggregate, scene, drawKey, mosaicShares }: Props) {
  const binding = config.regionBinding;
  const usSingle = binding?.presetId === 'us-states' && binding.participants !== 'all' && binding.participants.length === 1 ? binding.participants[0] : null;
  const usNational = binding?.presetId === 'us-states' || config.region === 'United States';

  if (usSingle) return <PrecinctForecast abbr={usSingle} {...{ config, mode, aggregate, scene, drawKey }} />;
  if (usNational) return <USPrecinctMap mode={mode} />;
  if (scene.scene && scene.geo && scene.baseline) return <GeoForecast {...{ config, mode, aggregate, scene, drawKey }} />;
  if (scene.loading) return <div className="h-64 flex items-center justify-center text-ink-dim text-sm font-data">Loading map…</div>;
  return <PlaceholderMap parties={config.parties} shares={mosaicShares ?? aggregate} mode={mode} />;
}

// ---------------------------------------------------------------------------------------------------------------

/** plan + colour values shared by the precinct and region forecasts */
function useForecast(config: ElectionConfig, mode: 'base' | 'prob', aggregate: Record<string, number>, seed: string, units: ReturnType<typeof unitsFromBaseline>) {
  return useMemo(() => {
    const partyIds = config.parties.map((p) => p.id);
    if (units.units.length === 0) return null;
    const plan: ReturnsPlan = buildReturnsPlan(partyIds, aggregate, units.units, units.prevNational, { seed, noise: 90 });
    const scale = makeLeaderScale(config.parties.map((p) => onDark(p.color)));
    const shares = (i: number) => (mode === 'base' ? plan.units[i].expected : plan.units[i].final);
    const index = new Map(plan.units.map((u, i) => [u.id, i]));
    return { plan, scale, shares, index, partyIds };
  }, [config.parties, mode, aggregate, seed, units]);
}

function Legend({ config }: { config: ElectionConfig }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-data mt-2">
      {config.parties.slice(0, 8).map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1 text-ink-muted"><span className="w-2 h-2 rounded-sm" style={{ background: onDark(p.color) }} />{p.shortName}</span>
      ))}
      <span className="text-ink-dim">· darker = closer</span>
    </div>
  );
}

function useRemap(config: ElectionConfig) {
  const { setRegionBinding } = useEngine();
  return (partyId: string, key: string | null) => {
    const b = config.regionBinding;
    if (b) setRegionBinding({ ...b, partyMap: { ...(b.partyMap ?? {}), [partyId]: key } });
  };
}

function TooltipBody({ name, sub, config, forecast, i, prev, mapping, twoParty }: { name: string; sub?: string; config: ElectionConfig; forecast: NonNullable<ReturnType<typeof useForecast>>; i: number; prev?: Record<string, number>; mapping: Record<string, string | null>; twoParty: boolean }) {
  const sh = forecast.shares(i);
  const disp = shiftDisplay(forecast.partyIds, sh, prev, mapping, twoParty);
  const rows = [...config.parties].sort((a, b) => (sh[b.id] ?? 0) - (sh[a.id] ?? 0)).slice(0, 4);
  return (
    <div>
      <div className="text-ink font-semibold leading-tight">{name}</div>
      {sub && <div className="text-ink-dim text-[10px]">{sub}</div>}
      <div className="mt-1 space-y-0.5">
        {rows.map((p) => {
          const { now, before, delta: d } = disp[p.id] ?? { now: sh[p.id] ?? 0 };
          return (
            <div key={p.id} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: onDark(p.color) }} />
              <span className="text-ink-muted">{p.shortName}</span>
              <span className="ml-auto pl-3 text-right whitespace-nowrap">
                {before !== undefined && <span className="text-ink-dim mr-1.5">{pct(before)} →</span>}
                {pct(now)}
                {d !== undefined && <span className={`ml-1 ${d > 0.05 ? 'text-green-400' : d < -0.05 ? 'text-red-call' : 'text-ink-dim'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrecinctForecast({ abbr, config, mode, aggregate, scene, drawKey }: { abbr: string } & Props) {
  const ps = usePrecinctState(abbr);
  const remap = useRemap(config);
  const partyMap = config.regionBinding?.partyMap;

  const mapping = useMemo(
    () => (ps.baseline ? { ...matchPartiesToBaseline(config.parties, ps.baseline.keys), ...(partyMap ?? {}) } : {}),
    [config.parties, ps.baseline, partyMap]
  );
  const units = useMemo(() => {
    if (!ps.baseline) return { units: [], prevNational: {} };
    const regions = ps.results.map((r) => { const { county, name } = prettyPrecinctId(r.id); return { id: r.id, name, group: county }; });
    return unitsFromBaseline(regions, ps.baseline, mapping);
  }, [ps.results, ps.baseline, mapping]);
  const forecast = useForecast(config, mode, aggregate, `${config.id}-${abbr}-${drawKey}`, units);

  // colour values per precinct; version bumps only when they are recomputed, which is what tells the canvas to repaint
  const version = useRef(0);
  const values = useMemo(() => {
    version.current++;
    const out: Record<string, number | undefined> = {};
    if (forecast) forecast.plan.units.forEach((u, i) => { out[u.id] = encodeLeader(forecast.partyIds, forecast.shares(i)); });
    return out;
  }, [forecast]);

  if (ps.error) return <GeoFallback why={`No precinct file for ${abbr} (${ps.error}) — showing districts instead.`} {...{ config, mode, aggregate, scene, drawKey }} />;
  const rows = forecast ? swingRows(forecast.partyIds, aggregate, mapping, units.prevNational, { twoParty: isTwoPartyBaseline(ps.baseline?.keys ?? []) }) : [];

  return (
    <div>
      <div className="relative rounded-lg overflow-hidden border border-hairline" style={{ height: 420 }}>
        {(ps.loading || !forecast) && <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/70 font-data text-sm text-ink-muted">loading {abbr} precincts…</div>}
        {ps.layer && forecast && (
          <PrecinctCanvas
            layer={ps.layer}
            colorScale={(v) => forecast.scale(v)}
            values={values}
            drawVersion={version.current}
            background="#0a0e17"
            tooltip={(f) => {
              const i = forecast.index.get(f.id);
              const real = ps.resultsById.get(f.id);
              if (i === undefined) return <span className="text-ink-dim">no data</span>;
              const { county, name } = prettyPrecinctId(f.id);
              return <TooltipBody name={name} sub={`${county ? `county ${county} · ` : ''}${Math.round(real?.total ?? 0).toLocaleString()} votes in 2024`} config={config} forecast={forecast} i={i} prev={units.units[i]?.prev} mapping={mapping} twoParty={isTwoPartyBaseline(ps.baseline?.keys ?? [])} />;
            }}
          />
        )}
      </div>
      <p className="text-ink-dim text-[11px] font-data mt-2">
        Real 2024 precincts, each shifted by how far your {mode === 'base' ? 'BaseCalc average' : 'simulated draw'} sits from 2024 statewide — hover for before → now. Scroll or +/− to zoom, drag to pan.
      </p>
      <Legend config={config} />
      {forecast && <div className="mt-4"><BaselineShiftTable parties={config.parties} rows={rows} keys={ps.baseline?.keys ?? []} onRemap={remap} source={ps.baseline?.source} twoParty={isTwoPartyBaseline(ps.baseline?.keys ?? [])} /></div>}
    </div>
  );
}

function GeoFallback({ why, ...rest }: { why: string } & Props) {
  return (
    <div>
      <p className="text-gold text-xs font-data mb-2">{why}</p>
      <GeoForecast {...rest} />
    </div>
  );
}

function GeoForecast({ config, mode, aggregate, scene, drawKey }: Props) {
  const remap = useRemap(config);
  const units = useMemo(() => ({ units: scene.units, prevNational: scene.prevNational }), [scene.units, scene.prevNational]);
  const forecast = useForecast(config, mode, aggregate, `${config.id}-${scene.scene?.presetId}-${drawKey}`, units);

  const fills = useMemo(() => {
    const out: Record<string, string> = {};
    if (forecast) forecast.plan.units.forEach((u, i) => { const v = encodeLeader(forecast.partyIds, forecast.shares(i)); if (v !== undefined) out[u.id] = forecast.scale(v); });
    return out;
  }, [forecast]);

  if (!scene.geo || !scene.scene || !scene.baseline) return <div className="h-64 flex items-center justify-center text-ink-dim text-sm font-data">{scene.error ?? 'Loading map…'}</div>;
  const rows = forecast ? swingRows(forecast.partyIds, aggregate, scene.mapping, scene.prevNational, { twoParty: isTwoPartyBaseline(scene.baseline.keys) }) : [];
  const unit = scene.scene.presetId === 'us-house' ? 'district' : scene.geo.preset.unit;

  return (
    <div>
      <GeoMap
        geo={scene.geo}
        participants={scene.scene.participants}
        fills={fills}
        tooltip={(id) => {
          const i = forecast?.index.get(id);
          const f = scene.features.find((x) => x.properties.id === id);
          if (i === undefined || !forecast || !f) return <span className="text-ink-dim">no data</span>;
          return <TooltipBody name={f.properties.name} sub={f.properties.group} config={config} forecast={forecast} i={i} prev={scene.units[i]?.prev} mapping={scene.mapping} twoParty={isTwoPartyBaseline(scene.baseline?.keys ?? [])} />;
        }}
      />
      <p className="text-ink-dim text-[11px] font-data mt-2">
        Each {unit} = your {mode === 'base' ? 'BaseCalc average' : 'simulated draw'} + how that {unit} leaned in the previous election. Hover for before → now.
      </p>
      <Legend config={config} />
      {forecast && <div className="mt-4"><BaselineShiftTable parties={config.parties} rows={rows} keys={scene.baseline.keys} onRemap={remap} source={scene.baseline.source} twoParty={isTwoPartyBaseline(scene.baseline.keys)} /></div>}
    </div>
  );
}
