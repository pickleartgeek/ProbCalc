import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateChamber, SENATE_BASELINE } from '../src/lib/midterms/simulate';
import { RATING_R_PROB } from '../src/lib/midterms/ratings';

test('per-race tallies: one count per race, bounded by iterations, and tracking the rating probability', () => {
  const races = [{ rating: 'SafeD' as const }, { rating: 'Tossup' as const }, { rating: 'LikelyR' as const }, { rating: 'SafeR' as const }];
  const sim = simulateChamber(races, SENATE_BASELINE, 'tally-test', 10000);
  assert.equal(sim.raceRWins.length, races.length);
  races.forEach((r, i) => {
    assert.ok(sim.raceRWins[i] >= 0 && sim.raceRWins[i] <= sim.iterations);
    assert.ok(Math.abs(sim.raceRWins[i] / sim.iterations - RATING_R_PROB[r.rating]) < 0.02, `${r.rating}: ${sim.raceRWins[i] / sim.iterations}`);
  });
  // the tallies are the same draws the chamber result is built from
  const meanFromTallies = SENATE_BASELINE.holdoverR + sim.raceRWins.reduce((a, b) => a + b, 0) / sim.iterations;
  assert.ok(Math.abs(meanFromTallies - sim.seatsR.mean) < 1e-9);
});
