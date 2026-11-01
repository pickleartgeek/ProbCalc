import { useEffect, useMemo, useRef, useState } from 'react';
import { PrecinctCanvas } from './PrecinctCanvas';
import { loadTopoLayer } from '../../lib/precinct/loadTopo';
import { aggregateTwoPartyMargin, applyUniformSwing, extractBakedResults, type PrecinctResult } from '../../lib/precinct/results';
import { marginColor, ratingColorFromMargin, winnerColor, UNIT_VIEWS, type UnitView } from '../../lib/midterms/mapViews';
import { UnitViewToggle, UnitLegend } from '../midterms/MapViewToggle';
import { USPS_TO_NAME } from '../../lib/usStates';
import { PrecinctTooltip } from './PrecinctTooltip';

/** Colour of one county / precinct for the chosen view, from its (real or simulated) Republican and Democratic votes. */
function unitColor(result: PrecinctResult | undefined, view: UnitView): string {
  if (!result || result.total === 0) return '#1a2233';
  const r = result.candidates['REP'] ?? 0;
  const d = result.candidates['DEM'] ?? 0;
  if (r + d === 0) return '#8b8fa3';
  const marginPts = ((r - d) / (r + d)) * 100; // two-party margin, R positive
  if (view === 'rating') return ratingColorFromMargin(marginPts);
  if (view === 'winner') return winnerColor(marginPts);
  return marginColor(marginPts, 40);
}
const VIEW_KEY = 'probcalc:unitview';
const readView = (): UnitView => {
  try { const v = localStorage.getItem(VIEW_KEY); return v === 'rating' || v === 'winner' ? v : 'margin'; } catch { return 'margin'; }
};

/** County tooltip: the county's name as the title, with how many precincts were rolled into it in place of the (precinct-only) "county NNNNN" line. */
function countyTitle(props: Record<string, unknown>, r: PrecinctResult | undefined) {
  const n = Number(props.precincts);
  return { title: String(props.name ?? r?.id ?? ''), extra: Number.isFinite(n) ? <div className="text-ink-dim text-[10px] mb-1">{n.toLocaleString()} precinct{n === 1 ? '' : 's'} · {Math.round(r?.total ?? 0).toLocaleString()} votes</div> : undefined, hideCountyLine: true };
}
const gcbLabel = (m: number) => (Math.abs(m) < 0.05 ? 'EVEN' : m > 0 ? `R+${m.toFixed(1)}` : `D+${Math.abs(m).toFixed(1)}`);

interface Props {
  stateAbbr: string;
  /** Fixed panel height in px. */
  height?: number;
  /**
   * When given, the panel opens on a SIMULATED result: the real 2024 precincts, uniformly swung (see
   * applyUniformSwing) from their own real 2024 two-party margin to `targetMarginR` — this race's BaseCalc/rating-
   * derived 2026 margin (R positive). `label` names the race for the toggle/caption. A reader can always flip back
   * to the real 2024 count with the toggle; the two are never blended.
   */
  simulate?: { targetMarginR: number; label: string } | null;
  /** 'precinct' (default) reads data/precincts/<ST>.json; 'county' reads data/counties/<ST>.json — the same precincts rolled up by build-counties.mjs. */
  unit?: 'precinct' | 'county';
}

/**
 * Drops the actual real 2024 precinct geometry (not just the state's
 * aggregate margin) into any page that already knows which state a person
 * is looking at — same topojson + PrecinctCanvas the Results page's
 * national precinct map uses, just scoped to one state and without the
 * national-choropleth entry view.
 */
export function StatePrecinctPanel({ stateAbbr, height = 360, simulate, unit = 'precinct' }: Props) {
  const isCounty = unit === 'county';
  const [layer, setLayer] = useState<Awaited<ReturnType<typeof loadTopoLayer>> | null>(null);
  const [results, setResults] = useState<PrecinctResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const abortRef = useRef(0);
  const [view, setViewState] = useState<UnitView>(readView);
  const setView = (v: UnitView) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ } };
  // Defaults to the simulated view whenever a race is wired up; always available to flip back to the real count.
  const [mode, setMode] = useState<'real' | 'simulated'>(simulate ? 'simulated' : 'real');
  const simulateLabel = simulate?.label ?? null;
  useEffect(() => { setMode(simulateLabel !== null ? 'simulated' : 'real'); }, [stateAbbr, simulateLabel]);

  useEffect(() => {
    const myRun = ++abortRef.current;
    setLoading(true);
    setError(false);
    setLayer(null);
    setResults(null);
    loadTopoLayer(`${import.meta.env.BASE_URL}data/${isCounty ? 'counties' : 'precincts'}/${stateAbbr}.json`, 'tiles', {
      idProperty: 'GEOID',
      width: 900,
      height: 520,
    })
      .then((l) => {
        if (abortRef.current !== myRun) return;
        setLayer(l);
        setResults(extractBakedResults(l.features.map((f) => ({ properties: f.properties })), { idProperty: 'GEOID', metaFields: ['name', 'precincts'] }));
      })
      .catch(() => {
        if (abortRef.current === myRun) setError(true);
      })
      .finally(() => {
        if (abortRef.current === myRun) setLoading(false);
      });
    return () => {
      abortRef.current++;
    };
  }, [stateAbbr, isCounty]);

  // The real 2024 statewide two-party margin, measured straight off these same precincts — the baseline the swing
  // is measured from, so the simulation is self-consistent with whatever this state's actual file contains rather
  // than a separately-computed PVI that might disagree with it by a point or two.
  const baselineMarginR = useMemo(() => (results ? aggregateTwoPartyMargin(results, 'REP', 'DEM') : null), [results]);
  const swingDelta = simulate && baselineMarginR != null ? simulate.targetMarginR - baselineMarginR : null;
  const showingSimulated = mode === 'simulated' && !!simulate && swingDelta != null;
  const displayResults = useMemo(
    () => (showingSimulated && results ? applyUniformSwing(results, swingDelta!, 'REP', 'DEM') : results),
    [showingSimulated, results, swingDelta]
  );

  // Memoised: a fresh layer object on every render is what used to snap the zoom back on every hover.
  const resultsById = useMemo(() => new Map((displayResults ?? []).map((r) => [r.id, r])), [displayResults]);
  const layerForCanvas = useMemo(
    () => (layer ? { ...layer, features: layer.features.map((f) => ({ ...f, properties: { ...f.properties, result: resultsById.get(f.id) } })) } : null),
    [layer, resultsById]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div>
          <h3 className="font-display font-700 text-base">
            {USPS_TO_NAME[stateAbbr] ?? stateAbbr} &middot; {showingSimulated ? `simulated 2026 · ${simulate!.label}` : `real 2024 ${isCounty ? 'counties' : 'precincts'}`}
          </h3>
          {showingSimulated && (
            <p className="text-ink-dim text-[11px] font-data mt-0.5">
              real 2024 {isCounty ? 'county totals' : 'precincts'} ({gcbLabel(baselineMarginR!)}), uniformly swung {swingDelta! >= 0 ? '+' : ''}
              {swingDelta!.toFixed(1)}pts to this race's computed {gcbLabel(simulate!.targetMarginR)} &mdash; not a real 2026 count
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <UnitViewToggle value={view} onChange={setView} />
          {results && <span className="font-data text-xs text-ink-dim">{results.length.toLocaleString()} {isCounty ? 'counties' : 'precincts'}</span>}
          {simulate && baselineMarginR != null && (
            <button
              onClick={() => setMode((m) => (m === 'simulated' ? 'real' : 'simulated'))}
              className="px-2 py-0.5 rounded text-[11px] font-display font-700 border border-hairline-bright text-ink-muted hover:text-ink hover:border-gold/50"
            >
              {showingSimulated ? 'show real 2024' : 'show simulated 2026'}
            </button>
          )}
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-hairline" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/70 font-data text-sm text-ink-muted">
            loading {isCounty ? 'counties' : 'precincts'}…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/70 font-data text-sm text-ink-dim text-center px-6">
            no {isCounty ? 'county' : 'precinct'} file shipped for {stateAbbr}
          </div>
        )}
        <PrecinctCanvas
          layer={layerForCanvas}
          colorScale={(_, f) => unitColor((f.properties as { result?: PrecinctResult }).result, view)}
          drawVersion={UNIT_VIEWS.findIndex((u) => u.key === view)}
          tooltip={(f) => <PrecinctTooltip result={resultsById.get(f.id)} {...(isCounty ? countyTitle(f.properties, resultsById.get(f.id)) : {})} />}
          background="#0a0e17"
        />
      </div>

      <div className="mt-2"><UnitLegend view={view} /></div>
      <p className="mt-2 font-data text-xs text-ink-dim">
        hover a {isCounty ? 'county' : 'precinct'} for its {showingSimulated ? 'simulated' : 'real'} votes · scroll or +/− to zoom, drag to pan — the view stays where you put it
      </p>
    </div>
  );
}
