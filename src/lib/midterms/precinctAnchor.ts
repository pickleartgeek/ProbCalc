// Bridges the real 2024 precinct returns (public/data/precincts/manifest.json —
// the same 163,925-precinct NYT/MEDSL set the Results page's US precinct map
// reads) into the 2026 midterm simulations. The manifest already carries each
// state's aggregate votes_dem/votes_rep/votes_total (computed once when the
// full precinct set was split — see scripts/split-precincts-by-state.mjs), so
// no per-precinct loading is needed here: one small fetch gets an exact,
// certified-scale margin for every state the precinct set covers.
import { STATE_PVI_2024_FALLBACK } from './stateGrid';

interface ManifestEntry {
  state: string;
  precincts: number;
  votes_dem?: number;
  votes_rep?: number;
  votes_total?: number;
}

export interface RealStatePVI {
  /** stateAbbr -> 2024 presidential margin in points, positive = R. Real where available, fallback elsewhere. */
  margins: Record<string, number>;
  /** States whose margin came from real precinct returns (as opposed to the fallback constant). */
  realStates: Set<string>;
  /** Total real precincts the margins were aggregated from. */
  precinctCount: number;
}

let cached: Promise<RealStatePVI> | null = null;

function computeFromManifest(manifest: ManifestEntry[]): RealStatePVI {
  const margins: Record<string, number> = { ...STATE_PVI_2024_FALLBACK };
  const realStates = new Set<string>();
  let precinctCount = 0;

  for (const m of manifest) {
    if (m.votes_dem == null || m.votes_rep == null || !m.votes_total) continue;
    margins[m.state] = ((m.votes_rep - m.votes_dem) / m.votes_total) * 100;
    realStates.add(m.state);
    precinctCount += m.precincts ?? 0;
  }

  return { margins, realStates, precinctCount };
}

/**
 * Loads (and caches) the real per-state 2024 presidential margin. Falls back
 * to the approximate hand-set constant, per-state, for anything the precinct
 * manifest doesn't cover (currently just AK) or if the fetch itself fails —
 * callers never need to null-check individual states.
 */
export function loadRealStatePVI(): Promise<RealStatePVI> {
  if (!cached) {
    cached = fetch(`${import.meta.env.BASE_URL}data/precincts/manifest.json`)
      .then((r) => r.json())
      .then((manifest: ManifestEntry[]) => computeFromManifest(manifest))
      .catch(() => ({ margins: { ...STATE_PVI_2024_FALLBACK }, realStates: new Set<string>(), precinctCount: 0 }));
  }
  return cached;
}
