import { useEffect, useMemo, useRef, useState } from 'react';
import { PrecinctCanvas } from './precinct/PrecinctCanvas';
import { loadTopoLayer } from '../lib/precinct/loadTopo';
import {
  extractBakedResults,
  simulatePrecinct,
  twoPoleMarginScale,
  type PrecinctResult,
} from '../lib/precinct/results';
import { sampleGamma } from '../lib/gamma';
import { FIPS_TO_USPS, USPS_TO_NAME } from '../lib/usStates';
import { feature as topoFeature } from 'topojson-client';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import usStatesTopo from '../data/us-states-10m.json';
import { PrecinctTooltip } from './precinct/PrecinctTooltip';
import type { ProjectedFeature } from '../lib/precinct/types';

interface ManifestEntry {
  state: string;
  precincts: number;
  votes_dem?: number;
  votes_rep?: number;
  votes_total?: number;
}

const WIDTH = 900;
const HEIGHT = 520;
const REP_COLOR = '#ea4b4b';
const DEM_COLOR = '#3b82f6';
const colorScale = twoPoleMarginScale('REP', 'DEM', REP_COLOR, DEM_COLOR);

interface Props {
  /** 'base' = real 2024 precinct results. 'prob' = a fresh precinct-level ProbCalc draw. */
  mode: 'base' | 'prob';
  /** Open straight into this state's precincts (a state-bound race) instead of the national choropleth. */
  initialState?: string;
}

export function USPrecinctMap({ mode, initialState }: Props) {
  const [manifest, setManifest] = useState<ManifestEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(initialState ?? null);
  useEffect(() => { if (initialState) setSelected(initialState); }, [initialState]);
  const [results, setResults] = useState<PrecinctResult[] | null>(null);
  const [rawLayer, setRawLayer] = useState<Awaited<ReturnType<typeof loadTopoLayer>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [simTick, setSimTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef(0);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/precincts/manifest.json`)
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => setManifest([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const myRun = ++abortRef.current;
    setLoading(true);
    setResults(null);
    setPinned(null);
    setLoadError(null);
    // Was previously an unhandled rejection on failure — a state whose file
    // was slow, malformed, or briefly unavailable (CA's ~51MB is by far the
    // largest of any state, so it's the most likely to hit a real-world
    // hiccup) would just silently never render anything, with no error
    // visible anywhere. Now it surfaces.
    loadTopoLayer(`${import.meta.env.BASE_URL}data/precincts/${selected}.json`, 'tiles', {
      idProperty: 'GEOID',
      width: WIDTH,
      height: HEIGHT,
    })
      .then((layer) => {
        if (abortRef.current !== myRun) return;
        setRawLayer(layer);
        setResults(
          extractBakedResults(
            layer.features.map((f) => ({ properties: f.properties })),
            { idProperty: 'GEOID' }
          )
        );
      })
      .catch((err) => {
        if (abortRef.current !== myRun) return;
        console.error(`Failed to load precincts for ${selected}:`, err);
        setLoadError(err instanceof Error ? err.message : String(err));
        setRawLayer(null);
        setResults(null);
      })
      .finally(() => {
        if (abortRef.current === myRun) setLoading(false);
      });
  }, [selected]);

  // Real result -> simulated result, re-rolled whenever simTick changes
  // (the "Draw new simulation" button). Every precinct gets its OWN
  // independent gamma draw off its own real vote counts — the guide's
  // ProbCalc math (II.II), applied at precinct scale instead of national-poll
  // scale, so a swing state's tossup precincts visibly flip between draws
  // while a 90%+ precinct almost never does.
  const displayResults = useMemo(() => {
    if (!results) return null;
    if (mode === 'base') return results;
    return results.map((r) => {
      const simShares = simulatePrecinct(r.candidates, sampleGamma);
      const simVotes = Object.fromEntries(Object.entries(simShares).map(([k, v]) => [k, v * (r.total || 1)]));
      return { ...r, candidates: simVotes };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, mode, simTick]);

  const resultsById = useMemo(() => new Map((displayResults ?? []).map((r) => [r.id, r])), [displayResults]);

  const [pinned, setPinned] = useState<{ feature: ProjectedFeature; x: number; y: number } | null>(null);
  const pinnedResult = pinned ? resultsById.get(pinned.feature.id) : null;

  // Was rebuilt as a brand-new array/object on every render (including every
  // mousemove-driven hover update) — PrecinctCanvas's "don't re-fit if it's
  // the same layer" check compares object identity, so a fresh object every
  // frame meant it re-fit (resetting pan/zoom) constantly, most noticeably
  // right as you stopped interacting to click something. Memoizing on the
  // actual data dependencies fixes that: identity only changes when the
  // precinct data or results genuinely change. Must live above the
  // `if (selected)` branch below — hooks can't be called conditionally.
  const layerForCanvas = useMemo(
    () =>
      rawLayer
        ? { ...rawLayer, features: rawLayer.features.map((f) => ({ ...f, properties: { ...f.properties, result: resultsById.get(f.id) } })) }
        : null,
    [rawLayer, resultsById]
  );

  const stateAggregate = useMemo(() => {
    if (!displayResults) return null;
    const sums: Record<string, number> = {};
    for (const r of displayResults) for (const [c, v] of Object.entries(r.candidates)) sums[c] = (sums[c] ?? 0) + v;
    return sums;
  }, [displayResults]);

  // National choropleth (entry view before a state is picked) — colored by
  // each state's REAL aggregate margin from the manifest, computed once
  // when the full precinct set was split (see scripts/split-precincts-by-state.mjs).
  const nationalPaths = useMemo(() => {
    const topology = usStatesTopo as any;
    const geo = topoFeature(topology, topology.objects.states) as unknown as FeatureCollection<Geometry>;
    const projection = geoAlbersUsa().fitSize([WIDTH, HEIGHT], geo as any);
    const pathGen = geoPath(projection);
    const byUsps = new Map((manifest ?? []).map((m) => [m.state, m]));
    return geo.features.map((f) => {
      const fips = String((f as any).id).padStart(2, '0');
      const usps = FIPS_TO_USPS[fips];
      const m = usps ? byUsps.get(usps) : undefined;
      let fill = '#1a2233';
      if (m && m.votes_dem != null && m.votes_rep != null) {
        fill = colorScale({ id: usps!, candidates: { REP: m.votes_rep, DEM: m.votes_dem }, total: m.votes_total ?? 0, winner: null, leaderShare: null, margin: null, classification: null });
      }
      return { usps, name: USPS_TO_NAME[usps ?? ''] ?? (f.properties as any)?.name, d: pathGen(f as any) ?? '', hasData: !!m, fill };
    });
  }, [manifest]);

  if (selected) {

    return (
      <div>
        <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
          <button onClick={() => setSelected(null)} className="text-cyan text-xs font-data hover:underline">
            ← back to national map
          </button>
          <span className="font-display font-700 text-sm">{USPS_TO_NAME[selected] ?? selected}</span>
          {mode === 'prob' && (
            <button
              onClick={() => setSimTick((t) => t + 1)}
              className="px-2.5 py-1 rounded text-xs font-data bg-gold text-void font-semibold hover:brightness-95"
            >
              Draw new simulation
            </button>
          )}
        </div>

        <div className="relative rounded-lg overflow-hidden border border-hairline" style={{ height: 420 }}>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/70 font-data text-sm text-ink-muted">
              loading precincts…
            </div>
          )}
          {loadError && !loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-void/90 font-data text-sm text-red-call px-6 text-center">
              <span>Failed to load {selected}: {loadError}</span>
              <button
                onClick={() => setSelected((s) => (s ? `${s}` : s))}
                className="text-ink-dim hover:text-ink text-xs underline"
              >
                (check the browser console for details, or try re-selecting the state)
              </button>
            </div>
          )}
          <PrecinctCanvas
            layer={layerForCanvas}
            colorScale={(_, f) => colorScale((f.properties as { result?: PrecinctResult }).result)}
            tooltip={(f) => <PrecinctTooltip result={resultsById.get(f.id)} mode={mode} />}
            drawVersion={simTick}
            onClick={(f, event) => {
              const rect = (event.currentTarget as HTMLElement).getBoundingClientRect?.();
              setPinned({
                feature: f,
                x: event.clientX - (rect?.left ?? 0),
                y: event.clientY - (rect?.top ?? 0),
              });
            }}
            background="#0a0e17"
          />
          {pinned && pinnedResult && (
            <div
              className="absolute z-20 bg-panel-raised border border-hairline-bright rounded-md shadow-lg px-3 py-2 text-xs font-data pointer-events-none max-w-[220px]"
              style={{
                left: Math.min(pinned.x + 12, 900 - 230),
                top: Math.max(pinned.y - 12, 8),
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-ink font-semibold">Precinct {pinnedResult.id}</span>
                <button
                  onClick={() => setPinned(null)}
                  className="pointer-events-auto text-ink-dim hover:text-ink leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              {Object.entries(pinnedResult.candidates)
                .sort((a, b) => b[1] - a[1])
                .map(([name, v]) => (
                  <div key={name} className="flex justify-between gap-4">
                    <span className="text-ink-dim">{name}</span>
                    <span>
                      {mode === 'prob' ? `${((v / (pinnedResult.total || 1)) * 100).toFixed(1)}%` : Math.round(v).toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4 mt-3 text-xs font-data">
          <div className="flex-1 min-w-[160px]">
            <p className="text-ink-dim uppercase tracking-wide mb-1">Precinct detail</p>
            <p className="text-ink-dim">hover for votes · click to pin · scroll or +/− to zoom, drag to pan</p>
          </div>
          {stateAggregate && (
            <div className="flex-1 min-w-[160px]">
              <p className="text-ink-dim uppercase tracking-wide mb-1">
                {mode === 'prob' ? 'Simulated statewide' : `Real 2024 result (${results?.length} precincts)`}
              </p>
              <div className="space-y-0.5">
                {Object.entries(stateAggregate)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, v]) => {
                    const total = Object.values(stateAggregate).reduce((a, b) => a + b, 0);
                    return (
                      <div key={name} className="flex justify-between gap-4">
                        <span className="text-ink-dim">{name}</span>
                        <span>{total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '—'}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" style={{ background: '#0a0e17' }}>
        {nationalPaths.map((p) => (
          <path
            key={p.usps ?? p.name}
            d={p.d}
            fill={p.fill ?? '#1a2233'}
            stroke="#0a0e17"
            strokeWidth={0.75}
            className={p.hasData ? 'cursor-pointer hover:brightness-110 transition-[filter]' : 'opacity-40'}
            onClick={() => p.hasData && p.usps && setSelected(p.usps)}
          >
            <title>{p.name}{p.hasData ? ' — click to open precincts' : ' — no precinct file shipped'}</title>
          </path>
        ))}
      </svg>
      <p className="text-ink-dim text-[11px] font-data mt-2 text-center">
        real 2024 precinct returns — click a state to drill in
        {manifest && manifest.length > 0 && ` · ${manifest.length} states loaded`}
      </p>
    </div>
  );
}
