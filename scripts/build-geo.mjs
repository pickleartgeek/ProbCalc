#!/usr/bin/env node
// Builds the region-preset boundary files in public/data/geo/ from their
// upstream GeoJSON sources. The outputs are committed, so you only need to
// re-run this if you want fresher/more detailed boundaries.
//
//   node scripts/build-geo.mjs <srcDir> [outDir]
//
// Germany (Wahlkreise) and Slovakia (obce) are NOT built here — see
// prepare-germany.mjs / prepare-slovakia.mjs, which use your release data.
//
// <srcDir> is a folder holding the two unpacked upstream repos (fetch them
// with `curl -L https://codeload.github.com/<owner>/<repo>/zip/HEAD`):
//
//   bulgaria-interactive-map-master/  dimitara/bulgaria-interactive-map (MIT)
//   civic-data-boundaries-us-cd118-HEAD/ civic-interconnect/civic-data-boundaries-us-cd118 (MIT, TIGER/Line 2022)
//
// Every output is a TopoJSON with ONE object whose features all carry the same
// normalised property set: { id, name, group? } — that is the only contract
// src/lib/geo/presets.ts relies on.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [, , srcDir, outDirArg] = process.argv;
if (!srcDir) {
  console.error('Usage: node scripts/build-geo.mjs <srcDir> [outDir]');
  process.exit(1);
}
const OUT = outDirArg ?? path.join(__dirname, '..', 'public', 'data', 'geo');
fs.mkdirSync(OUT, { recursive: true });
const MAPSHAPER = path.join(__dirname, '..', 'node_modules', '.bin', 'mapshaper');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probcalc-geo-'));

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const find = (dir, re) => {
  const hit = fs.readdirSync(srcDir).find((d) => re.test(d));
  if (!hit) throw new Error(`Could not find ${re} inside ${srcDir}`);
  return path.join(srcDir, hit, dir);
};

/** simplify + quantise + write TopoJSON via mapshaper. */
function emit(name, objectName, features, { simplify, quantization = 1e4 }) {
  const input = path.join(tmp, `${name}.geojson`);
  fs.writeFileSync(input, JSON.stringify({ type: 'FeatureCollection', features }));
  const output = path.join(OUT, `${name}.topo.json`);
  execFileSync(
    MAPSHAPER,
    [
      input,
      '-simplify', 'visvalingam', 'weighted', `${simplify}%`, 'keep-shapes',
      '-rename-layers', objectName,
      '-o', output, 'format=topojson', `quantization=${quantization}`, 'id-field=id',
    ],
    { stdio: 'inherit' }
  );
  const kb = (fs.statSync(output).size / 1024).toFixed(0);
  console.log(`  ${name}.topo.json  ${features.length} features  ${kb} KB`);
}

// --- Bulgaria: 28 provinces (oblasti) -------------------------------------
// The upstream file only carries a 3-letter NUTS3-style abbreviation, so the
// display names are attached here. build-geo.test.ts (tests/geo.test.ts)
// double-checks each polygon's centroid against its province seat so a wrong
// code -> name pairing can't slip through silently.
{
  const NAMES = {
    BLG: 'Blagoevgrad', BGS: 'Burgas', VAR: 'Varna', VTR: 'Veliko Tarnovo', VID: 'Vidin',
    VRC: 'Vratsa', GAB: 'Gabrovo', DOB: 'Dobrich', KRZ: 'Kardzhali', KNL: 'Kyustendil',
    LOV: 'Lovech', MON: 'Montana', PAZ: 'Pazardzhik', PER: 'Pernik', PVN: 'Pleven',
    PDV: 'Plovdiv', RAZ: 'Razgrad', RSE: 'Ruse', SLS: 'Silistra', SLV: 'Sliven',
    SML: 'Smolyan', SOF: 'Sofia (city)', SFO: 'Sofia (province)', SZR: 'Stara Zagora',
    TGV: 'Targovishte', HKV: 'Haskovo', SHU: 'Shumen', JAM: 'Yambol',
  };
  const src = readJson(path.join(find('geojson', /bulgaria-interactive-map/), 'provinces.json'));
  const features = src.features.map((f) => {
    const code = f.properties.nuts3;
    if (!NAMES[code]) throw new Error(`Unknown Bulgarian province code ${code}`);
    return { type: 'Feature', properties: { id: `BG-${code}`, name: NAMES[code] }, geometry: f.geometry };
  });
  emit('bg-provinces', 'regions', features, { simplify: 20 });
}

// --- US: 435 House districts (118th Congress lines, TIGER/Line 2022) --------
{
  const FIPS_TO_USPS = {
    '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '12': 'FL', '13': 'GA',
    '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
    '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ',
    '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC',
    '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
  };
  const src = readJson(path.join(find('data-out/national', /civic-data-boundaries-us-cd118/), 'cd118_us.geojson'));
  const features = [];
  for (const f of src.features) {
    const p = f.properties;
    if (p.CD118FP === 'ZZ') continue; // undefined "district" = water
    const st = FIPS_TO_USPS[p.STATEFP20];
    if (!st) continue;
    const n = parseInt(p.CD118FP, 10);
    features.push({
      type: 'Feature',
      properties: { id: `${st}-${n}`, name: n === 0 ? `${st}-AL` : `${st}-${n}`, group: st },
      geometry: f.geometry,
    });
  }
  if (features.length !== 435) throw new Error(`Expected 435 House districts, got ${features.length}`);
  emit('us-cd118', 'regions', features, { simplify: 22, quantization: 1e5 });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('done ->', OUT);
