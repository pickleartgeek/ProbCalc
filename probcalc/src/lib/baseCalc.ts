import type { BaseCalcResult, Party, PollRow } from './types';
import { daysBetween } from './dateUtils';

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
  divisor = 100
): { results: BaseCalcResult[]; includedPolls: number; excludedPolls: number } {
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
    const daysTillElection = Math.max(1, daysBetween(row.fieldworkEnd, electionDateIso));
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
