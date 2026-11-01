import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';

// Four unit squares in a row, sharing edges (a real topology built with topojson-server). The first three belong to county
// 37001 under the id shapes the data really has (dash id, and bare digits like PA/ME/NY); the last to 37003.

test('build-counties: precincts roll up by the first 5 digits of the GEOID, votes sum, shapes merge', () => {
  const sq = (x: number) => [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]];
  const mk = (x: number, GEOID: string, d: number, r: number) => ({ type: 'Feature', properties: { state: 'NC', GEOID, votes_dem: d, votes_rep: r, votes_total: d + r + 5 }, geometry: { type: 'Polygon', coordinates: sq(x) } });
  const topo = topology({ tiles: { type: 'FeatureCollection', features: [mk(0, '37001-A', 10, 30), mk(1, '370010002', 20, 20), mk(2, '37001-C', 5, 5), mk(3, '37003-D', 40, 10)] } } as never);
  const dir = mkdtempSync(join(tmpdir(), 'counties-'));
  mkdirSync(join(dir, 'in')); mkdirSync(join(dir, 'out'));
  writeFileSync(join(dir, 'in', 'NC.json'), JSON.stringify(topo));
  execFileSync('node', ['scripts/build-counties.mjs', join(dir, 'in'), join(dir, 'out')], { stdio: 'pipe' });
  const out = JSON.parse(readFileSync(join(dir, 'out', 'NC.json'), 'utf8'));
  const fc = feature(out, out.objects.tiles) as unknown as { features: { properties: Record<string, number | string>; geometry: { type: string; coordinates: unknown[] } }[] };
  assert.equal(fc.features.length, 2, 'two counties');
  const a = fc.features.find((f) => f.properties.GEOID === '37001')!;
  const b = fc.features.find((f) => f.properties.GEOID === '37003')!;
  assert.equal(a.properties.precincts, 3);
  assert.equal(a.properties.votes_dem, 35);
  assert.equal(a.properties.votes_rep, 55);
  assert.equal(a.properties.votes_total, 35 + 55 + 15);
  assert.equal(a.properties.name, 'Alamance'); // from scripts/data/county-fips-names.json
  assert.ok(Math.abs(Number(a.properties.pct_dem_lead) - (35 - 55) / 105) < 1e-3);
  assert.equal(b.properties.votes_dem, 40);
  assert.equal(a.geometry.coordinates.length, 1, 'three adjacent squares merge into ONE polygon (no internal edges)');
  assert.equal((a.geometry.coordinates[0] as unknown[]).length, 1, '...with no holes');
});
