import type { PrecinctResult } from '../precinct/results';
import { nationalFrom, type RegionBaseline } from './baselines';

// Shared by the Results maps and Election Night: turn per-region shares into one colour "value" the canvas can
// bucket cheaply (a leader index and a margin bucket), and build a previous-election baseline out of real precincts.

export const BUCKETS = 8;

/** leaderIndex * BUCKETS + marginBucket — small integers, so 100k precincts collapse into a couple dozen fill batches. */
export function encodeLeader(partyIds: string[], shares: Record<string, number>): number | undefined {
  let best = -1, bestV = -1, second = 0;
  partyIds.forEach((id, i) => {
    const v = shares[id] ?? 0;
    if (v > bestV) { second = Math.max(0, bestV); bestV = v; best = i; }
    else if (v > second) second = v;
  });
  if (best < 0) return undefined;
  const strength = Math.min(1, Math.max(0, bestV - second) * 3.5);
  return best * BUCKETS + Math.round(strength * (BUCKETS - 1));
}

export const decodeLeader = (value: number) => ({ index: Math.floor(value / BUCKETS), bucket: value % BUCKETS });

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`;
};

/** value -> fill colour; `colors` are the party fills already lifted for the dark background. */
export function makeLeaderScale(colors: string[], waiting = '#1c2536'): (value: number | undefined) => string {
  const table: string[] = [];
  colors.forEach((c, i) => { for (let b = 0; b < BUCKETS; b++) table[i * BUCKETS + b] = rgba(c, 0.4 + 0.6 * (b / (BUCKETS - 1))); });
  return (v) => (v === undefined ? waiting : table[v] ?? waiting);
}

const pick = (c: Record<string, number>, re: RegExp) => Object.entries(c).find(([k]) => re.test(k))?.[1] ?? 0;

/**
 * Previous-election baseline from real precinct returns (two named columns, D and R; everything else is the residual
 * "Others" the shift engine already understands). Measured, not modelled: these are the actual 2024 votes.
 */
export function precinctBaseline(results: PrecinctResult[], presetId = 'us-precincts'): RegionBaseline {
  const keys = [{ key: 'D', label: 'Democratic' }, { key: 'R', label: 'Republican' }];
  const regions: RegionBaseline['regions'] = {};
  for (const r of results) {
    const total = r.total || Object.values(r.candidates).reduce((a, b) => a + b, 0);
    if (!(total > 0)) continue;
    regions[r.id] = { votes: total, shares: { D: pick(r.candidates, /^d/i) / total, R: pick(r.candidates, /^r/i) / total } };
  }
  return { presetId, kind: 'measured', source: '2024 presidential result, real precinct returns', keys, regions, national: nationalFrom(regions, keys) };
}
