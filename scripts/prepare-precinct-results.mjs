#!/usr/bin/env node
/**
 * Precinct RESULTS data-prep pipeline (companion to prepare-precincts.mjs,
 * which handles geometry — this handles the vote-count side).
 *
 * Root cause this fixes: raw MEDSL/Dataverse-style precinct result files
 * (one row per precinct x candidate x mode, every office on the ballot
 * stacked into one CSV) are enormous — CA's 2024 file is 422MB / ~2.79M
 * rows for ONE state, because it includes every school board, water
 * district and city council race alongside the one office the map
 * actually wants. Shipping that whole file to the browser and running
 * results.ts's pivotLongFormat() on it client-side (as one synchronous,
 * unfiltered pass over every row) is almost certainly why CA/GA/NY
 * precinct maps stall — it's a data-pipeline problem, not a canvas one.
 *
 * This script does the filter + pivot ONCE, offline, streaming the file
 * line-by-line (never holds the whole CSV in memory), and writes out a
 * tiny per-precinct JSON — just {id -> {candidates, total, ...}} for the
 * one office you asked for. That's the file that ships to the browser;
 * results.ts's joinResultsToFeatures() then does an O(n) Map-based join
 * against the geometry at render time, same as any other dataset.
 *
 * Usage:
 *   node scripts/prepare-precinct-results.mjs <input.csv> <outputFile.json> \
 *     --office="US SENATE" [--idFields=precinct,county_fips] [--candidateField=candidate] \
 *     [--votesField=votes] [--metaFields=county_name]
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [, , input, outputFile, ...rest] = process.argv;
if (!input || !outputFile) {
  console.error('Usage: node scripts/prepare-precinct-results.mjs <input.csv> <output.json> --office="US SENATE"');
  process.exit(1);
}

const opts = { idFields: ['precinct'], candidateField: 'candidate', votesField: 'votes', metaFields: ['county_name'] };
let officeFilter = null;
for (const arg of rest) {
  const m = arg.match(/^--([a-zA-Z]+)=(.*)$/);
  if (!m) continue;
  const [, key, val] = m;
  if (key === 'office') officeFilter = val.trim().toUpperCase();
  else if (key === 'idFields') opts.idFields = val.split(',');
  else if (key === 'candidateField') opts.candidateField = val;
  else if (key === 'votesField') opts.votesField = val;
  else if (key === 'metaFields') opts.metaFields = val.split(',');
}
if (!officeFilter) {
  console.error('Missing required --office="..." filter (this is what keeps the file small).');
  process.exit(1);
}

/** Minimal quote-aware CSV line splitter — the source data has only a
 * handful of quoted fields (commas inside candidate/office names), so a
 * full RFC4180 state machine would be overkill, but a naive split(',')
 * would silently corrupt those rows. */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function run() {
  const t0 = performance.now();
  const rl = createInterface({ input: createReadStream(input), crlfDelay: Infinity });

  let header = null;
  let officeIdx = -1;
  let idIdx = [];
  let candIdx = -1;
  let votesIdx = -1;
  let metaIdx = [];

  // Same shape as results.ts's pivotLongFormat, applied incrementally so we
  // never hold more than one office's worth of rows in memory at once.
  const groups = new Map();
  let totalRows = 0;
  let keptRows = 0;

  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = splitCsvLine(line).map((h) => h.trim());
      officeIdx = header.indexOf('office');
      idIdx = opts.idFields.map((f) => header.indexOf(f));
      candIdx = header.indexOf(opts.candidateField);
      votesIdx = header.indexOf(opts.votesField);
      metaIdx = opts.metaFields.map((f) => header.indexOf(f));
      if (officeIdx === -1 || candIdx === -1 || votesIdx === -1 || idIdx.some((i) => i === -1)) {
        console.error('Header missing one of the required columns.', { officeIdx, idIdx, candIdx, votesIdx });
        process.exit(1);
      }
      continue;
    }
    totalRows++;
    const cols = splitCsvLine(line);
    if ((cols[officeIdx] ?? '').trim().toUpperCase() !== officeFilter) continue;
    keptRows++;

    const id = idIdx.map((i) => (cols[i] ?? '').trim()).join('|');
    if (!id) continue;
    const candidate = (cols[candIdx] ?? '').trim();
    const votes = Number(cols[votesIdx]);
    if (!candidate || !Number.isFinite(votes)) continue;

    let group = groups.get(id);
    if (!group) {
      const meta = {};
      opts.metaFields.forEach((f, i) => { meta[f] = cols[metaIdx[i]]; });
      group = { candidates: new Map(), meta };
      groups.set(id, group);
    }
    group.candidates.set(candidate, (group.candidates.get(candidate) ?? 0) + votes);
  }

  const out = {};
  for (const [id, group] of groups) {
    const candidates = Object.fromEntries(group.candidates);
    out[id] = { candidates, meta: group.meta };
  }

  writeFileSync(outputFile, JSON.stringify(out));
  const ms = performance.now() - t0;
  console.log(`Scanned ${totalRows.toLocaleString()} rows, kept ${keptRows.toLocaleString()} for "${officeFilter}"`);
  console.log(`${Object.keys(out).length.toLocaleString()} precincts -> ${outputFile}`);
  console.log(`Done in ${(ms / 1000).toFixed(1)}s`);
}

run();
