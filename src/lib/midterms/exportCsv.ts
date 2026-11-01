import { RATING_LABEL } from './ratings';
import type { SenateRace, GovernorRace } from './types';
import type { ChamberSimResult } from './simulate';

type Race = SenateRace | GovernorRace;

const COLUMNS = [
  'chamber', 'state', 'state_name', 'race_id', 'special', 'rating', 'projected_margin_r_minus_d', 'p_republican_win', 'p_democratic_win',
  'sims_republican_won', 'sims_democratic_won', 'simulations', 'incumbent', 'incumbent_party', 'open_seat', 'democratic_candidate',
  'republican_candidate', 'poll_margin_r_minus_d', 'poll_source', 'poll_as_of', 'generic_ballot_r_minus_d',
] as const;

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per race: its rating and projected margin, and how the Monte Carlo resolved it (see simulateChamber's raceRWins). */
export function racesToCsv(chamber: 'Senate' | 'Governor', races: Race[], sim: ChamberSimResult, gcb: number): string {
  const lines = [COLUMNS.join(',')];
  races.forEach((r, i) => {
    const rWins = sim.raceRWins[i];
    const dWins = sim.iterations - rWins;
    lines.push([
      chamber, r.stateAbbr, r.stateName, r.id, 'special' in r ? r.special : false, RATING_LABEL[r.rating],
      r.computedMargin !== undefined ? r.computedMargin.toFixed(2) : '',
      (rWins / sim.iterations).toFixed(4), (dWins / sim.iterations).toFixed(4), rWins, dWins, sim.iterations,
      r.incumbentName ?? '', r.incumbentParty, r.open, r.demCandidate ?? '', r.repCandidate ?? '',
      r.pollMargin ?? '', r.pollSource ?? '', r.pollAsOf ?? '', gcb.toFixed(1),
    ].map(cell).join(','));
  });
  return lines.join('\n') + '\n';
}

/** Hands a CSV to the browser as a download. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
