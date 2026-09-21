// Shared helpers for the region-preset data pipelines (prepare-germany.mjs,
// prepare-slovakia.mjs). Node-only — no GDAL/Python needed, same as the
// precinct pipeline: mapshaper does the shapefile IO + simplification.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MAPSHAPER = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'mapshaper');

export function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}

/** Finds the first file matching `re` under `dir` (recursive) — release zips differ in whether they wrap files in a folder. */
export function findFile(dir, re) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (re.test(e.name)) return p;
    }
  }
  throw new Error(`No file matching ${re} under ${dir}`);
}

/** Accepts either a .shp path or a directory containing one. */
export function resolveShp(input) {
  return fs.statSync(input).isDirectory() ? findFile(input, /\.shp$/i) : input;
}

/**
 * Shapefile -> GeoJSON via mapshaper. `ignorePrj` copies the sidecar files
 * without their .prj: mapshaper rejects the ESRI WKT name S-JTSK_Krovak_East_North
 * outright, so for that dataset we read raw coordinates and reproject ourselves.
 */
export function shapefileToGeoJSON(shpPath, { ignorePrj = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probcalc-shp-'));
  const base = shpPath.replace(/\.shp$/i, '');
  for (const ext of ['shp', 'shx', 'dbf', 'cpg']) {
    if (fs.existsSync(`${base}.${ext}`)) fs.copyFileSync(`${base}.${ext}`, path.join(tmp, `in.${ext}`));
  }
  if (!ignorePrj && fs.existsSync(`${base}.prj`)) fs.copyFileSync(`${base}.prj`, path.join(tmp, 'in.prj'));
  const out = path.join(tmp, 'out.geojson');
  execFileSync(MAPSHAPER, [path.join(tmp, 'in.shp'), '-o', out, 'format=geojson'], { stdio: 'pipe' });
  const geo = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(tmp, { recursive: true, force: true });
  return geo;
}

/** Applies fn to every [x, y] in a GeoJSON geometry, in place. */
export function mapCoords(geometry, fn) {
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      const [x, y] = fn(c);
      c[0] = +x.toFixed(6);
      c[1] = +y.toFixed(6);
    } else c.forEach(walk);
  };
  walk(geometry.coordinates);
}

/** Simplify + quantise + write a single-object TopoJSON. Features must carry properties.id. */
export function writeTopo(features, outFile, objectName, { simplify, quantization = 1e5 }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probcalc-topo-'));
  const input = path.join(tmp, 'in.geojson');
  fs.writeFileSync(input, JSON.stringify({ type: 'FeatureCollection', features }));
  execFileSync(
    MAPSHAPER,
    [input, '-simplify', 'visvalingam', 'weighted', `${simplify}%`, 'keep-shapes', '-rename-layers', objectName,
     '-o', outFile, 'format=topojson', `quantization=${quantization}`, 'id-field=id'],
    { stdio: 'pipe' }
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`wrote ${path.basename(outFile)} — ${features.length} features, ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
}

export function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}
