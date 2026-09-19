import { mulberry32, seedFrom } from '../mosaicUtil';
import { RATING_R_PROB, type Rating } from './ratings';

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
export function simulateChamber(
  races: { rating: Rating }[],
  baseline: ChamberBaseline,
  seedKey: string,
  iterations = 8000
): ChamberSimResult {
  const rand = mulberry32(seedFrom(seedKey));
  const rProbs = races.map((r) => RATING_R_PROB[r.rating]);
  const rSeatsDist: number[] = [];
  let rWins = 0;
  let dWins = 0;
  let ties = 0;

  for (let i = 0; i < iterations; i++) {
    let rSeats = baseline.holdoverR;
    for (const pR of rProbs) {
      if (rand() < pR) rSeats++;
    }
    rSeatsDist.push(rSeats);
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
  };
}

// Current holdover baselines for the 2026 cycle (seats not on the ballot).
export const SENATE_BASELINE: ChamberBaseline = { holdoverR: 31, holdoverD: 34, totalSeats: 100, majority: 51 };
export const GOVERNOR_BASELINE: ChamberBaseline = { holdoverR: 8, holdoverD: 6, totalSeats: 50, majority: 26 };
export const HOUSE_BASELINE: ChamberBaseline = { holdoverR: 0, holdoverD: 0, totalSeats: 435, majority: 218 };
