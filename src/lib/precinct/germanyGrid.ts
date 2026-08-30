import { laeaInverse } from './laea';
import type { RawFeature } from './project';

interface GermanyGridFile {
  sideKm: number;
  centerLon: number;
  centerLat: number;
  earthRadiusKm: number;
  count: number;
  centers: [number, number][]; // [x_km, y_km] in the LAEA space the squares were built in
}

/**
 * Loads the precomputed Germany grid (see scripts/generate-germany-grid.mjs)
 * and reconstructs each square's 4 lon/lat corners on demand. The expensive
 * part — testing ~150k candidate cells against Germany's real border — already
 * happened offline; this is just 4 cheap inverse-projections per square.
 */
export async function loadGermanyGrid(url = '/data/germany-grid.json'): Promise<{ features: RawFeature[]; bbox: [number, number, number, number] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const data = (await res.json()) as GermanyGridFile;

  const half = data.sideKm / 2;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;

  const features: RawFeature[] = data.centers.map(([cx, cy], i) => {
    const corners: [number, number][] = [
      [cx - half, cy - half],
      [cx + half, cy - half],
      [cx + half, cy + half],
      [cx - half, cy + half],
    ].map(([x, y]) => laeaInverse(x, y, data.centerLon, data.centerLat, data.earthRadiusKm)) as [number, number][];
    corners.push(corners[0]); // close the ring

    for (const [lon, lat] of corners) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    // latitude of the center, handy for a north/south choropleth in the demo
    const [, centerLat] = laeaInverse(cx, cy, data.centerLon, data.centerLat, data.earthRadiusKm);

    return {
      id: `de-${i}`,
      rings: [corners],
      properties: { lat: centerLat },
    };
  });

  return { features, bbox: [minLon, minLat, maxLon, maxLat] };
}
