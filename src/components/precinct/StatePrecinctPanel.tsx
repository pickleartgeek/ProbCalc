import { useEffect, useRef, useState } from 'react';
import { PrecinctCanvas } from './PrecinctCanvas';
import { loadTopoLayer } from '../../lib/precinct/loadTopo';
import { extractBakedResults, twoPoleMarginScale, type PrecinctResult } from '../../lib/precinct/results';
import { USPS_TO_NAME } from '../../lib/usStates';
import type { ProjectedFeature } from '../../lib/precinct/types';

const REP_COLOR = '#ea4b4b';
const DEM_COLOR = '#3b82f6';
const colorScale = twoPoleMarginScale('REP', 'DEM', REP_COLOR, DEM_COLOR);

interface Props {
  stateAbbr: string;
  /** Fixed panel height in px. */
  height?: number;
}

/**
 * Drops the actual real 2024 precinct geometry (not just the state's
 * aggregate margin) into any page that already knows which state a person
 * is looking at — same topojson + PrecinctCanvas the Results page's
 * national precinct map uses, just scoped to one state and without the
 * national-choropleth entry view.
 */
export function StatePrecinctPanel({ stateAbbr, height = 360 }: Props) {
  const [layer, setLayer] = useState<Awaited<ReturnType<typeof loadTopoLayer>> | null>(null);
  const [results, setResults] = useState<PrecinctResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<ProjectedFeature | null>(null);
  const abortRef = useRef(0);

  useEffect(() => {
    const myRun = ++abortRef.current;
    setLoading(true);
    setError(false);
    setLayer(null);
    setResults(null);
    setHovered(null);
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

  const resultsById = new Map((results ?? []).map((r) => [r.id, r]));
  const hoveredResult = hovered ? resultsById.get(hovered.id) : null;
  const layerForCanvas = layer
    ? { ...layer, features: layer.features.map((f) => ({ ...f, properties: { ...f.properties, result: resultsById.get(f.id) } })) }
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <h3 className="font-display font-700 text-base">
          {USPS_TO_NAME[stateAbbr] ?? stateAbbr} &middot; real 2024 precincts
        </h3>
        {results && <span className="font-data text-xs text-ink-dim">{results.length.toLocaleString()} precincts</span>}
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
          onHover={setHovered}
          background="#0a0e17"
        />
      </div>

      <div className="mt-2 font-data text-xs text-ink-dim min-h-[1.5em]">
        {hoveredResult ? (
          <span>
            precinct {hoveredResult.id} &middot;{' '}
            {Object.entries(hoveredResult.candidates)
              .sort((a, b) => b[1] - a[1])
              .map(([name, v]) => `${name} ${Math.round(v).toLocaleString()}`)
              .join(' · ')}
          </span>
        ) : (
          'hover a precinct for its raw vote counts · scroll to zoom, drag to pan'
        )}
      </div>
    </div>
  );
}
