// Universal precinct RESULTS adapter.
//
// Precinct-level election data shows up in the wild in two fundamentally
// different shapes, and any real dataset (NYT, MIT/MEDSL, a state SoS CSV,
// a Reddit-community count) is one of these two, or close to it:
//
//  1. "Baked-in" — geometry and results already live together, one row/
//     feature per precinct, candidates as columns (e.g. the NYT precinct
//     topojson: {GEOID, votes_dem, votes_rep, votes_total, pct_dem_lead}).
//     -> extractBakedResults()
//
//  2. "Long format" — one row per (precinct x candidate x [mode]), the
//     MEDSL/Dataverse convention (precinct, candidate, party, votes, mode,
//     county_fips...), which needs pivoting into per-precinct candidate
//     columns AND summing across modes (election day / early / absentee)
//     before it means anything. Usually has NO geometry attached at all —
//     joining it to boundaries requires a separate crosswalk (see
//     joinResultsToFeatures below, and its diagnostics).
//     -> pivotLongFormat()
//
// Everything downstream of either path funnels into the same PrecinctResult
// shape, so the rest of the app (color scales, victory classification,
// hover tooltips) never needs to know which format the data started as.

export interface PrecinctResult {
  id: string;
  /** Candidate/party display name -> vote count. */
  candidates: Record<string, number>;
  total: number;
  winner: string | null;
  /** Winning candidate's share of the total, 0-1. */
  leaderShare: number | null;
  /** Winner share minus runner-up share, 0-1 (two-way margin, always >= 0). */
  margin: number | null;
  /** From "Understanding ProbCalc" III.I: plurality (<50%), majority (>=50%), supermajority (>=66%). */
  classification: VictoryClass | null;
  /** Anything else worth carrying through (county, state, mode breakdown, etc). */
  meta?: Record<string, unknown>;
}

export type VictoryClass = 'plurality' | 'majority' | 'supermajority';

export interface VictoryThresholds {
  majority: number;
  supermajority: number;
}

export const DEFAULT_THRESHOLDS: VictoryThresholds = { majority: 0.5, supermajority: 0.66 };

/**
 * Mirrors "Understanding ProbCalc" III.I exactly: winner share >= supermajority
 * threshold -> Supermajority; >= majority threshold -> Majority; else Plurality.
 * Kept as a pure function of a share so it works identically whether the
 * share came from a real count or a ProbCalc simulation draw.
 */
export function classifyVictory(
  leaderShare: number,
  thresholds: VictoryThresholds = DEFAULT_THRESHOLDS
): VictoryClass {
  if (leaderShare >= thresholds.supermajority) return 'supermajority';
  if (leaderShare >= thresholds.majority) return 'majority';
  return 'plurality';
}

/** Turns a candidate -> votes map into the full PrecinctResult (winner, margin, classification). */
export function computeResult(
  id: string,
  candidates: Record<string, number>,
  meta?: Record<string, unknown>,
  thresholds?: VictoryThresholds
): PrecinctResult {
  const entries = Object.entries(candidates).filter(([, v]) => Number.isFinite(v));
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  entries.sort((a, b) => b[1] - a[1]);

  const [winner, winnerVotes] = entries[0] ?? [null, 0];
  const runnerUpVotes = entries[1]?.[1] ?? 0;
  const leaderShare = total > 0 && winner != null ? winnerVotes / total : null;
  const margin = total > 0 ? (winnerVotes - runnerUpVotes) / total : null;

  return {
    id,
    candidates,
    total,
    winner: total > 0 ? winner : null,
    leaderShare,
    margin,
    classification: leaderShare != null ? classifyVictory(leaderShare, thresholds) : null,
    meta,
  };
}

// ---------------------------------------------------------------------------
// Path 1: baked-in results (geometry + results together, e.g. NYT topojson)
// ---------------------------------------------------------------------------

export interface BakedResultsOptions {
  /** Property holding the precinct id. Default: 'GEOID'. */
  idProperty?: string;
  /**
   * Which properties are candidate vote counts, and what to label each one.
   * If omitted, columns are auto-detected (see autoDetectVoteColumns).
   */
  candidateFields?: Record<string, string>; // { displayName: propertyKey }
  /** Extra properties to keep on `meta` (e.g. 'state', 'county'). */
  metaFields?: string[];
  thresholds?: VictoryThresholds;
}

/** Heuristic column sniffing for baked-results properties, e.g. NYT's votes_dem/votes_rep/votes_total. */
export function autoDetectVoteColumns(sampleProps: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const VOTE_COL = /^votes?[_-]?(?<name>[a-z0-9]+)$/i;
  for (const key of Object.keys(sampleProps)) {
    const m = key.match(VOTE_COL);
    if (!m || !m.groups) continue;
    const name = m.groups.name.toLowerCase();
    if (name === 'total' || name === 'all' || name === 'count') continue; // that's the sum, not a candidate
    if (typeof sampleProps[key] !== 'number') continue;
    out[m.groups.name.toUpperCase()] = key;
  }
  return out;
}

/**
 * Reads results straight off feature properties — no join needed. Works on
 * GeoJSON features or the properties bag from a topojson-client `feature()`
 * call; pass in `feature.properties` plus an id, or the whole feature list.
 */
export function extractBakedResults(
  features: Array<{ id?: string | number; properties: Record<string, unknown> }>,
  opts: BakedResultsOptions = {}
): PrecinctResult[] {
  const idProp = opts.idProperty ?? 'GEOID';
  const fields = opts.candidateFields ?? (features[0] ? autoDetectVoteColumns(features[0].properties) : {});

  return features.map((f, i) => {
    const id = String(f.properties[idProp] ?? f.id ?? `feature-${i}`);
    const candidates: Record<string, number> = {};
    for (const [display, key] of Object.entries(fields)) {
      const v = f.properties[key];
      if (typeof v === 'number') candidates[display] = v;
    }
    const meta: Record<string, unknown> = {};
    for (const key of opts.metaFields ?? []) meta[key] = f.properties[key];
    return computeResult(id, candidates, meta, opts.thresholds);
  });
}

// ---------------------------------------------------------------------------
// Path 2: long format (one row per precinct x candidate x mode, e.g. MEDSL/Dataverse CSVs)
// ---------------------------------------------------------------------------

export interface LongFormatOptions {
  /** Column(s) that together uniquely identify a precinct. Composite keys are joined with '|'. */
  idFields: string[];
  /** Column holding the candidate/party name to pivot into a result column. */
  candidateField: string;
  /** Column holding the vote count for that row. */
  votesField: string;
  /**
   * Optional filter, e.g. { office: 'US SENATE' } to pull one race out of a
   * file with several stacked together (president + senate + governor, etc).
   */
  filter?: Record<string, string>;
  /** Rows are summed across whatever's in this column (e.g. 'mode': election day + early + absentee -> one total). No special handling needed beyond summing — it just shouldn't become part of the id or the candidate key. */
  metaFields?: string[];
  thresholds?: VictoryThresholds;
}

/**
 * Pivots long-format rows into one PrecinctResult per unique id, summing
 * votes for the same (id, candidate) across every other column (modes,
 * duplicate rows, etc). This is the Dataverse/MEDSL shape: `precinct,
 * candidate, party, votes, mode, county_fips, office, ...` — one row per
 * precinct x candidate x mode.
 */
export function pivotLongFormat(
  rows: Array<Record<string, string | number>>,
  opts: LongFormatOptions
): PrecinctResult[] {
  const groups = new Map<string, { candidates: Map<string, number>; meta: Record<string, unknown> }>();

  for (const row of rows) {
    if (opts.filter) {
      let skip = false;
      for (const [k, v] of Object.entries(opts.filter)) {
        if (String(row[k] ?? '').trim().toUpperCase() !== v.trim().toUpperCase()) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
    }

    const id = opts.idFields.map((f) => String(row[f] ?? '').trim()).join('|');
    if (!id) continue;

    const candidate = String(row[opts.candidateField] ?? '').trim();
    const votes = Number(row[opts.votesField]);
    if (!candidate || !Number.isFinite(votes)) continue;

    let group = groups.get(id);
    if (!group) {
      const meta: Record<string, unknown> = {};
      for (const f of opts.metaFields ?? []) meta[f] = row[f];
      group = { candidates: new Map(), meta };
      groups.set(id, group);
    }
    group.candidates.set(candidate, (group.candidates.get(candidate) ?? 0) + votes);
  }

  const results: PrecinctResult[] = [];
  for (const [id, group] of groups) {
    results.push(computeResult(id, Object.fromEntries(group.candidates), group.meta, opts.thresholds));
  }
  return results;
}

/** Drops rows whose candidate is a ballot-accounting artifact rather than an actual choice. */
export const NON_CANDIDATE_ROWS = new Set(['WRITE-IN', 'OVERVOTES', 'UNDERVOTES', 'UNDER VOTES', 'OVER VOTES', 'SCATTERING']);

// ---------------------------------------------------------------------------
// Joining results (from either path) onto rendered geometry
// ---------------------------------------------------------------------------

export interface JoinReport {
  matched: number;
  unmatchedFeatures: number;
  unmatchedResults: number;
  sampleUnmatchedFeatureIds: string[];
  sampleUnmatchedResultIds: string[];
}

/**
 * Joins a PrecinctResult[] onto ProjectedFeature-like objects by id. Real
 * precinct joins (e.g. MEDSL precinct names -> Census/VEST GEOIDs) are
 * rarely 1:1 out of the box, so this always returns a report alongside the
 * matches — check `unmatchedFeatures`/`unmatchedResults` before trusting a
 * map is complete. A join key mismatch (name case, county prefix, whitespace)
 * is the single most common reason a real map renders "empty."
 */
export function joinResultsToFeatures<F extends { id: string }>(
  features: F[],
  results: PrecinctResult[]
): { joined: Array<{ feature: F; result: PrecinctResult }>; report: JoinReport } {
  const byId = new Map(results.map((r) => [r.id, r]));
  const usedResultIds = new Set<string>();
  const joined: Array<{ feature: F; result: PrecinctResult }> = [];
  const unmatchedFeatureIds: string[] = [];

  for (const feature of features) {
    const result = byId.get(feature.id);
    if (result) {
      joined.push({ feature, result });
      usedResultIds.add(result.id);
    } else {
      unmatchedFeatureIds.push(feature.id);
    }
  }

  const unmatchedResultIds = results.filter((r) => !usedResultIds.has(r.id)).map((r) => r.id);

  return {
    joined,
    report: {
      matched: joined.length,
      unmatchedFeatures: unmatchedFeatureIds.length,
      unmatchedResults: unmatchedResultIds.length,
      sampleUnmatchedFeatureIds: unmatchedFeatureIds.slice(0, 8),
      sampleUnmatchedResultIds: unmatchedResultIds.slice(0, 8),
    },
  };
}

// ---------------------------------------------------------------------------
// Precinct-level ProbCalc simulation
// ---------------------------------------------------------------------------

/**
 * Runs an independent gamma draw for each candidate in a single precinct,
 * using that precinct's own REAL vote counts as the BaseCalc alpha input —
 * "Understanding ProbCalc" II.II applied at precinct scale instead of
 * national-poll scale. A precinct with 4,000 real votes produces a much
 * tighter simulated distribution than one with 40, exactly as the guide's
 * gamma-shape behavior predicts (bigger alpha -> more concentrated curve).
 * Real vote counts run well into the thousands, so alpha needs the same
 * *100 divisor the guide uses for polls (documented in II.I.ii) to keep
 * variance visible instead of collapsing to a near-certain draw.
 */
export function simulatePrecinct(
  candidates: Record<string, number>,
  sampleGamma: (shape: number, scale: number) => number,
  beta = 1,
  alphaDivisor = 100
): Record<string, number> {
  const draws: Record<string, number> = {};
  let total = 0;
  for (const [name, votes] of Object.entries(candidates)) {
    const alpha = Math.max(votes, 0) / alphaDivisor;
    const draw = alpha > 0 ? sampleGamma(alpha, beta) : 0;
    draws[name] = draw;
    total += draw;
  }
  if (total === 0) return Object.fromEntries(Object.keys(candidates).map((k) => [k, 0]));
  const shares: Record<string, number> = {};
  for (const [name, draw] of Object.entries(draws)) shares[name] = draw / total;
  return shares;
}

// ---------------------------------------------------------------------------
// Uniform swing (real precincts -> a simulated result at a different statewide margin)
// ---------------------------------------------------------------------------

/** Statewide two-party margin across a set of results, in points, poleA positive (e.g. R − D). */
export function aggregateTwoPartyMargin(results: PrecinctResult[], poleA: string, poleB: string): number | null {
  let a = 0, b = 0;
  for (const r of results) { a += r.candidates[poleA] ?? 0; b += r.candidates[poleB] ?? 0; }
  if (a + b === 0) return null;
  return ((a - b) / (a + b)) * 100;
}

/**
 * Applies a uniform partisan swing to every precinct: each precinct's poleA/poleB VOTE SHARE moves by the same
 * number of points, turnout (each precinct's total, and any other candidate's votes) held fixed. This is the
 * standard back-of-envelope way to turn a real, granular result into "what would this have looked like at a
 * different statewide margin" — the same assumption behind the House's state-PVI anchor (environmentShift.ts),
 * just applied precinct by precinct instead of state by state. It is a simplification (real swings are never
 * perfectly uniform — see the guide's discussion of differential swing) but needs no extra data beyond the real
 * precincts already on hand, and is honest about being a simulation rather than a measurement (see the caller's
 * "simulated" labeling — never mix these results into anything presented as real 2026 returns).
 */
export function applyUniformSwing(
  results: PrecinctResult[],
  deltaPoints: number,
  poleA: string,
  poleB: string,
  thresholds?: VictoryThresholds
): PrecinctResult[] {
  if (deltaPoints === 0) return results;
  const halfShift = deltaPoints / 2 / 100; // points -> a 0-1 share delta, split between the two poles
  return results.map((r) => {
    const a = r.candidates[poleA] ?? 0;
    const b = r.candidates[poleB] ?? 0;
    const twoPartyTotal = a + b;
    if (twoPartyTotal === 0) return r;
    const newAShare = Math.min(1, Math.max(0, a / twoPartyTotal + halfShift));
    const candidates = { ...r.candidates, [poleA]: newAShare * twoPartyTotal, [poleB]: (1 - newAShare) * twoPartyTotal };
    return computeResult(r.id, candidates, r.meta, thresholds);
  });
}

// ---------------------------------------------------------------------------
// Color scales
// ---------------------------------------------------------------------------

/**
 * Generic two-pole diverging scale: 100% poleA -> colorA, 100% poleB ->
 * colorB, tied -> neutral. Not hardcoded to any two parties — pass whichever
 * two candidate names you want as the poles (typically the top two
 * statewide/nationally, so third-party precincts still render on the same
 * axis rather than defaulting to gray everywhere).
 */
export function twoPoleMarginScale(
  poleA: string,
  poleB: string,
  colorA = '#3b82f6',
  colorB = '#ea4b4b',
  neutral = '#8b8fa3',
  emptyColor = '#1a2233'
) {
  return (result: PrecinctResult | undefined): string => {
    if (!result || result.total === 0) return emptyColor;
    const a = result.candidates[poleA] ?? 0;
    const b = result.candidates[poleB] ?? 0;
    const denom = a + b;
    if (denom === 0) return neutral;
    // t in [-1, 1]: -1 = all B, +1 = all A
    const t = (a - b) / denom;
    return lerpDiverging(t, colorA, neutral, colorB);
  };
}

function lerpDiverging(t: number, colorPos: string, mid: string, colorNeg: string): string {
  const clamped = Math.max(-1, Math.min(1, t));
  // Raw |t| spends most real-world precincts (margins clustering in the
  // 10-40 point range, i.e. |t| well under 1) close to the gray midpoint —
  // that's what was reading as "washed out." A sub-1 exponent front-loads
  // saturation so moderate margins reach a visibly partisan color much
  // sooner, while true 50/50 precincts still land exactly on neutral.
  const SATURATION_CURVE = 0.55;
  const eased = Math.sign(clamped) * Math.pow(Math.abs(clamped), SATURATION_CURVE);
  const [c1, c2, f] = eased >= 0 ? [mid, colorPos, eased] : [mid, colorNeg, -eased];
  return lerpHex(c1, c2, f);
}

function lerpHex(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
