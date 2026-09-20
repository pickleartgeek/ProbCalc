import type { SenateRace } from './types';
import { STATE_NAMES, PREVIOUS_GCB_R_MARGIN } from './stateGrid';
import { RATING_R_PROB, ratingFromRProb, rProbToPseudoMargin, pseudoMarginToRProb } from './ratings';
import { applyEnvironmentShiftMargin } from '../environmentShift';

// The race field (state, seat class, incumbent, open/retiring status) reflects
// the actual 2026 cycle as of this writing. The `rating` on every race is a
// PLACEHOLDER — a reasonable-looking starting point, not a real forecast.
// Swap these for Cook/Sabato/your-own-model ratings whenever you wire in
// real data; nothing else in the app needs to change.
const RAW: Omit<SenateRace, 'id' | 'stateName'>[] = [
  { stateAbbr: 'AL', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: null, open: true, rating: 'SafeR' },
  { stateAbbr: 'AK', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Dan Sullivan', open: false, rating: 'LeanR',
    demCandidate: 'Mary Peltola', repCandidate: 'Dan Sullivan', pollMargin: -2, pollSource: 'Alaska Survey Research (avg, tightening from D+1.6 to D+4)', pollAsOf: '2026-05-26' },
  { stateAbbr: 'AR', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Tom Cotton', open: false, rating: 'SafeR' },
  { stateAbbr: 'CO', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: 'John Hickenlooper', open: false, rating: 'LikelyD' },
  { stateAbbr: 'DE', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: 'Chris Coons', open: false, rating: 'SafeD' },
  { stateAbbr: 'GA', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: 'Jon Ossoff', open: false, rating: 'Tossup',
    demCandidate: 'Jon Ossoff', repCandidate: 'Mike Collins', pollMargin: -4, pollSource: 'Quantus Insights / Rasmussen (avg)', pollAsOf: '2026-09-16' },
  { stateAbbr: 'ID', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Jim Risch', open: false, rating: 'SafeR' },
  { stateAbbr: 'IL', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: null, open: true, rating: 'SafeD' },
  { stateAbbr: 'IA', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: null, open: true, rating: 'LeanR' },
  { stateAbbr: 'KS', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Roger Marshall', open: false, rating: 'SafeR' },
  { stateAbbr: 'KY', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: null, open: true, rating: 'LikelyR' },
  { stateAbbr: 'LA', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: null, open: true, rating: 'SafeR' },
  { stateAbbr: 'ME', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Susan Collins', open: false, rating: 'Tossup',
    demCandidate: 'Troy Jackson', repCandidate: 'Susan Collins', pollMargin: -1.5, pollSource: 'CNN / Abacus / Fox News (avg, tight since Platner-to-Jackson swap)', pollAsOf: '2026-09-06' },
  { stateAbbr: 'MA', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: 'Ed Markey', open: false, rating: 'SafeD' },
  { stateAbbr: 'MI', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: null, open: true, rating: 'Tossup',
    demCandidate: 'Abdul El-Sayed', repCandidate: 'Mike Rogers', pollMargin: -1, pollSource: '270towin 5-poll average', pollAsOf: '2026-08-20' },
  { stateAbbr: 'MN', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: null, open: true, rating: 'LikelyD' },
  { stateAbbr: 'MS', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Cindy Hyde-Smith', open: false, rating: 'SafeR' },
  { stateAbbr: 'MT', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: null, open: true, rating: 'LikelyR' },
  { stateAbbr: 'NE', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Pete Ricketts', open: false, rating: 'LeanR' },
  { stateAbbr: 'NH', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: null, open: true, rating: 'LeanD',
    demCandidate: 'Chris Pappas', repCandidate: 'John Sununu' },
  { stateAbbr: 'NJ', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: 'Cory Booker', open: false, rating: 'SafeD' },
  { stateAbbr: 'NM', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: 'Ben Ray Luján', open: false, rating: 'SafeD' },
  { stateAbbr: 'NC', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: null, open: true, rating: 'Tossup',
    demCandidate: 'Roy Cooper', repCandidate: 'Michael Whatley', pollMargin: -9, pollSource: 'Elon University / 270towin average', pollAsOf: '2026-08-31' },
  { stateAbbr: 'OK', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: null, open: true, rating: 'SafeR' },
  { stateAbbr: 'OR', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: 'Jeff Merkley', open: false, rating: 'SafeD' },
  { stateAbbr: 'RI', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: 'Jack Reed', open: false, rating: 'SafeD' },
  { stateAbbr: 'SC', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Lindsey Graham', open: false, rating: 'SafeR' },
  { stateAbbr: 'SD', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Mike Rounds', open: false, rating: 'SafeR' },
  { stateAbbr: 'TN', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Bill Hagerty', open: false, rating: 'SafeR' },
  { stateAbbr: 'TX', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: null, open: true, rating: 'LikelyR' },
  { stateAbbr: 'VA', seatClass: 2, special: false, incumbentParty: 'D', incumbentName: 'Mark Warner', open: false, rating: 'SafeD' },
  { stateAbbr: 'WV', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: 'Shelley Moore Capito', open: false, rating: 'SafeR' },
  { stateAbbr: 'WY', seatClass: 2, special: false, incumbentParty: 'R', incumbentName: null, open: true, rating: 'SafeR' },
  { stateAbbr: 'FL', seatClass: 3, special: true, incumbentParty: 'R', incumbentName: 'Ashley Moody', open: false, rating: 'SafeR' },
  { stateAbbr: 'OH', seatClass: 3, special: true, incumbentParty: 'R', incumbentName: 'Jon Husted', open: false, rating: 'LeanR' },
];

export const SENATE_RACES: SenateRace[] = RAW.map((r) => ({
  ...r,
  id: `sen-${r.stateAbbr.toLowerCase()}${r.special ? '-sp' : ''}`,
  stateName: STATE_NAMES[r.stateAbbr],
}));

/**
 * Recomputes ratings for a given generic-ballot reading. Where a real 2024
 * ticket-splitting baseline exists for the state (see senatePrecinctAnchor.ts
 * — real for ~34 states that had a 2024 Senate race, a measured-average
 * "universal offset" over the real 2024 presidential margin for the rest),
 * that REAL margin is the race's own baseline instead of the hand-set
 * placeholder rating, and only THAT gets nudged by how the generic ballot has
 * moved since (a light weight, since Senate races are individually polled —
 * unlike the House, which rides the environment at full weight). Races
 * without a loaded anchor yet (or a 2027+ open seat with no useful 2024
 * analogue) fall back to the placeholder rating as before.
 */
export function computeSenateRaces(
  currentGcbRMargin: number,
  weight = 0.25,
  baselineSenateMargins: Record<string, number> = {},
  liveMargins: Record<string, number> = {}
): SenateRace[] {
  return SENATE_RACES.map((r) => {
    // Priority: live, auto-refreshed poll average (scripts/fetch-polls.mts)
    // > hand-researched real polling snapshot > real 2024 precinct
    // ticket-split anchor > placeholder rating.
    const realBaseline = liveMargins[r.id] ?? r.pollMargin ?? baselineSenateMargins[r.stateAbbr];
    const ownMargin = realBaseline ?? rProbToPseudoMargin(RATING_R_PROB[r.rating]);
    // Real, individually-polled races barely need an environment nudge at all (the poll IS the environment);
    // races only anchored to 2024 data still get the fuller nudge.
    const effectiveWeight = realBaseline !== undefined ? Math.min(weight, 0.1) : weight;
    const shifted = applyEnvironmentShiftMargin(ownMargin, PREVIOUS_GCB_R_MARGIN, currentGcbRMargin, effectiveWeight);
    return { ...r, rating: ratingFromRProb(pseudoMarginToRProb(shifted)), computedMargin: shifted };
  });
}
