import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateChamber, SENATE_BASELINE, HOUSE_BASELINE } from '../src/lib/midterms/simulate';
import { controlCurve, tippingIndex } from '../src/lib/midterms/envCurve';
import { computeSenateRaces } from '../src/lib/midterms/senateData';
import { computeGovernorRaces } from '../src/lib/midterms/governorData';
import { generateHouseSeats } from '../src/lib/midterms/houseData';

test('seat histogram: sums to the iteration count and reproduces the control odds and mean exactly', () => {
  const sim = simulateChamber(computeSenateRaces(-5), SENATE_BASELINE, 'senate-2026', 4000);
  const h = sim.seatHistogram;
  assert.equal(h.length, SENATE_BASELINE.totalSeats + 1);
  assert.equal(h.reduce((a, b) => a + b, 0), 4000);
  const pR = h.slice(SENATE_BASELINE.majority).reduce((a, b) => a + b, 0) / 4000;
  assert.equal(pR, sim.pRControl);
  const mean = h.reduce((a, c, k) => a + c * k, 0) / 4000;
  assert.ok(Math.abs(mean - sim.seatsR.mean) < 1e-9);
});

test('tipping point: the race that takes the Republicans over the majority, in lean order', () => {
  // holdovers 2, majority 4: the 2nd most Republican race gets them there (2+1=3, 2+2=4)
  const { order, at } = tippingIndex([0.2, 0.9, 0.6, 0.95], 2, 4);
  assert.deepEqual(order, [3, 1, 2, 0]);
  assert.equal(at, 1);
  assert.equal(tippingIndex([0.5], 0, 5).at, -1, 'cannot reach a majority');
});

test('odds vs environment: the Democrats\u2019 chance never rises as the environment moves towards the Republicans, and every chamber responds', () => {
  const pts = controlCurve({
    gcbs: [-12, -8, -4, 0, 4],
    senate: (g) => computeSenateRaces(g),
    governors: (g) => computeGovernorRaces(g),
    house: (g) => generateHouseSeats(g),
    iterations: 800,
    nationalSd: 2,
  });
  for (const k of ['senate', 'governors', 'house'] as const) {
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i][k] <= pts[i - 1][k] + 1e-9, `${k} not monotone at ${pts[i].gcb}`);
    assert.ok(pts[0][k] - pts[pts.length - 1][k] > 0.25, `${k} should move materially across D+12..R+4 (${pts[0][k].toFixed(2)} -> ${pts[pts.length - 1][k].toFixed(2)})`);
  }
});

test('a shared national swing widens the seat range without moving the expected seats', () => {
  const house = generateHouseSeats(-3);
  const a = simulateChamber(house, HOUSE_BASELINE, 'house-2026', 4000);
  const b = simulateChamber(house, HOUSE_BASELINE, 'house-2026', 4000, { nationalSd: 2 });
  assert.ok(b.seatsR.p90 - b.seatsR.p10 > 1.5 * (a.seatsR.p90 - a.seatsR.p10), `range ${a.seatsR.p10}-${a.seatsR.p90} -> ${b.seatsR.p10}-${b.seatsR.p90}`);
  assert.ok(Math.abs(b.seatsR.mean - a.seatsR.mean) < 6, 'the swing is symmetric, so the mean barely moves');
});
