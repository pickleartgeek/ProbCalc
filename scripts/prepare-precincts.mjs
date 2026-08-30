#!/usr/bin/env node
/**
 * Precinct data-prep pipeline.
 *
 * Turns a raw precinct GeoJSON file (100k+ features is fine) into the
 * multi-LOD, quantized TopoJSON files PrecinctCanvas expects, gzip-compressed.
 *
 * You need the raw GeoJSON first. Shapefiles (the usual source — Census
 * TIGER/Line, state SoS releases, VEST, etc.) aren't handled here; convert
 * with either:
 *   ogr2ogr -f GeoJSON precincts.json precincts.shp
 * or the pure-JS route (no GDAL required):
 *   npx shapefile precincts.shp > precincts.json   (via the `shapefile` npm package)
 *
 * Usage:
 *   node scripts/prepare-precincts.mjs <input.geojson> <outputDir> [idField]
 *
 * Produces, per LOD tier:
 *   <outputDir>/precincts-hi.topojson.gz     (~full detail, for zoomed-in view)
 *   <outputDir>/precincts-mid.topojson.gz    (~10% points, mid zoom)
 *   <outputDir>/precincts-lo.topojson.gz     (~2% points, zoomed-out overview)
 * Each is TopoJSON (shared borders deduped) with 1e5 quantization —
 * matches the delta-encoded-coordinate approach used in the older Slovak/NRSR
 * desk builds, just via mapshaper instead of a hand-rolled encoder.
 */
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPSHAPER = join(__dirname, '..', 'node_modules', '.bin', 'mapshaper');

const [, , input, outputDir, idField = 'GEOID'] = process.argv;

if (!input || !outputDir) {
  console.error('Usage: node scripts/prepare-precincts.mjs <input.geojson> <outputDir> [idField]');
  process.exit(1);
}
if (!existsSync(input)) {
  console.error(`Input file not found: ${input}`);
  process.exit(1);
}
mkdirSync(outputDir, { recursive: true });

const TIERS = [
  { name: 'hi', simplifyPct: '25%', note: 'zoomed-in detail' },
  { name: 'mid', simplifyPct: '8%', note: 'mid zoom' },
  { name: 'lo', simplifyPct: '1.5%', note: 'zoomed-out overview' },
];

for (const tier of TIERS) {
  const outFile = join(outputDir, `precincts-${tier.name}.topojson`);
  console.log(`\n[${tier.name}] simplifying to ${tier.simplifyPct} (${tier.note})...`);

  // -simplify keeps topology consistent (shared precinct borders stay
  // shared, no gaps/slivers) while dropping points; -quantize snaps to a
  // fixed grid so coordinates delta-encode small in the TopoJSON output;
  // id-field carries your precinct identifier through as the feature id.
  execFileSync(
    MAPSHAPER,
    [
      '-i', input, `id-field=${idField}`,
      '-simplify', tier.simplifyPct, 'keep-shapes',
      '-clean',
      '-o', outFile, 'format=topojson', 'quantization=100000',
    ],
    { stdio: 'inherit' }
  );

  const raw = readFileSync(outFile);
  const gz = gzipSync(raw, { level: 9 });
  writeFileSync(`${outFile}.gz`, gz);
  console.log(`[${tier.name}] ${(raw.length / 1e6).toFixed(1)}MB -> ${(gz.length / 1e6).toFixed(1)}MB gzipped`);
}

console.log(`\nDone. Point PrecinctCanvas's loadTopoLayer() at these files, e.g.:
  loadTopoLayer('/data/precincts-lo.topojson', 'precincts', { idProperty: '${idField}' })

Static hosts (GitHub Pages included) serve .topojson.gz with the right
Content-Encoding automatically if you keep the .gz extension and your host's
compression is on; otherwise serve the uncompressed .topojson and let the
browser/CDN gzip it in transit — both end up sending the same bytes over the wire.
`);
