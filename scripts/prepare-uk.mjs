#!/usr/bin/env node
// UK House of Commons 2024 -> constituency-level region preset (650 constituencies on the July 2024 boundaries).
//
//   node scripts/prepare-uk.mjs <HoC-GE2024-results-by-constituency.xlsx> <Westminster_..._BFC.geojson | dir | .zip> [outDir]
//
// Inputs (the same release the US precinct / German / Slovak data comes from):
//   https://github.com/pickleartgeek/ProbCalc/releases/download/united-states/HoC-GE2024-results-by-constituency.1.xlsx
//   https://github.com/pickleartgeek/ProbCalc/releases/download/united-states/Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BFC_14257342104770118.zip
//
// Outputs (consumed by src/lib/geo/presets.ts):
//   <outDir>/uk-constituencies.topo.json      geometry, features carry { id (ONS code), name, group (ONS region) }
//   <outDir>/uk-constituencies.baseline.json  GE2024 votes per party per constituency (r), plus winner (w) and majority (m)
//
// The boundary file is the full-resolution "BFC" set (~235 MB, British National Grid / EPSG:27700), so it is simplified
// in metres first, then reprojected to WGS84 and simplified/quantised again.
//
// Data: House of Commons Library, "General election 2024 results by constituency" (Open Parliament Licence v3.0);
// boundaries: Office for National Statistics / Ordnance Survey, © Crown copyright (Open Government Licence v3.0).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import proj4 from 'proj4';
import { readSheet } from 'read-excel-file/node';
import { MAPSHAPER, findFile, log, mapCoords, writeTopo } from './lib/region-prep.mjs';

const [, , xlsxPath, geoInput, outDir = 'public/data/geo'] = process.argv;
if (!xlsxPath || !geoInput) {
  console.error('Usage: node scripts/prepare-uk.mjs <results.xlsx> <boundaries.geojson|dir|zip> [outDir]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// Party columns in the xlsx -> baseline keys. Order = display order (largest national parties first).
const PARTIES = [
  { col: 'Lab', key: 'lab', label: 'Labour' }, { col: 'Con', key: 'con', label: 'Conservative' },
  { col: 'RUK', key: 'reform', label: 'Reform UK' }, { col: 'LD', key: 'ld', label: 'Liberal Democrat' },
  { col: 'Green', key: 'green', label: 'Green' }, { col: 'SNP', key: 'snp', label: 'SNP' },
  { col: 'PC', key: 'pc', label: 'Plaid Cymru' }, { col: 'SF', key: 'sf', label: 'Sinn Féin' },
  { col: 'DUP', key: 'dup', label: 'DUP' }, { col: 'SDLP', key: 'sdlp', label: 'SDLP' },
  { col: 'UUP', key: 'uup', label: 'UUP' }, { col: 'APNI', key: 'apni', label: 'Alliance' },
  { col: 'All other candidates', key: 'others', label: 'Others' },
];
const KEY_BY_COL = Object.fromEntries(PARTIES.map((p) => [p.col, p.key]));
// "First party" cell values that are not a column name (the Speaker, independents…) -> others
const winnerKey = (cell) => KEY_BY_COL[String(cell).trim()] ?? 'others';

// ---- results ------------------------------------------------------------------------------------------
const sheet = await readSheet(xlsxPath, 'Data');
const hi = sheet.findIndex((r) => r[0] === 'ONS ID');
if (hi < 0) throw new Error('"ONS ID" header row not found in the Data sheet');
const head = sheet[hi].map((h) => String(h ?? '').trim());
const col = (name) => { const i = head.indexOf(name); if (i < 0) throw new Error(`column "${name}" missing`); return i; };
for (const p of PARTIES) col(p.col);
const [cId, cName, cRegion, cValid, cMaj, cFirst] = ['ONS ID', 'Constituency name', 'Region name', 'Valid votes', 'Majority', 'First party'].map(col);
const num = (x) => (typeof x === 'number' ? x : parseFloat(String(x ?? '').replace(/[\s,]/g, '')) || 0);

const regions = {};
const nat = { v: 0, r: Object.fromEntries(PARTIES.map((p) => [p.key, 0])) };
for (const row of sheet.slice(hi + 1)) {
  const id = String(row[cId] ?? '').trim();
  if (!/^[EWSN]\d{8}$/.test(id)) continue;
  const r = PARTIES.map((p) => num(row[col(p.col)]));
  const v = num(row[cValid]);
  regions[id] = { n: String(row[cName]).trim(), g: String(row[cRegion]).trim(), v, r, w: winnerKey(row[cFirst]), m: num(row[cMaj]) };
  nat.v += v;
  PARTIES.forEach((p, i) => (nat.r[p.key] += r[i]));
}
if (Object.keys(regions).length !== 650) throw new Error(`Expected 650 constituencies in the results, found ${Object.keys(regions).length}`);
log('national vote GE2024: ' + PARTIES.slice(0, 6).map((p) => `${p.label} ${((nat.r[p.key] / nat.v) * 100).toFixed(1)}`).join(' · '));
const seats = {};
for (const r of Object.values(regions)) seats[r.w] = (seats[r.w] ?? 0) + 1;
log('winners by key: ' + JSON.stringify(seats) + ' (the Speaker\'s seat is counted under its party column or others)');

// ---- geometry -----------------------------------------------------------------------------------------
let geoPath = geoInput;
let tmpUnzip = null;
if (/\.zip$/i.test(geoPath)) {
  tmpUnzip = fs.mkdtempSync(path.join(os.tmpdir(), 'probcalc-uk-'));
  execFileSync('unzip', ['-o', '-q', geoPath, '-d', tmpUnzip]);
  geoPath = tmpUnzip;
}
if (fs.statSync(geoPath).isDirectory()) geoPath = findFile(geoPath, /\.geojson$/i);

// simplify in metres first: the raw file is far too big to hold as parsed JSON comfortably
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probcalc-uk-simp-'));
const pre = path.join(tmp, 'pre.geojson');
execFileSync(MAPSHAPER, [geoPath, '-simplify', 'visvalingam', 'weighted', '1.5%', 'keep-shapes', '-o', pre, 'format=geojson'], {
  stdio: 'pipe', maxBuffer: 1 << 30, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
});
log(`pre-simplified boundaries: ${(fs.statSync(pre).size / 1e6).toFixed(1)} MB`);
const geo = JSON.parse(fs.readFileSync(pre, 'utf8'));
fs.rmSync(tmp, { recursive: true, force: true });
if (tmpUnzip) fs.rmSync(tmpUnzip, { recursive: true, force: true });

// British National Grid (OSGB36) -> WGS84
const BNG = '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs';
const toWgs = proj4(BNG, 'WGS84');
const features = geo.features.map((f) => {
  const id = f.properties.PCON24CD;
  mapCoords(f.geometry, (c) => toWgs.forward(c));
  return { type: 'Feature', properties: { id, name: regions[id]?.n ?? f.properties.PCON24NM, group: regions[id]?.g }, geometry: f.geometry };
});
const geoIds = new Set(features.map((f) => f.properties.id));
const missingGeo = Object.keys(regions).filter((id) => !geoIds.has(id));
const missingData = [...geoIds].filter((id) => !regions[id]);
if (missingGeo.length || missingData.length) throw new Error(`Constituency join failed: no shape for ${missingGeo}, no results for ${missingData}`);
log(`joined ${features.length} constituencies (0 unmatched)`);

writeTopo(features, path.join(outDir, 'uk-constituencies.topo.json'), 'regions', { simplify: 20 });
fs.writeFileSync(
  path.join(outDir, 'uk-constituencies.baseline.json'),
  JSON.stringify({
    preset: 'uk-constituencies',
    election: 'UK general election 2024 (valid votes by constituency, July 2024 boundaries)',
    attribution: 'House of Commons Library, GE2024 results by constituency (Open Parliament Licence v3.0); boundaries © ONS / Ordnance Survey, Open Government Licence v3.0',
    parties: PARTIES.map(({ key, label }) => ({ key, label })),
    regions,
  })
);
log('done');
