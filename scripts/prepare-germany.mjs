#!/usr/bin/env node
// German Bundestag 2025 -> Wahlkreis-level region preset (299 constituencies,
// the smallest division the Bundeswahlleiterin publishes in the KERG file).
//
//   node scripts/prepare-germany.mjs <btw25_kerg.csv> <wahlkreise.shp | dir> <outDir>
//
// Inputs (the same release the US precinct data comes from):
//   https://github.com/pickleartgeek/ProbCalc/releases/download/united-states/btw25_kerg.csv
//   https://github.com/pickleartgeek/ProbCalc/releases/download/united-states/wahlkreise.zip
//
// Outputs (both consumed by src/lib/geo/presets.ts):
//   <outDir>/de-wahlkreise.topo.json      geometry, features carry { id, name, group }
//   <outDir>/de-wahlkreise.baseline.json  Zweitstimmen 2025 (r) and the 2021 "Vorperiode"
//                                         recomputed onto the 2025 boundaries (p)
//
// KERG layout: each measure (Wahlberechtigte, Wählende, Ungültige, Gültige, then one
// block per party) spans 4 columns: [Erst. endgültig, Erst. Vorperiode, Zweit.
// endgültig, Zweit. Vorperiode]. Blocks start at column 4. The layout is asserted
// from the sub-header rows below rather than assumed.
//
// Data: (c) Die Bundeswahlleiterin, Wiesbaden 2025 — Datenlizenz Deutschland –
// Namensnennung – Version 2.0 (https://www.govdata.de/dl-de/by-2-0)
import fs from 'node:fs';
import path from 'node:path';
import { log, resolveShp, shapefileToGeoJSON, writeTopo } from './lib/region-prep.mjs';

const [, , csvPath, shpInput, outDir = 'public/data/geo'] = process.argv;
if (!csvPath || !shpInput) {
  console.error('Usage: node scripts/prepare-germany.mjs <btw25_kerg.csv> <wahlkreise.shp|dir> [outDir]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// party header -> baseline key. CDU + CSU are one "Union" (they never compete in the same Land, and every poll page lists them as one bloc).
const PARTY_KEY = [
  [/^Sozialdemokratische/i, 'spd'],
  [/^Christlich Demokratische Union/i, 'union'],
  [/^Christlich-Soziale Union/i, 'union'],
  [/^BÜNDNIS 90/i, 'gruene'],
  [/^Freie Demokratische/i, 'fdp'],
  [/^Alternative für Deutschland/i, 'afd'],
  [/^Die Linke/i, 'linke'],
  [/^FREIE WÄHLER/i, 'fw'],
  [/^Bündnis Sahra Wagenknecht/i, 'bsw'],
];
const PARTIES = [
  { key: 'union', label: 'Union' }, { key: 'afd', label: 'AfD' }, { key: 'spd', label: 'SPD' },
  { key: 'gruene', label: 'Grüne' }, { key: 'linke', label: 'Linke' }, { key: 'bsw', label: 'BSW' },
  { key: 'fdp', label: 'FDP' }, { key: 'fw', label: 'FW' }, { key: 'others', label: 'Others' },
];
const LAND = {
  '01': 'Schleswig-Holstein', '02': 'Hamburg', '03': 'Niedersachsen', '04': 'Bremen', '05': 'Nordrhein-Westfalen',
  '06': 'Hessen', '07': 'Rheinland-Pfalz', '08': 'Baden-Württemberg', '09': 'Bayern', '10': 'Saarland', '11': 'Berlin',
  '12': 'Brandenburg', '13': 'Mecklenburg-Vorpommern', '14': 'Sachsen', '15': 'Sachsen-Anhalt', '16': 'Thüringen',
};

const rows = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.split(';'));
const hi = rows.findIndex((r) => r[0] === 'Nr');
if (hi < 0) throw new Error('KERG header row ("Nr") not found');
const [head, sub1, sub2] = [rows[hi], rows[hi + 1], rows[hi + 2]];
const data = rows.slice(hi + 3).filter((r) => /^\d{3}$/.test(r[0]) && +r[0] >= 1 && +r[0] <= 299 && r[2] !== '99');
if (data.length !== 299) throw new Error(`Expected 299 Wahlkreis rows, found ${data.length}`);

// locate measure blocks and assert the 4-column layout
const blocks = [];
for (let c = 4; c < head.length; c += 4) {
  if (!head[c]) continue;
  if (sub1[c] !== 'Erststimmen' || sub1[c + 2] !== 'Zweitstimmen' || sub2[c] !== 'Endgültig' || sub2[c + 1] !== 'Vorperiode') {
    throw new Error(`Unexpected KERG sub-header at column ${c}: ${sub1[c]}/${sub2[c]}`);
  }
  blocks.push({ name: head[c].trim(), col: c });
}
const num = (s) => (s && /^-?\d+$/.test(s.trim()) ? parseInt(s, 10) : 0);
const measure = (name) => blocks.find((b) => b.name === name);
const valid = measure('Gültige Stimmen');
const eligible = measure('Wahlberechtigte');
if (!valid || !eligible) throw new Error('Gültige Stimmen / Wahlberechtigte block missing');

const partyBlocks = blocks
  .map((b) => ({ ...b, key: PARTY_KEY.find(([re]) => re.test(b.name))?.[1] }))
  .filter((b) => b.key);
log(`KERG: ${blocks.length} measure blocks, ${partyBlocks.length} named-party blocks, ${data.length} Wahlkreise`);

const regions = {};
const nat = { v: 0, r: {}, pv: 0, p: {} };
for (const row of data) {
  const id = row[0];
  const v = num(row[valid.col + 2]); // Zweitstimmen endgültig, gültig
  const pv = num(row[valid.col + 3]); // Zweitstimmen Vorperiode
  const r = {}, p = {};
  for (const b of partyBlocks) {
    r[b.key] = (r[b.key] ?? 0) + num(row[b.col + 2]);
    p[b.key] = (p[b.key] ?? 0) + num(row[b.col + 3]);
  }
  r.others = Math.max(0, v - PARTIES.filter((x) => x.key !== 'others').reduce((s, x) => s + (r[x.key] ?? 0), 0));
  p.others = Math.max(0, pv - PARTIES.filter((x) => x.key !== 'others').reduce((s, x) => s + (p[x.key] ?? 0), 0));
  regions[id] = {
    n: row[1], g: LAND[row[2]] ?? row[2], v, pv, e: num(row[eligible.col + 2]),
    r: PARTIES.map((x) => r[x.key] ?? 0),
    p: PARTIES.map((x) => p[x.key] ?? 0),
  };
  nat.v += v; nat.pv += pv;
  for (const x of PARTIES) { nat.r[x.key] = (nat.r[x.key] ?? 0) + (r[x.key] ?? 0); nat.p[x.key] = (nat.p[x.key] ?? 0) + (p[x.key] ?? 0); }
}
log('national Zweitstimmen 2025: ' + PARTIES.map((x) => `${x.label} ${((nat.r[x.key] / nat.v) * 100).toFixed(1)}`).join(' · '));
log('national Zweitstimmen 2021: ' + PARTIES.map((x) => `${x.label} ${((nat.p[x.key] / nat.pv) * 100).toFixed(1)}`).join(' · '));

// geometry
const geo = shapefileToGeoJSON(resolveShp(shpInput));
const features = geo.features.map((f) => ({
  type: 'Feature',
  properties: { id: String(f.properties.id).padStart(3, '0'), name: f.properties.name, group: f.properties.land },
  geometry: f.geometry,
}));
const geoIds = new Set(features.map((f) => f.properties.id));
const missingGeo = Object.keys(regions).filter((id) => !geoIds.has(id));
const missingData = [...geoIds].filter((id) => !regions[id]);
if (missingGeo.length || missingData.length) throw new Error(`Wahlkreis join failed: no shape for ${missingGeo}, no results for ${missingData}`);
log(`joined ${features.length} Wahlkreise (0 unmatched)`);

writeTopo(features, path.join(outDir, 'de-wahlkreise.topo.json'), 'regions', { simplify: 7 });
fs.writeFileSync(
  path.join(outDir, 'de-wahlkreise.baseline.json'),
  JSON.stringify({
    preset: 'de-wahlkreise',
    election: 'Bundestagswahl 2025 (Zweitstimmen, amtliches Endergebnis)',
    previous: 'Bundestagswahl 2021 (Zweitstimmen, umgerechnet auf die Wahlkreise 2025)',
    attribution: '© Die Bundeswahlleiterin, Wiesbaden 2025 — Datenlizenz Deutschland – Namensnennung – Version 2.0',
    parties: PARTIES,
    regions,
  })
);
log('done');
