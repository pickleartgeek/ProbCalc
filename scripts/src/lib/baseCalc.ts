import type { BaseCalcResult, Party, PollRow } from './types';
import { daysBetween } from './dateUtils';

export interface BaseCalcOptions {
  /** Guide's default recency divisor — lower decays faster with age. */
  divisor?: number;
  /** Exclude any poll with a fieldwork end date before this ISO date (the guide's "cut off the polling at a pivotal point" practice). */
  cutoffDate?: string | null;
  /** Exclude polls below this sample size entirely. */
  minSampleSize?: number;
  /** Which date to measure "days till election" from: the fieldwork end date (default, favors freshness) or the midpoint of start/end (the guide's "average the date" alternative — softer on polls fielded over a long period). */
  dateBasis?: 'end' | 'midpoint';
}

/**
 * Implements the guide's BaseCalc formula:
 *   weight = (pollResult * sampleSize) / (daysTillElection * divisor)
 *   alpha  = sum(weight) across all included polls for a party
 *   pct    = alpha / sum(all alphas)
 *
 * daysTillElection is clamped to a minimum of 1 to avoid divide-by-zero for
 * polls released on election day itself, and rows are only included when they
 * have a usable date, sample size, and are not flagged as the election result
 * itself (that's the ground truth, not a poll).
 */
export function computeBaseCalc(
  parties: Party[],
  rows: PollRow[],
  electionDateIso: string,
  options: BaseCalcOptions | number = {}
): { results: BaseCalcResult[]; includedPolls: number; excludedPolls: number } {
  // Back-compat: a bare number is still accepted as the divisor.
  const opts: BaseCalcOptions = typeof options === 'number' ? { divisor: options } : options;
  const divisor = opts.divisor ?? 100;
  const minSampleSize = opts.minSampleSize ?? 0;
  const cutoffDate = opts.cutoffDate || null;
  const dateBasis = opts.dateBasis ?? 'end';

  const alphas: Record<string, number> = {};
  parties.forEach((p) => (alphas[p.id] = 0));

  let included = 0;
  let excluded = 0;

  for (const row of rows) {
    if (row.isElectionResult) continue;
    if (!row.fieldworkEnd || row.sampleSize === null || row.sampleSize <= 0) {
      excluded++;
      continue;
    }
    if (row.sampleSize < minSampleSize) {
      excluded++;
      continue;
    }
    if (cutoffDate && row.fieldworkEnd < cutoffDate) {
      excluded++;
      continue;
    }

    const anchorDate =
      dateBasis === 'midpoint' && row.fieldworkStart ? midpointIso(row.fieldworkStart, row.fieldworkEnd) : row.fieldworkEnd;
    const daysTillElection = Math.max(1, daysBetween(anchorDate, electionDateIso));
    let hasAnyValue = false;
    for (const party of parties) {
      const v = row.values[party.id];
      if (v === undefined) continue;
      hasAnyValue = true;
      const weight = (v * row.sampleSize) / (daysTillElection * divisor);
      alphas[party.id] += weight;
    }
    if (hasAnyValue) included++;
    else excluded++;
  }

  const sumAlpha = Object.values(alphas).reduce((a, b) => a + b, 0);
  const results: BaseCalcResult[] = parties.map((p) => ({
    partyId: p.id,
    alpha: alphas[p.id],
    percentage: sumAlpha > 0 ? alphas[p.id] / sumAlpha : 0,
  }));

  return { results, includedPolls: included, excludedPolls: excluded };
}

function midpointIso(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end)) return endIso;
  return new Date((start + end) / 2).toISOString().slice(0, 10);
}

