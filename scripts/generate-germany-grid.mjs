#!/usr/bin/env node
/**
 * Generates the "100,000 squares shaped like Germany" dataset.
 *
 * Germany's official area is 357,022 km². A square of
 * 1.889502580045870167 km per side has area 3.5702199999999996... km²,
 * so exactly 100,000 of them equal Germany's real area — that's clearly
 * the point of the specific number, so this script hits it by construction:
 * squares are generated in a true equal-area projection (spherical Lambert
 * Azimuthal Equal-Area, centered on Germany, 1 unit = 1 km), so their area
 * is exactly right regardless of how many of them land inside the border.
 *
 * The border test itself (point-in-polygon against ~2,449 boundary points,
 * over ~150k candidate grid cells) is the expensive part — this is exactly
 * the kind of thing that belongs in the offline data-prep step, not at
 * runtime. Output is just cell centers in km-space (tiny file); the runtime
 * loader (src/lib/precinct/germanyGrid.ts) reconstructs the 4 corners of
 * each square and inverse-projects them back to lon/lat on demand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { laeaForward, EARTH_R_KM } from './laea.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIDE_KM = 1.889502580045870167;
const CENTER_LON = 10.4515;
const CENTER_LAT = 51.1657;

const geojson = JSON.parse(readFileSync(join(__dirname, 'data', 'germany.geojson'), 'utf8'));
const feature = geojson.features[0];
const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];

const ringsKm = [];
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const poly of polygons) {
  for (const ring of poly) {
    const km = ring.map(([lon, lat]) => laeaForward(lon, lat, CENTER_LON, CENTER_LAT, EARTH_R_KM));
    ringsKm.push(km);
    for (const [x, y] of km) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

function insideGermany(px, py) {
  let inside = false;
  for (const ring of ringsKm) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
  }
  return inside;
}

console.log(`Bounding box in km: x[${minX.toFixed(1)}, ${maxX.toFixed(1)}] y[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`);
const cols = Math.ceil((maxX - minX) / SIDE_KM);
const rows = Math.ceil((maxY - minY) / SIDE_KM);
console.log(`Candidate grid: ${cols} x ${rows} = ${(cols * rows).toLocaleString()} cells`);

const centers = [];
const t0 = Date.now();
for (let r = 0; r < rows; r++) {
  const cy = minY + (r + 0.5) * SIDE_KM;
  for (let c = 0; c < cols; c++) {
    const cx = minX + (c + 0.5) * SIDE_KM;
    if (insideGermany(cx, cy)) centers.push([+cx.toFixed(3), +cy.toFixed(3)]);
  }
}
console.log(`Point-in-polygon test: ${Date.now() - t0}ms`);

const cellAreaKm2 = SIDE_KM * SIDE_KM;
const totalAreaKm2 = centers.length * cellAreaKm2;
console.log(`\nSquares inside Germany's border: ${centers.length.toLocaleString()}`);
console.log(`Cell area: ${cellAreaKm2.toFixed(6)} km²`);
console.log(`Total covered area: ${totalAreaKm2.toFixed(1)} km² (Germany's official area: 357,022 km²)`);
console.log(`Match: ${((totalAreaKm2 / 357022) * 100).toFixed(2)}%`);

const out = {
  sideKm: SIDE_KM,
  centerLon: CENTER_LON,
  centerLat: CENTER_LAT,
  earthRadiusKm: EARTH_R_KM,
  count: centers.length,
  centers,
};
const outPath = join(__dirname, '..', 'public', 'data', 'germany-grid.json');
writeFileSync(outPath, JSON.stringify(out));
console.log(`\nWrote ${outPath} (${(JSON.stringify(out).length / 1e6).toFixed(2)}MB)`);
