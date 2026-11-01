import { mulberry32, seedFrom } from '../mosaicUtil';
import { RATING_R_PROB, type Rating } from './ratings';
import { winProbRFast } from './raceProb';

export interface ChamberBaseline {
  /** Seats not up for election this cycle, already held by each side. */
  holdoverR: number;
  holdoverD: number;
  totalSeats: number;
  majority: number;
}

export interface ChamberSimResult {
  seatsR: { mean: number; p10: number; median: number; p90: number };
  seatsD: { mean: number; p10: number; median: number; p90: number };
  pRControl: number;
  pDControl: number;
  pTie: number;
  iterations: number;
  /** For each input race (same order), in how many of `iterations` simulations the Republican won it. The Democrat won the rest. */
  raceRWins: number[];
  /** seatHistogram[k] = in how many of `iterations` simulations the Republicans ended with exactly k seats (k = 0..totalSeats, holdovers included). */
  seatHistogram: number[];
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

/**
 * Independent-Bernoulli Monte Carlo: each contested race resolves R or D
 * according to its rating's implied probability, every iteration. Seeded so
 * results are stable across renders (re-run only changes if the race list does).
 */
export interface SimRace {
  rating: Rating;
  /** exact ProbCalc win probability for the Republican (raceProb.ts); without it the rating band's probability is used */
  pR?: number;
  /** projected margin (R − D, points) and ProbCalc strength: with both, each iteration re-evaluates the race at margin + that iteration's national swing */
  margin?: number;
  strength?: number;
}

export function simulateChamber(
  races: SimRace[],
  baseline: ChamberBaseline,
  seedKey: string,
  iterations = 8000,
  opts: { nationalSd?: number } = {}
): ChamberSimResult {
  const rand = mulberry32(seedFrom(seedKey));
  const rProbs = races.map((r) => r.pR ?? RATING_R_PROB[r.rating]);
  // A shared national swing (points, R positive) drawn once per iteration and applied to every race that has a margin, so
  // errors are correlated the way real ones are — without it, hundreds of independent races average out and chamber
  // control looks far more certain than it is.
  const nationalSd = opts.nationalSd ?? 0;
  const swingable = nationalSd > 0 ? races.map((r) => r.margin !== undefined && r.strength !== undefined) : null;
  const rSeatsDist: number[] = [];
  const raceRWins: number[] = rProbs.map(() => 0);
  const seatHistogram: number[] = new Array(baseline.totalSeats + 1).fill(0);
  let rWins = 0;
  let dWins = 0;
  let ties = 0;

  for (let i = 0; i < iterations; i++) {
    let rSeats = baseline.holdoverR;
    let swing = 0;
    if (swingable) {
      const u1 = Math.max(1e-12, rand());
      swing = nationalSd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand()); // Box-Muller
    }
    for (let j = 0; j < rProbs.length; j++) {
      const p = swingable && swingable[j] ? winProbRFast(races[j].margin! + swing, races[j].strength!) : rProbs[j];
      if (rand() < p) { rSeats++; raceRWins[j]++; }
    }
    rSeatsDist.push(rSeats);
    seatHistogram[rSeats]++;
    if (rSeats >= baseline.majority) rWins++;
    else if (baseline.totalSeats - rSeats >= baseline.majority) dWins++;
    else ties++;
  }

  const sorted = [...rSeatsDist].sort((a, b) => a - b);
  const meanR = rSeatsDist.reduce((a, b) => a + b, 0) / iterations;
  const dDist = rSeatsDist.map((r) => baseline.totalSeats - r);
  const sortedD = [...dDist].sort((a, b) => a - b);
  const meanD = baseline.totalSeats - meanR;

  return {
    seatsR: { mean: meanR, p10: percentile(sorted, 0.1), median: percentile(sorted, 0.5), p90: percentile(sorted, 0.9) },
    seatsD: { mean: meanD, p10: percentile(sortedD, 0.1), median: percentile(sortedD, 0.5), p90: percentile(sortedD, 0.9) },
    pRControl: rWins / iterations,
    pDControl: dWins / iterations,
    pTie: ties / iterations,
    iterations,
    raceRWins,
    seatHistogram,
  };
}

// Current holdover baselines for the 2026 cycle (seats not on the ballot).
export const SENATE_BASELINE: ChamberBaseline = { holdoverR: 31, holdoverD: 34, totalSeats: 100, majority: 51 };
export const GOVERNOR_BASELINE: ChamberBaseline = { holdoverR: 8, holdoverD: 6, totalSeats: 50, majority: 26 };
export const HOUSE_BASELINE: ChamberBaseline = { holdoverR: 0, holdoverD: 0, totalSeats: 435, majority: 218 };
