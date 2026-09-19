#!/usr/bin/env node
// Splits the full NYT precinct topojson (~640MB decompressed, over Node's
// max single-string length so ordinary JSON.parse/readFileSync can't touch
// it at all) into one small, self-contained topojson per state.
//
// Two streaming passes over the same file (stream-json never materializes
// the whole thing as one JS string, so this sidesteps the ERR_STRING_TOO_LONG
// wall entirely):
//   1. Collect every arc as a flat number array (kept in its original
//      delta-encoded form -- no decode/re-encode math needed, just regrouped).
//   2. Collect every geometry (arcs refs + properties), grouped by state.
// Then for each state: walk its geometries' arc references, pull just the
// arcs actually used, renumber them 0..N-1 (respecting TopoJSON's ~i
// bitwise-complement convention for reversed arcs), and write a fresh,
// valid, tiny topology.

import fs from 'node:fs';
import path from 'node:path';
import chain from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamArray } from 'stream-json/streamers/stream-array.js';

const SRC = process.argv[2] ?? '/home/claude/work/precincts-full.topojson';
const OUT_DIR = process.argv[3] ?? '/home/claude/work/precinct-split';
const OBJECT_NAME = 'tiles'; // objects.tiles.geometries, per the source file

// The source arcs are delta-encoded + quantized (first point absolute,
// subsequent points are deltas), which only decodes correctly alongside the
// matching "transform" (scale/translate). We copy arc coordinates through
// byte-for-byte unchanged, so the output topology MUST carry this same
// transform or every consumer (topojson-client, mapshaper, d3) will read
// the quantized deltas as literal absolute coordinates and produce garbage
// geometry. Read once, up front, via a small targeted regex rather than
// parsing the whole 640MB file a third time.
function readTransform(path) {
  const size = fs.statSync(path).size;
  // The transform lives wherever the source file happens to put it in key
  // order (observed: ~80MB before EOF, after "arcs" and "objects" rather
  // than up front) -- read a generous trailing window rather than assuming
  // a fixed offset.
  const windowSize = Math.min(size, 150 * 1024 * 1024);
  const fd = fs.openSync(path, 'r');
  const buf = Buffer.alloc(windowSize);
  fs.readSync(fd, buf, 0, windowSize, size - windowSize);
  fs.closeSync(fd);
  const m = buf.toString('utf8').match(/"transform":\s*(\{[^}]*\})/);
  if (!m) throw new Error(`No "transform" object found in the last ${windowSize} bytes of the source file`);
  return JSON.parse(m[1]);
}
const TRANSFORM = readTransform(SRC);

fs.mkdirSync(OUT_DIR, { recursive: true });

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

// --- Pass 1: arcs -------------------------------------------------------
// Packed columnar storage instead of one Float64Array object per arc: a
// single flat coordinate buffer plus an offsets index. ~4.2M arcs as
// individual typed-array objects was pushing RSS past 4GB before the pass
// even finished (per-object overhead dominates at that count); this
// representation holds the same data in two big buffers with no per-arc
// object overhead at all.
async function readArcs() {
  log('pass 1: reading arcs…');
  let coords = new Float64Array(1 << 22); // grows by doubling
  let coordLen = 0;
  const offsets = [0]; // offsets[i]..offsets[i+1] = coord range for arc i (in POINTS, not floats)
  let arcCount = 0;

  function ensureCapacity(extra) {
    if (coordLen + extra <= coords.length) return;
    let newLen = coords.length * 2;
    while (newLen < coordLen + extra) newLen *= 2;
    const next = new Float64Array(newLen);
    next.set(coords.subarray(0, coordLen));
    coords = next;
  }

  await new Promise((resolve, reject) => {
    const pipeline = chain([
      fs.createReadStream(SRC),
      parser(),
      pick({ filter: 'arcs' }),
      streamArray(),
    ]);
    pipeline.on('data', ({ value }) => {
      ensureCapacity(value.length * 2);
      for (let i = 0; i < value.length; i++) {
        coords[coordLen++] = value[i][0];
        coords[coordLen++] = value[i][1];
      }
      arcCount++;
      offsets.push(coordLen / 2);
      if (arcCount % 500000 === 0) log(`  ${arcCount.toLocaleString()} arcs…`);
    });
    pipeline.on('end', resolve);
    pipeline.on('error', reject);
  });
  log(`pass 1 done: ${arcCount.toLocaleString()} arcs, ${(coordLen / 2).toLocaleString()} points`);
  return { coords: coords.subarray(0, coordLen), offsets: new Uint32Array(offsets), arcCount };
}

// --- Pass 2: geometries, spilled to one temp NDJSON file per state ------
// Keeping all ~164k geometry objects (each a small JS object tree) in
// memory at once, on top of the ~550MB arcs buffer from pass 1, pushed RSS
// past the container's 3.9GB and got the process silently SIGKILLed by the
// kernel OOM killer (no exception, no stack trace — just gone). Spilling
// each geometry to its state's temp file as it streams by keeps peak memory
// to "arcs buffer + whatever fits in the OS write buffer," independent of
// how many total geometries or states there are.
const TMP_DIR = path.join(OUT_DIR, '.tmp-by-state');

async function spillGeometriesByState() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const streams = new Map();
  const stateOrder = [];
  log('pass 2: reading geometries…');
  let count = 0;

  function streamFor(state) {
    let s = streams.get(state);
    if (!s) {
      s = fs.createWriteStream(path.join(TMP_DIR, `${state}.ndjson`));
      streams.set(state, s);
      stateOrder.push(state);
    }
    return s;
  }

  await new Promise((resolve, reject) => {
    const pipeline = chain([
      fs.createReadStream(SRC),
      parser(),
      pick({ filter: `objects.${OBJECT_NAME}.geometries` }),
      streamArray(),
    ]);
    pipeline.on('data', ({ value: geom }) => {
      const state = geom.properties?.state ?? 'UNKNOWN';
      streamFor(state).write(JSON.stringify(geom) + '\n');
      count++;
      if (count % 200000 === 0) log(`  ${count.toLocaleString()} geometries…`);
    });
    pipeline.on('end', resolve);
    pipeline.on('error', reject);
  });

  await Promise.all(
    [...streams.values()].map((s) => new Promise((resolve, reject) => s.end((err) => (err ? reject(err) : resolve()))))
  );
  log(`pass 2 done: ${count.toLocaleString()} geometries across ${stateOrder.length} states (spilled to ${TMP_DIR})`);
  return stateOrder;
}

function readStateGeometries(state) {
  const text = fs.readFileSync(path.join(TMP_DIR, `${state}.ndjson`), 'utf8');
  const lines = text.split('\n');
  const geoms = new Array(lines.length);
  let n = 0;
  for (const line of lines) {
    if (!line) continue;
    geoms[n++] = JSON.parse(line);
  }
  geoms.length = n;
  return geoms;
}

function collectArcRefs(arcsField, out) {
  // arcs field nesting depth depends on geometry type:
  // Polygon: [ring, ring, ...] where ring = [idx, idx, ...]
  // MultiPolygon: [poly, poly, ...] where poly = [ring, ring, ...]
  if (!Array.isArray(arcsField)) throw new Error(`arcs field is not an array: ${JSON.stringify(arcsField)}`);
  for (const item of arcsField) {
    if (Array.isArray(item) && item.length > 0 && Array.isArray(item[0])) collectArcRefs(item, out);
    else if (Array.isArray(item)) for (const idx of item) out.add(idx < 0 ? ~idx : idx);
    else throw new Error(`unexpected arcs ring shape: ${JSON.stringify(item)}`);
  }
}

function remapArcsField(arcsField, remap) {
  return arcsField.map((item) =>
    Array.isArray(item[0])
      ? remapArcsField(item, remap)
      : item.map((idx) => (idx < 0 ? ~remap.get(~idx) : remap.get(idx)))
  );
}

function arcToPairs(coords, offsets, arcIndex) {
  const start = offsets[arcIndex];
  const end = offsets[arcIndex + 1];
  const pairs = new Array(end - start);
  for (let i = start; i < end; i++) pairs[i - start] = [coords[i * 2], coords[i * 2 + 1]];
  return pairs;
}

async function main() {
  const { coords, offsets, arcCount } = await readArcs();
  const stateOrder = await spillGeometriesByState();

  const manifest = [];
  let skipped = 0;
  for (const state of stateOrder) {
    if (!state || state === 'UNKNOWN') continue;
    const rawGeoms = readStateGeometries(state);

    // Isolate bad geometries per-feature rather than letting one malformed
    // record abort the whole state (or the whole run) -- real-world scraped
    // data always has a handful of edge cases (a redistricted precinct with
    // no boundary yet, a zero-length ring, etc).
    const geoms = [];
    for (const g of rawGeoms) {
      try {
        const used = new Set();
        collectArcRefs(g.arcs, used);
        geoms.push(g);
      } catch (err) {
        skipped++;
        log(`  skipping malformed geometry ${g.properties?.GEOID ?? '(no GEOID)'} in ${state}: ${err.message}`);
      }
    }
    if (geoms.length === 0) continue;

    const used = new Set();
    for (const g of geoms) collectArcRefs(g.arcs, used);

    const usedList = [...used].sort((a, b) => a - b);
    const remap = new Map(usedList.map((orig, i) => [orig, i]));
    const outArcs = usedList.map((orig) => arcToPairs(coords, offsets, orig));
    const outGeoms = geoms.map((g) => ({
      type: g.type,
      id: g.properties?.GEOID,
      arcs: remapArcsField(g.arcs, remap),
      properties: g.properties,
    }));

    const topology = {
      type: 'Topology',
      transform: TRANSFORM,
      objects: { [OBJECT_NAME]: { type: 'GeometryCollection', geometries: outGeoms } },
      arcs: outArcs,
    };

    const outPath = path.join(OUT_DIR, `${state}.json`);
    fs.writeFileSync(outPath, JSON.stringify(topology));
    const sizeMB = (fs.statSync(outPath).size / 1e6).toFixed(2);
    manifest.push({ state, precincts: geoms.length, arcs: outArcs.length, sizeMB: Number(sizeMB) });
    log(`  wrote ${state}: ${geoms.length.toLocaleString()} precincts, ${outArcs.length.toLocaleString()} arcs, ${sizeMB} MB`);
    fs.rmSync(path.join(TMP_DIR, `${state}.ndjson`));
  }

  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log(`all done. ${arcCount.toLocaleString()} total source arcs, ${skipped.toLocaleString()} geometries skipped as malformed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
