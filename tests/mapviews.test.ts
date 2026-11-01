import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marginColor, probabilityColor, ratingFromMargin, winnerColor, fmtMargin, isMapView } from '../src/lib/midterms/mapViews';
import { racesToCsv } from '../src/lib/midterms/exportCsv';
import { simulateChamber, SENATE_BASELINE } from '../src/lib/midterms/simulate';
import { computeSenateRaces } from '../src/lib/midterms/senateData';

const rgb = (c: string) => c.match(/\d+/g)!.map(Number) as [number, number, number];

test('margin colour: grey at even, blue for D, red for R, symmetric, more saturated further out', () => {
  assert.deepEqual(rgb(marginColor(0)), [0x8b, 0x8f, 0xa3]);
  const d = rgb(marginColor(-10)), r = rgb(marginColor(10));
  assert.ok(d[2] > d[0] && r[0] > r[2], 'D is blue-dominant, R red-dominant');
  assert.ok(rgb(marginColor(20))[0] > rgb(marginColor(5))[0], 'a bigger R margin is redder');
  assert.deepEqual(rgb(marginColor(99)), rgb(marginColor(20)), 'saturates');
  assert.equal(marginColor(NaN), '#1a2233', 'no data -> the empty colour, not a made-up one');
});

test('probability colour: 50% is grey, certain wins are the deep party colours', () => {
  assert.deepEqual(rgb(probabilityColor(0.5)), [0x8b, 0x8f, 0xa3]);
  assert.deepEqual(rgb(probabilityColor(1)), [0xb9, 0x1c, 0x1c]);
  assert.deepEqual(rgb(probabilityColor(0)), [0x1d, 0x4e, 0xd8]);
});

test('observed margins map onto the nine rating bands on both sides', () => {
  const cases: [number, string][] = [[0.4, 'Tossup'], [-0.4, 'Tossup'], [2, 'TiltR'], [-2, 'TiltD'], [5, 'LeanR'], [-5, 'LeanD'], [11, 'LikelyR'], [-11, 'LikelyD'], [30, 'SafeR'], [-30, 'SafeD']];
  for (const [m, want] of cases) assert.equal(ratingFromMargin(m), want, `margin ${m}`);
  assert.equal(winnerColor(3), '#e14b4b');
  assert.equal(winnerColor(-3), '#3b82f6');
  assert.equal(fmtMargin(-4.25), 'D+4.3');
  assert.equal(fmtMargin(0.01), 'EVEN');
  assert.ok(isMapView('margin') && !isMapView('bogus'));
});

test('CSV export: header + one row per race, counts add up, awkward text is quoted', () => {
  const races = computeSenateRaces(-5).slice(0, 4);
  races[0] = { ...races[0], pollSource: 'Emerson, "LV" poll', demCandidate: 'A, B' };
  const sim = simulateChamber(races, SENATE_BASELINE, 'csv-test', 1000);
  const lines = racesToCsv('Senate', races, sim, -5).trimEnd().split('\n');
  assert.equal(lines.length, 1 + races.length);
  assert.ok(lines[0].startsWith('chamber,state,state_name,race_id'));
  assert.ok(lines[1].includes('"Emerson, ""LV"" poll"') && lines[1].includes('"A, B"'));
  // sims_republican_won + sims_democratic_won == simulations on every row
  const head = lines[0].split(',');
  const ix = (n: string) => head.indexOf(n);
  for (const l of lines.slice(2)) { const c = l.split(','); assert.equal(Number(c[ix('sims_republican_won')]) + Number(c[ix('sims_democratic_won')]), Number(c[ix('simulations')])); }
});
