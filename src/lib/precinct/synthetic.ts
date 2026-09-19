import type { RawFeature } from './project';
import { mulberry32, seedFrom } from '../mosaicUtil';

// Continental US bounding box — arbitrary choice, just needs to be a plausible
// area to fill with cells for a stress test.
export const SYNTHETIC_BBOX: [number, number, number, number] = [-124.7, 24.5, -66.9, 49.4];
const BBOX = { minLon: SYNTHETIC_BBOX[0], minLat: SYNTHETIC_BBOX[1], maxLon: SYNTHETIC_BBOX[2], maxLat: SYNTHETIC_BBOX[3] };

/**
 * Generates `count` small rectangular "precincts" tiling a bounding box, each
 * with a synthetic value (smooth spatial gradient + per-cell noise) for
 * choropleth testing. This exists purely to prove the renderer holds up at
 * real precinct-count scale before any actual precinct data is wired in —
 * swap for loadTopoLayer() once you have real shapefiles.
 */
export function generateSyntheticPrecincts(count: number, seedKey = 'precinct-stress-test'): RawFeature[] {
  const aspect = (BBOX.maxLon - BBOX.minLon) / (BBOX.maxLat - BBOX.minLat);
  const rows = Math.max(1, Math.round(Math.sqrt(count / aspect)));
  const cols = Math.max(1, Math.round(count / rows));

  const rand = mulberry32(seedFrom(seedKey));
  const lonStep = (BBOX.maxLon - BBOX.minLon) / cols;
  const latStep = (BBOX.maxLat - BBOX.minLat) / rows;

  const features: RawFeature[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lon0 = BBOX.minLon + c * lonStep;
      const lat0 = BBOX.minLat + r * latStep;
      const lon1 = lon0 + lonStep;
      const lat1 = lat0 + latStep;

      // Smooth west->east gradient plus per-cell noise, purely for a
      // visually plausible test choropleth — not representative of anything.
      const gradient = (lon0 - BBOX.minLon) / (BBOX.maxLon - BBOX.minLon); // 0..1
      const noise = (rand() - 0.5) * 0.5;
      const value = Math.max(0, Math.min(1, gradient * 0.7 + 0.15 + noise));

      features.push({
        id: `cell-${r}-${c}`,
        rings: [
          [
            [lon0, lat0],
            [lon1, lat0],
            [lon1, lat1],
            [lon0, lat1],
            [lon0, lat0],
          ],
        ],
        properties: { value },
      });
    }
  }
  return features;
}
