#!/usr/bin/env node
// Adds real aggregate vote totals per state to manifest.json, computed from
// the (much smaller, already-split) per-state files themselves. Cheap
// second pass — each state file is tens of MB at most, nothing like the
// 640MB source.
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? '/home/claude/work/precinct-split';
const manifestPath = path.join(DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const entry of manifest) {
  const filePath = path.join(DIR, `${entry.state}.json`);
  const topo = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const geoms = topo.objects.tiles.geometries;
  let dem = 0, rep = 0, total = 0;
  for (const g of geoms) {
    dem += g.properties?.votes_dem ?? 0;
    rep += g.properties?.votes_rep ?? 0;
    total += g.properties?.votes_total ?? 0;
  }
  entry.votes_dem = dem;
  entry.votes_rep = rep;
  entry.votes_total = total;
  console.log(`${entry.state}: DEM ${dem.toLocaleString()} / REP ${rep.toLocaleString()} / total ${total.toLocaleString()}`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('manifest enriched.');
