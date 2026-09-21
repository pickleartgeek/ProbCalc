#!/usr/bin/env node
// Slovak NRSR 2023 -> municipality-level (obec) region preset: ~2,900 units,
// the smallest division the Štatistický úrad publishes results for.
//
//   node scripts/prepare-slovakia.mjs <NRSR2023_SK_tab08d.xlsx> <obec_0.shp | dir> <outDir>
//
// Inputs (the same release the US precinct data comes from):
//   https://github.com/pickleartgeek/ProbCalc/releases/download/united-states/NRSR2023_SK_tab08d.xlsx
//   https://github.com/pickleartgeek/ProbCalc/releases/download/united-states/obec_0.zip
//
// Outputs (consumed by src/lib/geo/presets.ts):
//   <outDir>/sk-obce.topo.json      geometry, features carry { id (= IDN4 / Kód obce), name, group (= okres) }
//   <outDir>/sk-obce.baseline.json  valid votes per party per obec (r)
//
// The shapefile is S-JTSK / Krovak East-North (EPSG:5514). mapshaper rejects its
// ESRI WKT name, so raw coordinates are read and reprojected here with proj4.
// The xlsx's "Cudzina" row (postal votes from abroad, code 599999) has no polygon;
// it is reported and left out of the map.
import fs from 'node:fs';
import path from 'node:path';
import proj4 from 'proj4';
import { readSheet } from 'read-excel-file/node';
import { log, mapCoords, resolveShp, shapefileToGeoJSON, slugify, writeTopo } from './lib/region-prep.mjs';

const [, , xlsxPath, shpInput, outDir = 'public/data/geo'] = process.argv;
if (!xlsxPath || !shpInput) {
  console.error('Usage: node scripts/prepare-slovakia.mjs <NRSR2023_SK_tab08d.xlsx> <obec_0.shp|dir> [outDir]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// Header text -> nicer display label. Anything not listed keeps the header text.
const LABELS = {
  'SMER - SD': 'Smer–SD', 'HLAS - SD': 'Hlas–SD', 'OĽANO A PRIATELIA, KÚ a ZA ĽUDÍ': 'OĽaNO', 'SZÖVETSÉG - ALIANCIA': 'Aliancia',
  'REPUBLIKA': 'Republika', 'SPRAVODLIVOSŤ': 'Spravodlivosť', 'SRDCE - SNJ': 'Srdce–SNJ', 'SDKÚ - DS': 'SDKÚ–DS', 'SME RODINA': 'Sme rodina',
  'KARMA': 'Karma', 'PRINCÍP': 'Princíp', 'MySlovensko': 'MySlovensko',
};

const sheet = await readSheet(xlsxPath);
const hi = sheet.findIndex((r) => r[0] === 'Kód kraja');
if (hi < 0) throw new Error('xlsx header row ("Kód kraja") not found');
const head = sheet[hi].map((h) => String(h ?? '').replace(/_x000D_|\r|\n/g, ' ').replace(/\s+/g, ' ').trim());
const totalCol = head.findIndex((h) => /^Počet platných hlasov spolu$/i.test(h));
if (totalCol < 0) throw new Error('"Počet platných hlasov spolu" column not found');
const partyCols = head
  .map((h, col) => ({ col, m: h.match(/^Počet platných hlasov za (.+)$/i) }))
  .filter((x) => x.m)
  .map((x) => ({ col: x.col, raw: x.m[1].trim(), label: LABELS[x.m[1].trim()] ?? x.m[1].trim() }))
  .map((x) => ({ ...x, key: slugify(x.label) }));
log(`xlsx: ${partyCols.length} parties — ${partyCols.map((p) => p.label).join(', ')}`);

const num = (v) => (typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/\s/g, ''), 10) || 0);
const regions = {};
let abroad = null;
const nat = { v: 0, r: partyCols.map(() => 0) };
for (const row of sheet.slice(hi + 1)) {
  const code = String(row[6] ?? '').trim();
  if (!code) continue;
  const rec = {
    n: String(row[7] ?? '').trim(), g: String(row[5] ?? '').trim(), k: String(row[1] ?? '').trim(),
    v: num(row[totalCol]), r: partyCols.map((p) => num(row[p.col])),
  };
  if (code === '599999') { abroad = rec; continue; } // Cudzina — no polygon
  regions[code] = rec;
  nat.v += rec.v;
  rec.r.forEach((x, i) => (nat.r[i] += x));
}
const allV = nat.v + (abroad?.v ?? 0);
log(`${Object.keys(regions).length} municipalities, ${nat.v.toLocaleString()} valid votes on the map, ${(abroad?.v ?? 0).toLocaleString()} abroad (not mapped)`);
log('domestic shares: ' + partyCols.map((p, i) => ({ l: p.label, s: nat.r[i] / nat.v })).sort((a, b) => b.s - a.s).slice(0, 10).map((x) => `${x.l} ${(x.s * 100).toFixed(1)}`).join(' · '));
void allV;

// geometry: raw Krovak -> WGS84
const KROVAK = '+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=485,169.5,483.8,7.786,4.398,4.103,0 +units=m +no_defs';
const toWgs = proj4(KROVAK, 'WGS84');
const geo = shapefileToGeoJSON(resolveShp(shpInput), { ignorePrj: true });
const features = [];
const geoIds = new Set();
for (const f of geo.features) {
  const id = String(f.properties.IDN4);
  mapCoords(f.geometry, (c) => toWgs.forward(c));
  geoIds.add(id);
  features.push({ type: 'Feature', properties: { id, name: f.properties.NM4, group: f.properties.NM3 }, geometry: f.geometry });
}
const noShape = Object.keys(regions).filter((id) => !geoIds.has(id));
const noData = [...geoIds].filter((id) => !regions[id]);
log(`join: ${features.length - noData.length}/${features.length} shapes have results; ${noShape.length} result rows without a shape; ${noData.length} shapes without results`);
if (noShape.length > 5 || noData.length > 20) throw new Error(`Suspiciously poor obec join — no shape: ${noShape.slice(0, 8)}, no data: ${noData.slice(0, 8)}`);
for (const id of noShape) delete regions[id];

// sanity: every reprojected shape must land inside Slovakia's bounding box
const bad = features.filter((f) => {
  const c = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0][0][0];
  return !(c[0] > 16.8 && c[0] < 22.6 && c[1] > 47.7 && c[1] < 49.7);
});
if (bad.length) throw new Error(`${bad.length} shapes fall outside Slovakia after reprojection — wrong CRS?`);

writeTopo(features, path.join(outDir, 'sk-obce.topo.json'), 'regions', { simplify: 5 });
fs.writeFileSync(
  path.join(outDir, 'sk-obce.baseline.json'),
  JSON.stringify({
    preset: 'sk-obce',
    election: 'Voľby do Národnej rady SR 2023 (platné hlasy podľa obcí)',
    attribution: 'Štatistický úrad Slovenskej republiky (NRSR 2023, tab. 08d); hranice obcí: ÚGKK SR (ZBGIS)',
    parties: partyCols.map((p) => ({ key: p.key, label: p.label })),
    abroad: abroad ? { v: abroad.v, r: abroad.r } : undefined,
    regions,
  })
);
log('done');
