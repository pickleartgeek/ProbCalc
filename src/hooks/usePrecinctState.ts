import { useEffect, useMemo, useRef, useState } from 'react';
import { loadTopoLayer } from '../lib/precinct/loadTopo';
import { extractBakedResults, type PrecinctResult } from '../lib/precinct/results';
import type { ProjectedLayer } from '../lib/precinct/types';
import { precinctBaseline } from '../lib/geo/forecast';

export interface PrecinctState {
  layer: ProjectedLayer | null;
  results: PrecinctResult[];
  resultsById: Map<string, PrecinctResult>;
  baseline: ReturnType<typeof precinctBaseline> | null;
  loading: boolean;
  /** set when the state's file is not shipped / failed to load — callers fall back to districts */
  error: string | null;
}

const cache = new Map<string, Promise<{ layer: ProjectedLayer; results: PrecinctResult[] }>>();

/** One state's real precincts (geometry + baked 2024 votes), loaded once and memoised so every consumer shares one layer object. */
export function usePrecinctState(abbr: string | null): PrecinctState {
  const [data, setData] = useState<{ layer: ProjectedLayer; results: PrecinctResult[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  useEffect(() => {
    if (!abbr) { setData(null); setError(null); setLoading(false); return; }
    const my = ++run.current;
    setLoading(true); setError(null); setData(null);
    if (!cache.has(abbr)) {
      cache.set(abbr, loadTopoLayer(`${import.meta.env.BASE_URL}data/precincts/${abbr}.json`, 'tiles', { idProperty: 'GEOID', width: 900, height: 520 }).then((layer) => ({
        layer,
        results: extractBakedResults(layer.features.map((f) => ({ properties: f.properties })), { idProperty: 'GEOID' }),
      })));
    }
    cache.get(abbr)!
      .then((d) => { if (run.current === my) setData(d); })
      .catch((e) => { cache.delete(abbr); if (run.current === my) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (run.current === my) setLoading(false); });
  }, [abbr]);

  const resultsById = useMemo(() => new Map((data?.results ?? []).map((r) => [r.id, r])), [data]);
  const baseline = useMemo(() => (data ? precinctBaseline(data.results, `us-precincts-${abbr}`) : null), [data, abbr]);
  return { layer: data?.layer ?? null, results: data?.results ?? [], resultsById, baseline, loading, error };
}
