import type { ProjectedFeature, ProjectedLayer } from './types';

// A lot of real-world precinct RESULTS data (MEDSL/Dataverse CSVs, a Reddit
// community's own vote counts, anything long-format) has no geometry
// attached at all — joining it to real boundaries needs a name/GEOID
// crosswalk that may not exist yet. Rather than block the whole results
// pipeline on "do you have a shapefile," this lays every precinct out as a
// simple packed grid in pixel space directly (no projection — there's no
// geography to project), so PrecinctCanvas can render and pick real results
// immediately. Swap in loadTopoLayer() + joinResultsToFeatures() later once
// real boundaries are matched, without touching anything else downstream.

export interface CartogramOptions {
  width?: number;
  height?: number;
  gap?: number;
  /** Sort ids before layout (e.g. by total votes descending) so the grid isn't arbitrary. Default: input order. */
  order?: (id: string) => number;
}

export function buildCartogramLayout(
  ids: string[],
  properties: (id: string) => Record<string, unknown>,
  opts: CartogramOptions = {}
): ProjectedLayer {
  const { width = 1200, height = 800, gap = 1 } = opts;
  const sorted = opts.order ? [...ids].sort((a, b) => opts.order!(b) - opts.order!(a)) : ids;

  const n = sorted.length;
  const aspect = width / height;
  const cols = Math.max(1, Math.round(Math.sqrt(n * aspect)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = width / cols;
  const cellH = height / rows;

  const features: ProjectedFeature[] = sorted.map((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = col * cellW + gap / 2;
    const y0 = row * cellH + gap / 2;
    const x1 = x0 + cellW - gap;
    const y1 = y0 + cellH - gap;

    const ring = new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]);
    return {
      id,
      rings: [ring],
      bbox: [x0, y0, x1, y1],
      properties: properties(id),
    };
  });

  return { features, bounds: [0, 0, width, height], width, height };
}
