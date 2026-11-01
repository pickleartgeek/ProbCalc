#!/usr/bin/env node
// Rolls the per-state precinct topojsons (scripts/split-precincts-by-state.mjs output) up into one small topojson of
// COUNTIES per state:   node scripts/build-counties.mjs <precinctDir> <outDir>
//
// How a precinct finds its county: every precinct GEOID in the source data starts with its 5-digit county FIPS (state
// FIPS + county FIPS) — "37109-LW18" is Lincoln County NC, and the three states whose ids have no dash carry the same
// 5 digits up front (ME "2300101010", NY "360011300001", PA "420010427"). So county = the first five digits.
//
// Each county's shape is the precincts' own polygons merged together (topojson-client `merge`), so county borders match
// the precinct data exactly (no separate county boundary file to disagree with — which matters for Connecticut, whose
// "counties" in this data are the nine planning regions the Census adopted in 2022). Votes are summed from the precincts.
// Output keeps the same shape the precinct files have (object `tiles`, GEOID / votes_dem / votes_rep / votes_total /
// pct_dem_lead on each feature) so the existing loader, canvas and swing model work on it unchanged.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { merge } from 'topojson-client';
import { topology } from 'topojson-server';
import { geoContains } from 'd3-geo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ?? 'public/data/precincts';
const OUT = process.argv[3] ?? 'public/data/counties';
// Grid the state's bounding box is snapped to. Neighbouring counties' borders come from independently digitised precinct
// shapefiles, so they miss each other by slivers; snapping to a grid ~200–400 m across makes those borders coincide (so
// topology() can share them instead of shattering into hundreds of thousands of tiny arcs) and doubles as the simplification.
const QUANT = Number(process.env.COUNTY_QUANT ?? 4000);
const NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'county-fips-names.json'), 'utf8'));

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const files = fs.readdirSync(SRC).filter((f) => /^[A-Z]{2}\.json$/.test(f)).sort();
let totalCounties = 0;
let totalPrecincts = 0;
const unnamed = [];

for (const file of files) {
  const state = file.slice(0, 2);
  const topo = JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
  const geoms = topo.objects.tiles?.geometries ?? [];

  const byCounty = new Map();
  let skipped = 0;
  for (const g of geoms) {
    const m = String(g.properties?.GEOID ?? '').match(/^\d{5}/);
    if (!m) { skipped++; continue; }
    if (!byCounty.has(m[0])) byCounty.set(m[0], []);
    byCounty.get(m[0]).push(g);
  }

  const features = [];
  for (const [fips, group] of byCounty) {
    const geometry = merge(topo, group);
    if (!geometry || !geometry.coordinates?.length) continue;
    let dem = 0, rep = 0, total = 0;
    for (const g of group) {
      dem += g.properties.votes_dem ?? 0;
      rep += g.properties.votes_rep ?? 0;
      total += g.properties.votes_total ?? 0;
    }
    const name = NAMES[fips];
    if (!name) unnamed.push(`${state} ${fips}`);
    features.push({
      type: 'Feature',
      properties: {
        state,
        GEOID: fips,
        name: name ?? `County ${fips.slice(2)}`,
        votes_dem: dem,
        votes_rep: rep,
        votes_total: total,
        pct_dem_lead: total > 0 ? Math.round(((dem - rep) / total) * 1e4) / 1e4 : 0,
        precincts: group.length,
      },
      geometry,
    });
  }
  if (!features.length) { log(`${state}: no counties built (${skipped} precincts without a county prefix)`); continue; }

  // Gap fill: merging a county's precincts leaves a hole wherever the precinct set has a gap (an unmapped precinct, a lake
  // boundary mismatch) — rendered as a black hole in the county. A hole is real only if ANOTHER county sits inside it
  // (an independent city, say); if no other county contains the hole's centre, it is just missing data, so close it.
  let filled = 0;
  const bbox = new Map(features.map((f) => {
    let x0 = 181, y0 = 91, x1 = -181, y1 = -91;
    for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
      for (const [x, y] of poly[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [f, [x0, y0, x1, y1]];
  }));
  for (const f of features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (let i = poly.length - 1; i >= 1; i--) {
        const ring = poly[i];
        const pts = ring.slice(0, -1);
        const c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
        const enclave = features.some((o) => { const b = bbox.get(o); return o !== f && c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3] && geoContains(o, c); });
        if (!enclave) { poly.splice(i, 1); filled++; }
      }
    }
  }
  if (filled) log(`${state}: closed ${filled} gap(s)`);

  const out = topology({ tiles: { type: 'FeatureCollection', features } }, QUANT);
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(out));
  totalCounties += features.length;
  totalPrecincts += geoms.length - skipped;
  log(`${state}: ${geoms.length} precincts -> ${features.length} counties${skipped ? ` (${skipped} precincts had no county prefix)` : ''}, ${(fs.statSync(path.join(OUT, file)).size / 1024).toFixed(0)} KB`);
}

log(`done: ${totalPrecincts} precincts -> ${totalCounties} counties in ${files.length} states`);
if (unnamed.length) log(`no name for: ${unnamed.join(', ')}`);
