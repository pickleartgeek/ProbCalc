import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTwoPartyMargin, applyUniformSwing, computeResult } from '../src/lib/precinct/results';

// Two precincts: one leans REP 60/40, one leans DEM 30/70; a third party gets a few votes in each.
const base = [
  computeResult('p1', { REP: 600, DEM: 400, OTH: 20 }),
  computeResult('p2', { REP: 300, DEM: 700, OTH: 10 }),
];

test('aggregateTwoPartyMargin matches the statewide two-party arithmetic', () => {
  // (900 - 1100) / 2000 * 100 = -10
  assert.equal(aggregateTwoPartyMargin(base, 'REP', 'DEM'), -10);
  assert.equal(aggregateTwoPartyMargin([], 'REP', 'DEM'), null);
});

test('a zero-point swing is a no-op (same object, not just equal values)', () => {
  assert.equal(applyUniformSwing(base, 0, 'REP', 'DEM'), base);
});

test('a uniform swing shifts every precinct by exactly half the point delta per pole, turnout unchanged', () => {
  // move the state from R-10 to R+10: a +20 swing
  const swung = applyUniformSwing(base, 20, 'REP', 'DEM');
  assert.equal(aggregateTwoPartyMargin(swung, 'REP', 'DEM'), 10);
  for (const [before, after] of [[base[0], swung[0]], [base[1], swung[1]]] as const) {
    const beforeShare = before.candidates.REP / (before.candidates.REP + before.candidates.DEM);
    const afterShare = after.candidates.REP / (after.candidates.REP + after.candidates.DEM);
    assert.ok(Math.abs(afterShare - beforeShare - 0.1) < 1e-9, 'each precinct moved +10pts toward REP (half of the 20pt delta)');
    assert.equal(after.total, before.total, 'turnout is held fixed');
    assert.equal(after.candidates.OTH, before.candidates.OTH, 'other candidates are untouched');
  }
});

test('swing clamps at 100/0 instead of going negative for a landslide precinct', () => {
  const allRep = [computeResult('p3', { REP: 100, DEM: 0 })];
  const swung = applyUniformSwing(allRep, -400, 'REP', 'DEM'); // an enormous D swing
  assert.equal(swung[0].candidates.REP, 0);
  assert.equal(swung[0].candidates.DEM, 100);
});

test('a precinct with no votes in either pole (e.g. write-in only) is left alone', () => {
  const oth = [computeResult('p4', { OTH: 5 })];
  const swung = applyUniformSwing(oth, 20, 'REP', 'DEM');
  assert.deepEqual(swung[0].candidates, oth[0].candidates);
});

test('end-to-end: swinging to the aggregate\'s own margin is a no-op result (not just a no-op call)', () => {
  const margin = aggregateTwoPartyMargin(base, 'REP', 'DEM')!;
  const swung = applyUniformSwing(base, 0, 'REP', 'DEM'); // delta = target(-10) - current(-10) = 0
  assert.equal(aggregateTwoPartyMargin(swung, 'REP', 'DEM'), margin);
});
