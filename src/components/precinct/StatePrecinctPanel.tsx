import { useEffect, useMemo, useRef, useState } from 'react';
import { PrecinctCanvas } from './PrecinctCanvas';
import { loadTopoLayer } from '../../lib/precinct/loadTopo';
import { aggregateTwoPartyMargin, applyUniformSwing, extractBakedResults, twoPoleMarginScale, type PrecinctResult } from '../../lib/precinct/results';
import { USPS_TO_NAME } from '../../lib/usStates';
import { PrecinctTooltip } from './PrecinctTooltip';

const REP_COLOR = '#ea4b4b';
const DEM_COLOR = '#3b82f6';
const colorScale = twoPoleMarginScale('REP', 'DEM', REP_COLOR, DEM_COLOR);
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
}

/**
 * Drops the actual real 2024 precinct geometry (not just the state's
 * aggregate margin) into any page that already knows which state a person
 * is looking at — same topojson + PrecinctCanvas the Results page's
 * national precinct map uses, just scoped to one state and without the
 * national-choropleth entry view.
 */
export function StatePrecinctPanel({ stateAbbr, height = 360, simulate }: Props) {
  const [layer, setLayer] = useState<Awaited<ReturnType<typeof loadTopoLayer>> | null>(null);
  const [results, setResults] = useState<PrecinctResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const abortRef = useRef(0);
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
    loadTopoLayer(`${import.meta.env.BASE_URL}data/precincts/${stateAbbr}.json`, 'tiles', {
      idProperty: 'GEOID',
      width: 900,
      height: 520,
    })
      .then((l) => {
        if (abortRef.current !== myRun) return;
        setLayer(l);
        setResults(extractBakedResults(l.features.map((f) => ({ properties: f.properties })), { idProperty: 'GEOID' }));
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
  }, [stateAbbr]);

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
            {USPS_TO_NAME[stateAbbr] ?? stateAbbr} &middot; {showingSimulated ? `simulated 2026 · ${simulate!.label}` : 'real 2024 precincts'}
          </h3>
          {showingSimulated && (
            <p className="text-ink-dim text-[11px] font-data mt-0.5">
              real 2024 precincts ({gcbLabel(baselineMarginR!)}), uniformly swung {swingDelta! >= 0 ? '+' : ''}
              {swingDelta!.toFixed(1)}pts to this race's computed {gcbLabel(simulate!.targetMarginR)} &mdash; not a real 2026 count
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {results && <span className="font-data text-xs text-ink-dim">{results.length.toLocaleString()} precincts</span>}
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
            loading precincts…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/70 font-data text-sm text-ink-dim text-center px-6">
            no precinct file shipped for {stateAbbr}
          </div>
        )}
        <PrecinctCanvas
          layer={layerForCanvas}
          colorScale={(_, f) => colorScale((f.properties as { result?: PrecinctResult }).result)}
          tooltip={(f) => <PrecinctTooltip result={resultsById.get(f.id)} />}
          background="#0a0e17"
        />
      </div>

      <p className="mt-2 font-data text-xs text-ink-dim">
        hover a precinct for its {showingSimulated ? 'simulated' : 'real'} votes · scroll or +/− to zoom, drag to pan — the view stays where you put it
      </p>
    </div>
  );
}
