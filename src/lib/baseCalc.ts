import type { BaseCalcResult, DateWeighting, Party, PollRow } from './types';
import { daysBetween } from './dateUtils';

// BaseCalc — the deterministic polling aggregate — is a standalone engine: nothing in
// this file touches randomness, and nothing in the Monte Carlo layer is needed to
// produce or render its output. probCalc.ts consumes its alphas, not the other way round.

export interface BaseCalcOptions {
  /** Guide's default recency divisor — lower decays faster with age. */
  divisor?: number;
  /** Exclude any poll with a fieldwork end date before this ISO date (the guide's "cut off the polling at a pivotal point" practice). */
  cutoffDate?: string | null;
  /** Exclude polls below this sample size entirely. */
  minSampleSize?: number;
  /**
   * Cap each poll's *effective* sample size (a 29,719-person Morning Consult tracker counts as `maxSampleSize`, not 30×
   * a normal poll). Without it a handful of huge, frequent trackers swamp everything else in a national average —
   * the generic ballot is the case that needs it. null/undefined = no cap (the guide's default).
   */
  maxSampleSize?: number | null;
  /** Which date to measure "days till election" from: the fieldwork end date (default, favors freshness) or the midpoint of start/end. */
  dateBasis?: 'end' | 'midpoint';
  /**
   * Rolling recency window in days, measured back from `now` (see `nowIso`) — exclude polls
   * older than this, regardless of cutoffDate. null/undefined = fully cumulative. Distinct from
   * TimelineOptions.windowDays below, which is a trailing window relative to each day of the
   * timeline being drawn, not relative to real "now" — this one applies to the single headline
   * BaseCalc number (and hence ProbCalc, the donut, everything that isn't the day-by-day chart).
   */
  recencyWindowDays?: number | null;
  /** Reference "today" for recencyWindowDays purposes. Defaults to the real current date; only ever overridden in tests. */
  nowIso?: string;
}

/** Adapter so the UI's DateWeighting config and the engine's options can't drift apart. */
export function optionsFromWeighting(dw: DateWeighting | undefined): BaseCalcOptions {
  return {
    divisor: dw?.enabled === false ? 1e12 : dw?.divisor ?? 100,
    cutoffDate: dw?.cutoffDate ?? null,
    minSampleSize: dw?.minSampleSize ?? 0,
    maxSampleSize: dw?.maxSampleSize ?? null,
    dateBasis: dw?.dateBasis ?? 'end',
    recencyWindowDays: dw?.recencyWindowDays ?? null,
  };
}

interface IncludedPoll {
  row: PollRow;
  /** the day this poll becomes known to the aggregate (its fieldwork end) */
  availableOn: string;
  daysTillElection: number;
  /** the per-poll factor: sampleSize / (daysTillElection * divisor). alpha contribution = value * factor. */
  factor: number;
  contribution: Record<string, number>;
}
interface ExcludedPoll {
  row: PollRow;
  reason: string;
}

function midpointIso(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end)) return endIso;
  return new Date((start + end) / 2).toISOString().slice(0, 10);
}

/** The single place that decides which polls count and what each one contributes. Every BaseCalc output derives from it. */
function preparePolls(parties: Party[], rows: PollRow[], electionDateIso: string, opts: BaseCalcOptions) {
  const divisor = opts.divisor ?? 100;
  const minSampleSize = opts.minSampleSize ?? 0;
  const maxSampleSize = opts.maxSampleSize && opts.maxSampleSize > 0 ? opts.maxSampleSize : null;
  const cutoffDate = opts.cutoffDate || null;
  const dateBasis = opts.dateBasis ?? 'end';
  const recencyWindowDays = opts.recencyWindowDays ?? null;
  const nowIso = opts.nowIso ?? new Date().toISOString().slice(0, 10);
  const included: IncludedPoll[] = [];
  const excluded: ExcludedPoll[] = [];

  for (const row of rows) {
    if (row.isElectionResult) continue; // ground truth, not a poll
    if (!row.fieldworkEnd) { excluded.push({ row, reason: 'no parseable date' }); continue; }
    if (row.sampleSize === null || row.sampleSize <= 0) { excluded.push({ row, reason: 'no sample size' }); continue; }
    if (row.sampleSize < minSampleSize) { excluded.push({ row, reason: `sample below ${minSampleSize}` }); continue; }
    if (cutoffDate && row.fieldworkEnd < cutoffDate) { excluded.push({ row, reason: `before cutoff ${cutoffDate}` }); continue; }
    if (recencyWindowDays != null && daysBetween(row.fieldworkEnd, nowIso) > recencyWindowDays) {
      excluded.push({ row, reason: `outside trailing ${recencyWindowDays}-day window` });
      continue;
    }

    const anchor = dateBasis === 'midpoint' && row.fieldworkStart ? midpointIso(row.fieldworkStart, row.fieldworkEnd) : row.fieldworkEnd;
    // clamped to 1 so a poll released on election day itself doesn't divide by zero
    const daysTillElection = Math.max(1, daysBetween(anchor, electionDateIso));
    const factor = (maxSampleSize ? Math.min(row.sampleSize, maxSampleSize) : row.sampleSize) / (daysTillElection * divisor);
    const contribution: Record<string, number> = {};
    let any = false;
    for (const p of parties) {
      const v = row.values[p.id];
      if (v === undefined) continue;
      any = true;
      contribution[p.id] = v * factor;
    }
    if (!any) { excluded.push({ row, reason: 'no party values' }); continue; }
    included.push({ row, availableOn: row.fieldworkEnd, daysTillElection, factor, contribution });
  }
  return { included, excluded };
}

function toResults(parties: Party[], alphas: Record<string, number>): BaseCalcResult[] {
  const sum = parties.reduce((a, p) => a + (alphas[p.id] ?? 0), 0);
  return parties.map((p) => ({ partyId: p.id, alpha: alphas[p.id] ?? 0, percentage: sum > 0 ? (alphas[p.id] ?? 0) / sum : 0 }));
}

/**
 * The guide's BaseCalc formula:
 *   weight = (pollResult * sampleSize) / (daysTillElection * divisor)
 *   alpha  = sum(weight) across included polls for a party
 *   pct    = alpha / sum(all alphas)
 */
export function computeBaseCalc(
  parties: Party[],
  rows: PollRow[],
  electionDateIso: string,
  options: BaseCalcOptions | number = {}
): { results: BaseCalcResult[]; includedPolls: number; excludedPolls: number } {
  const opts: BaseCalcOptions = typeof options === 'number' ? { divisor: options } : options; // bare number = divisor (back-compat)
  const { included, excluded } = preparePolls(parties, rows, electionDateIso, opts);
  const alphas: Record<string, number> = {};
  parties.forEach((p) => (alphas[p.id] = 0));
  for (const poll of included) for (const id in poll.contribution) alphas[id] += poll.contribution[id];
  return { results: toResults(parties, alphas), includedPolls: included.length, excludedPolls: excluded.length };
}

// ---------------------------------------------------------------------------------
// Poll weights — what the BaseCalc view shows so people can see WHY the average is what it is
// ---------------------------------------------------------------------------------

export interface PollWeight {
  rowId: string;
  firm: string;
  fieldworkEnd: string;
  sampleSize: number | null;
  daysTillElection: number | null;
  /** sampleSize / (days * divisor) — the multiplier every party value in this poll is scaled by */
  weight: number;
  /** this poll's fraction of the total alpha mass (sums to 1 across included polls) */
  share: number;
  included: boolean;
  reason?: string;
}

export function computePollWeights(parties: Party[], rows: PollRow[], electionDateIso: string, opts: BaseCalcOptions = {}): PollWeight[] {
  const { included, excluded } = preparePolls(parties, rows, electionDateIso, opts);
  const mass = (p: IncludedPoll) => Object.values(p.contribution).reduce((a, b) => a + b, 0);
  const total = included.reduce((a, p) => a + mass(p), 0);
  const inc: PollWeight[] = included.map((p) => ({
    rowId: p.row.id, firm: p.row.firm, fieldworkEnd: p.row.fieldworkEnd, sampleSize: p.row.sampleSize,
    daysTillElection: p.daysTillElection, weight: p.factor, share: total > 0 ? mass(p) / total : 0, included: true,
  }));
  const exc: PollWeight[] = excluded.map((e) => ({
    rowId: e.row.id, firm: e.row.firm, fieldworkEnd: e.row.fieldworkEnd, sampleSize: e.row.sampleSize,
    daysTillElection: null, weight: 0, share: 0, included: false, reason: e.reason,
  }));
  return [...inc, ...exc].sort((a, b) => (b.fieldworkEnd || '').localeCompare(a.fieldworkEnd || ''));
}

// ---------------------------------------------------------------------------------
// Day-by-day trajectory
// ---------------------------------------------------------------------------------

export interface TimelineOptions extends BaseCalcOptions {
  /** Last day to draw. Defaults to the last poll's date; the UI passes "today" (capped at election day) so a live race extends to now. */
  endDate?: string;
  /** null/undefined = cumulative: every poll released so far counts. A number = trailing window of that many days (a true moving average). */
  windowDays?: number | null;
}
export interface TimelinePoint {
  date: string;
  shares: Record<string, number>; // partyId -> 0..1
  /** polls active on this day */
  polls: number;
}

const DAY = 86_400_000;
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const msOf = (iso: string) => Date.parse(iso + 'T00:00:00Z');

/**
 * BaseCalc as it stood on each day, using ONLY polls whose fieldwork had ended by that day (no
 * look-ahead). Each poll keeps the guide's weight — sample / (days-from-poll-to-election * divisor)
 * — so the last day of a cumulative timeline reproduces computeBaseCalc() exactly. That equality
 * is asserted in tests/basecalc.test.ts; it's what lets the day-by-day graph and the headline
 * numbers never disagree.
 */
export function computeBaseCalcTimeline(parties: Party[], rows: PollRow[], electionDateIso: string, opts: TimelineOptions = {}): TimelinePoint[] {
  const { included } = preparePolls(parties, rows, electionDateIso, opts);
  if (included.length === 0) return [];
  const polls = [...included].sort((a, b) => a.availableOn.localeCompare(b.availableOn));
  const first = msOf(polls[0].availableOn);
  const last = opts.endDate ? Math.max(msOf(opts.endDate), first) : msOf(polls[polls.length - 1].availableOn);
  const win = opts.windowDays && opts.windowDays > 0 ? opts.windowDays : null;

  const sums: Record<string, number> = {};
  parties.forEach((p) => (sums[p.id] = 0));
  let add = 0; // next poll to enter
  let drop = 0; // next poll to leave (window mode)
  const points: TimelinePoint[] = [];

  for (let t = first; t <= last; t += DAY) {
    const day = isoOf(t);
    while (add < polls.length && polls[add].availableOn <= day) {
      for (const id in polls[add].contribution) sums[id] += polls[add].contribution[id];
      add++;
    }
    if (win) {
      const floor = isoOf(t - (win - 1) * DAY);
      while (drop < add && polls[drop].availableOn < floor) {
        for (const id in polls[drop].contribution) sums[id] = Math.max(0, sums[id] - polls[drop].contribution[id]);
        drop++;
      }
    }
    const active = add - drop;
    if (active === 0) continue;
    const total = Object.values(sums).reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    const shares: Record<string, number> = {};
    for (const p of parties) shares[p.id] = sums[p.id] / total;
    points.push({ date: day, shares, polls: active });
  }
  return points;
}
