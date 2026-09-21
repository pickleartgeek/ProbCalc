import { mulberry32, seedFrom } from '../mosaicUtil';
import type { RegionBaseline } from './baselines';

// The election-night engine: turns ONE race aggregate (BaseCalc, or a single ProbCalc draw) into results for
// every region, then plays them back as staggered, partial counts. Pure and seeded — no DOM, no Math.random.

export interface UnitInput {
  id: string;
  name: string;
  group?: string;
  /** weight against other regions: valid votes if known, else 1 */
  votes: number;
  /** previous-election share per race party (0..1) already mapped from baseline keys; missing = no regional information */
  prev?: Record<string, number>;
}

export interface PlanUnit extends UnitInput {
  /** expected final shares (0..1) per party after the regional lean is applied */
  expected: Record<string, number>;
  /** the sampled final result */
  final: Record<string, number>;
  start: number;
  dur: number;
  batches: number;
  bias: Record<string, number>;
}

export interface ReturnsPlan {
  partyIds: string[];
  units: PlanUnit[];
  totalVotes: number;
}

/** Marsaglia–Tsang gamma sampler, driven by a seeded rng. */
export function gammaSample(shape: number, rng: () => number): number {
  if (shape < 1) return gammaSample(shape + 1, rng) * Math.pow(Math.max(rng(), 1e-12), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = Math.max(rng(), 1e-12), u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x || Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Dirichlet draw: independent gammas normalised — the same construction ProbCalc uses for the national draw. */
function dirichlet(expected: Record<string, number>, kappa: number, ids: string[], rng: () => number): Record<string, number> {
  const g = ids.map((id) => gammaSample(Math.max(1e-3, kappa * (expected[id] ?? 0)), rng));
  const s = g.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(ids.map((id, i) => [id, g[i] / s]));
}

/**
 * Guide III.II generalised. Region expectation = national aggregate + (region's previous share − the previous
 * NATIONAL share), per party. Parties with no previous result keep the aggregate. Rows are clamped and renormalised,
 * then a few rounds of proportional fitting pull the vote-weighted mean back onto the aggregate so the regional
 * lean redistributes votes without moving the national total.
 */
export function regionalExpectations(
  partyIds: string[],
  base: Record<string, number>,
  units: Pick<UnitInput, 'votes' | 'prev'>[],
  prevNational: Record<string, number | undefined>
): Record<string, number>[] {
  const rows = units.map((u) => {
    const raw = partyIds.map((id) => {
      const lean = u.prev && u.prev[id] !== undefined && prevNational[id] !== undefined ? u.prev[id]! - prevNational[id]! : 0;
      return Math.max(0.002, (base[id] ?? 0) + lean);
    });
    const s = raw.reduce((a, b) => a + b, 0);
    return raw.map((v) => v / s);
  });
  const w = units.map((u) => u.votes);
  const wTotal = w.reduce((a, b) => a + b, 0) || 1;
  for (let iter = 0; iter < 8; iter++) {
    const mean = partyIds.map((_, j) => rows.reduce((a, r, i) => a + r[j] * w[i], 0) / wTotal);
    for (const r of rows) {
      let s = 0;
      partyIds.forEach((id, j) => {
        r[j] *= mean[j] > 0 ? (base[id] ?? 0) / mean[j] || 0 : 1;
        r[j] = Math.max(1e-4, r[j]);
        s += r[j];
      });
      for (let j = 0; j < r.length; j++) r[j] /= s;
    }
  }
  return rows.map((r) => Object.fromEntries(partyIds.map((id, j) => [id, r[j]])));
}

export interface PlanOptions {
  seed: string;
  /** base concentration of the regional Dirichlet noise. Larger = tighter to the expectation. */
  noise?: number;
}

export function buildReturnsPlan(
  partyIds: string[],
  base: Record<string, number>,
  units: UnitInput[],
  prevNational: Record<string, number | undefined>,
  opts: PlanOptions
): ReturnsPlan {
  const rng = mulberry32(seedFrom(opts.seed));
  const k0 = opts.noise ?? 90;
  const expected = regionalExpectations(partyIds, base, units, prevNational);

  // reporting order: small regions report first, with plenty of noise (the "rural first" pattern)
  const order = units.map((u, i) => ({ i, v: u.votes })).sort((a, b) => a.v - b.v);
  const rank = new Array<number>(units.length);
  order.forEach((o, r) => (rank[o.i] = r / Math.max(1, units.length - 1)));
  const median = order[Math.floor(order.length / 2)]?.v || 1;

  const planUnits: PlanUnit[] = units.map((u, i) => {
    const kappa = Math.min(800, Math.max(25, k0 * Math.sqrt(u.votes / Math.max(1, median)) * 0.5));
    const final = dirichlet(expected[i], kappa, partyIds, rng);
    const key = 0.35 * rank[i] + 0.65 * rng();
    const start = 0.02 + 0.55 * key;
    const dur = 0.08 + 0.2 * rank[i] + 0.12 * rng();
    // partial counts differ from the final in a random, zero-sum way; fades as the region completes
    const raw = partyIds.map(() => (rng() + rng() + rng() - 1.5) * 0.05);
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
    const bias = Object.fromEntries(partyIds.map((id, j) => [id, raw[j] - mean]));
    return { ...u, expected: expected[i], final, start, dur, batches: 3 + Math.floor(rng() * 5), bias };
  });
  return { partyIds, units: planUnits, totalVotes: planUnits.reduce((a, u) => a + u.votes, 0) };
}

export interface UnitSnapshot {
  id: string;
  /** fraction of this region's votes counted, 0..1 */
  f: number;
  shares: Record<string, number>;
  leader: string | null;
  margin: number;
}
export interface Snapshot {
  t: number;
  units: UnitSnapshot[];
  totals: Record<string, number>;
  reportedVotes: number;
  pctReporting: number;
  regionsComplete: number;
  /** how many regions each party currently leads (regions that have started counting) — the FPTP seat count on a constituency map */
  leads: Record<string, number>;
  ranked: { id: string; votes: number; pct: number }[];
}

/** Counted fraction of one region at playback time t: batches of votes land in steps, not smoothly. */
export function countedFraction(u: Pick<PlanUnit, 'start' | 'dur' | 'batches'>, t: number): number {
  if (t <= u.start) return 0;
  if (t >= u.start + u.dur) return 1;
  const x = (t - u.start) / u.dur;
  return Math.max(1 / u.batches, Math.floor(x * u.batches) / u.batches);
}

export function snapshotAt(plan: ReturnsPlan, t: number): Snapshot {
  const totals: Record<string, number> = Object.fromEntries(plan.partyIds.map((id) => [id, 0]));
  let reported = 0;
  let complete = 0;
  const leads: Record<string, number> = Object.fromEntries(plan.partyIds.map((id) => [id, 0]));
  const units: UnitSnapshot[] = plan.units.map((u) => {
    const f = countedFraction(u, t);
    if (f === 0) return { id: u.id, f, shares: {}, leader: null, margin: 0 };
    if (f >= 1) complete++;
    let s = 0;
    const part: Record<string, number> = {};
    for (const id of plan.partyIds) {
      part[id] = Math.max(1e-6, u.final[id] + (1 - f) * u.bias[id]);
      s += part[id];
    }
    let best = plan.partyIds[0], second = -1, bestV = -1;
    for (const id of plan.partyIds) {
      part[id] /= s;
      if (part[id] > bestV) { second = bestV; bestV = part[id]; best = id; }
      else if (part[id] > second) second = part[id];
    }
    leads[best]++;
    const cast = f * u.votes;
    reported += cast;
    for (const id of plan.partyIds) totals[id] += part[id] * cast;
    return { id: u.id, f, shares: part, leader: best, margin: bestV - Math.max(0, second) };
  });
  const ranked = plan.partyIds.map((id) => ({ id, votes: totals[id], pct: reported > 0 ? totals[id] / reported : 0 })).sort((a, b) => b.votes - a.votes);
  return { t, units, totals, reportedVotes: reported, pctReporting: plan.totalVotes > 0 ? reported / plan.totalVotes : 0, regionsComplete: complete, leads, ranked };
}

const REST = '__rest__';
const isRest = (k: string | null | undefined) => k === REST || k === 'others';

/**
 * Turn a baseline + the party↔key mapping into engine inputs for the participating regions.
 *
 * Two things make the previous-election shift COMPLETE rather than partial:
 *  - "Others" (and any party mapped to the residual) is everything in the baseline that no named race party claims:
 *    1 − Σ(claimed parties) in every region. The Slovak baseline has 25 parties; a poll table names ten. The other
 *    fifteen are not lost, they are Others.
 *  - The reference for "how far did this region lean" is the vote-weighted mean of the PARTICIPATING regions, not the
 *    whole country. A Georgia Senate poll average is a statewide number; leaning each district against the national
 *    result would stack the state's own lean on top of it.
 */
export function unitsFromBaseline(
  regions: { id: string; name: string; group?: string }[],
  baseline: RegionBaseline,
  mapping: Record<string, string | null>
): { units: UnitInput[]; prevNational: Record<string, number | undefined> } {
  const claimed = [...new Set(Object.values(mapping).filter((k): k is string => !!k && !isRest(k)))];
  const units: UnitInput[] = regions.map((r) => {
    const b = baseline.regions[r.id];
    if (!b) return { id: r.id, name: r.name, group: r.group, votes: 1 };
    const claimedSum = claimed.reduce((a, k) => a + (b.shares[k] ?? 0), 0);
    const prev: Record<string, number> = {};
    for (const [pid, key] of Object.entries(mapping)) {
      if (!key) continue;
      if (isRest(key)) prev[pid] = Math.max(0, 1 - claimedSum);
      else if (b.shares[key] !== undefined) prev[pid] = b.shares[key];
    }
    return { id: r.id, name: r.name, group: r.group, votes: b.votes, prev };
  });
  // weighted reference over the regions that actually have baseline data
  const sums: Record<string, number> = {};
  let w = 0;
  for (const u of units) {
    if (!u.prev) continue;
    w += u.votes;
    for (const [pid, v] of Object.entries(u.prev)) sums[pid] = (sums[pid] ?? 0) + v * u.votes;
  }
  const prevNational: Record<string, number | undefined> = {};
  for (const pid of Object.keys(mapping)) prevNational[pid] = mapping[pid] && w > 0 ? (sums[pid] ?? 0) / w : undefined;
  return { units, prevNational };
}

export interface SwingRow {
  partyId: string;
  /** baseline key this party was matched to, REST for the residual bucket, null = no counterpart */
  key: string | null;
  previous: number | undefined;
  now: number;
  /** now − previous, in fraction points; undefined when there is no previous value */
  shift: number | undefined;
}

/**
 * The previous-election → now table shown next to every regional map: who moved, and by how much.
 *
 * `twoParty`: a US precinct/state baseline only knows Democratic and Republican, but a poll average also carries
 * undecideds and third parties. Comparing 46% in a poll with 51% of a two-party vote would show a phantom "−5". With
 * this set, every party that has a baseline column is compared as its share of the pair, and unmatched parties show no shift.
 */
export function swingRows(
  partyIds: string[],
  base: Record<string, number>,
  mapping: Record<string, string | null>,
  prevNational: Record<string, number | undefined>,
  opts: { twoParty?: boolean } = {}
): SwingRow[] {
  const named = partyIds.filter((id) => mapping[id] && !isRest(mapping[id]));
  const nowSum = named.reduce((a, id) => a + (base[id] ?? 0), 0);
  const prevSum = named.reduce((a, id) => a + (prevNational[id] ?? 0), 0);
  return partyIds.map((id) => {
    const key = mapping[id] ?? null;
    if (opts.twoParty) {
      if (!key || isRest(key) || nowSum <= 0 || prevSum <= 0) return { partyId: id, key, previous: undefined, now: base[id] ?? 0, shift: undefined };
      const previous = (prevNational[id] ?? 0) / prevSum;
      const now = (base[id] ?? 0) / nowSum;
      return { partyId: id, key, previous, now, shift: now - previous };
    }
    const previous = prevNational[id];
    return { partyId: id, key, previous, now: base[id] ?? 0, shift: previous === undefined ? undefined : (base[id] ?? 0) - previous };
  });
}

/** True for baselines that only carry D and R (the US ones). */
export const isTwoPartyBaseline = (keys: { key: string }[]) => keys.length > 0 && keys.every((k) => k.key === 'D' || k.key === 'R');

/**
 * One region's rows for a tooltip: previous share, current share, shift. For a two-party baseline the D/R rows are both
 * expressed as a share of the pair (undecideds and third parties would otherwise read as a fall for both sides).
 */
export function shiftDisplay(
  partyIds: string[],
  now: Record<string, number>,
  prev: Record<string, number> | undefined,
  mapping: Record<string, string | null>,
  twoParty: boolean
): Record<string, { before?: number; now: number; delta?: number }> {
  const pair = twoParty ? partyIds.filter((id) => mapping[id] && !isRest(mapping[id])) : [];
  const nowSum = pair.reduce((a, id) => a + (now[id] ?? 0), 0);
  const prevSum = pair.reduce((a, id) => a + (prev?.[id] ?? 0), 0);
  const out: Record<string, { before?: number; now: number; delta?: number }> = {};
  for (const id of partyIds) {
    const inPair = pair.includes(id);
    if (twoParty && !inPair) { out[id] = { now: now[id] ?? 0 }; continue; }
    const n = inPair && nowSum > 0 ? (now[id] ?? 0) / nowSum : now[id] ?? 0;
    const b = prev?.[id] === undefined ? undefined : inPair && prevSum > 0 ? prev[id] / prevSum : prev[id];
    out[id] = { before: b, now: n, delta: b === undefined ? undefined : (n - b) * 100 };
  }
  return out;
}
