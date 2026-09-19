import { geoAlbersUsa, geoMercator, type GeoProjection } from 'd3-geo';
import type { ProjectedFeature, ProjectedLayer } from './types';

export interface RawFeature {
  id: string;
  /** GeoJSON Polygon-style rings: outer ring first, holes after, each [lon, lat]. */
  rings: [number, number][][];
  properties?: Record<string, unknown>;
}

export type ProjectionKind = 'albersUsa' | 'mercator';

/**
 * Fits a projection to a REFERENCE extent (e.g. a country or state bounding
 * box) — not to whatever features happen to be loaded. Do this once, reuse
 * the result for every layer/tile/LOD level you load afterwards.
 *
 * This matters for two reasons, not just speed:
 *  1. Correctness — if each loaded chunk fit its own projection, two tiles
 *     loaded independently (e.g. drilling into different states) would end
 *     up on different scales and wouldn't line up on screen.
 *  2. Speed — `fitSize` streams the given geometry through the full
 *     projection pipeline (adaptive resampling, composite-projection clip
 *     testing for things like albersUsa's 3 sub-projections), which costs
 *     far more per point than a raw projected-point call. Fitting to a
 *     ~5-point bounding box is fast; fitting to 100k polygons by streaming
 *     all of them through that same pipeline is not (measured ~7s for
 *     100k features vs. <5ms for a bounding box).
 */
export function createReferenceProjection(
  bbox: [number, number, number, number], // [minLon, minLat, maxLon, maxLat]
  width = 1600,
  height = 1000,
  kind: ProjectionKind = 'albersUsa'
): GeoProjection {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const proj: GeoProjection = kind === 'mercator' ? geoMercator() : geoAlbersUsa();
  proj.fitSize(
    [width, height],
    {
      type: 'Polygon',
      coordinates: [
        [
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ],
      ],
    }
  );
  return proj;
}

/**
 * Projects every point exactly once and caches the result as flat pixel-space
 * arrays. This is the one genuinely O(points) step in the whole pipeline —
 * everything after (pan, zoom, culling, picking) works off this cache instead
 * of re-projecting, which is what keeps 100k-polygon layers responsive.
 *
 * Pass an already-fitted `projection` (see createReferenceProjection) when
 * loading more than one layer/tile — fitting per-call here is a convenience
 * fallback for one-off use only.
 */
export function projectFeatures(
  raw: RawFeature[],
  opts: { width?: number; height?: number; projection?: ProjectionKind | GeoProjection } = {}
): ProjectedLayer {
  const { width = 1600, height = 1000, projection = 'albersUsa' } = opts;

  let proj: GeoProjection;
  if (typeof projection !== 'string') {
    proj = projection;
  } else {
    // Fallback: fit to these features' own bounds. Fine for a one-off load;
    // for anything tiled/multi-layer, use createReferenceProjection instead.
    const geojson = {
      type: 'FeatureCollection' as const,
      features: raw.map((f) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: f.rings },
      })),
    };
    proj = projection === 'mercator' ? geoMercator() : geoAlbersUsa();
    proj.fitSize([width, height], geojson);
  }

  let boundsMinX = Infinity;
  let boundsMinY = Infinity;
  let boundsMaxX = -Infinity;
  let boundsMaxY = -Infinity;

  const features: ProjectedFeature[] = raw.map((f) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const rings = f.rings.map((ring) => {
      const flat = new Float64Array(ring.length * 2);
      for (let i = 0; i < ring.length; i++) {
        const p = proj(ring[i]);
        const x = p ? p[0] : 0;
        const y = p ? p[1] : 0;
        flat[i * 2] = x;
        flat[i * 2 + 1] = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return flat;
    });

    if (minX < boundsMinX) boundsMinX = minX;
    if (minY < boundsMinY) boundsMinY = minY;
    if (maxX > boundsMaxX) boundsMaxX = maxX;
    if (maxY > boundsMaxY) boundsMaxY = maxY;

    return {
      id: f.id,
      rings,
      bbox: [minX, minY, maxX, maxY],
      properties: f.properties ?? {},
    };
  });

  return {
    features,
    bounds: [boundsMinX, boundsMinY, boundsMaxX, boundsMaxY],
    width,
    height,
  };
}
