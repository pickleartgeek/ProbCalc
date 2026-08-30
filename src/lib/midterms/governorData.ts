import type { GovernorRace } from './types';
import { STATE_NAMES, PREVIOUS_GCB_R_MARGIN } from './stateGrid';
import { RATING_R_PROB, ratingFromRProb, rProbToPseudoMargin, pseudoMarginToRProb } from './ratings';
import { applyEnvironmentShiftMargin } from '../environmentShift';

// Same convention as senateData.ts: real 2026 field, PLACEHOLDER ratings.
const RAW: Omit<GovernorRace, 'id' | 'stateName'>[] = [
  { stateAbbr: 'AL', incumbentParty: 'R', incumbentName: null, open: true, rating: 'SafeR' },
  { stateAbbr: 'AK', incumbentParty: 'R', incumbentName: null, open: true, rating: 'LikelyR' },
  { stateAbbr: 'AZ', incumbentParty: 'D', incumbentName: 'Katie Hobbs', open: false, rating: 'LeanD' },
  { stateAbbr: 'AR', incumbentParty: 'R', incumbentName: 'Sarah Huckabee Sanders', open: false, rating: 'SafeR' },
  { stateAbbr: 'CA', incumbentParty: 'D', incumbentName: null, open: true, rating: 'SafeD' },
  { stateAbbr: 'CO', incumbentParty: 'D', incumbentName: null, open: true, rating: 'LikelyD' },
  { stateAbbr: 'CT', incumbentParty: 'D', incumbentName: 'Ned Lamont', open: false, rating: 'SafeD' },
  { stateAbbr: 'FL', incumbentParty: 'R', incumbentName: null, open: true, rating: 'LikelyR' },
  { stateAbbr: 'GA', incumbentParty: 'R', incumbentName: null, open: true, rating: 'Tossup' },
  { stateAbbr: 'HI', incumbentParty: 'D', incumbentName: 'Josh Green', open: false, rating: 'SafeD' },
  { stateAbbr: 'ID', incumbentParty: 'R', incumbentName: 'Brad Little', open: false, rating: 'SafeR' },
  { stateAbbr: 'IL', incumbentParty: 'D', incumbentName: 'JB Pritzker', open: false, rating: 'SafeD' },
  { stateAbbr: 'IA', incumbentParty: 'R', incumbentName: null, open: true, rating: 'LikelyR' },
  { stateAbbr: 'KS', incumbentParty: 'D', incumbentName: null, open: true, rating: 'LeanR' },
  { stateAbbr: 'ME', incumbentParty: 'D', incumbentName: null, open: true, rating: 'LeanD' },
  { stateAbbr: 'MD', incumbentParty: 'D', incumbentName: 'Wes Moore', open: false, rating: 'SafeD' },
  { stateAbbr: 'MA', incumbentParty: 'D', incumbentName: 'Maura Healey', open: false, rating: 'SafeD' },
  { stateAbbr: 'MI', incumbentParty: 'D', incumbentName: null, open: true, rating: 'Tossup' },
  { stateAbbr: 'MN', incumbentParty: 'D', incumbentName: null, open: true, rating: 'LeanD' },
  { stateAbbr: 'NE', incumbentParty: 'R', incumbentName: 'Jim Pillen', open: false, rating: 'SafeR' },
  { stateAbbr: 'NV', incumbentParty: 'R', incumbentName: 'Joe Lombardo', open: false, rating: 'LeanR' },
  { stateAbbr: 'NH', incumbentParty: 'R', incumbentName: 'Kelly Ayotte', open: false, rating: 'LikelyR' },
  { stateAbbr: 'NM', incumbentParty: 'D', incumbentName: null, open: true, rating: 'LikelyD' },
  { stateAbbr: 'NY', incumbentParty: 'D', incumbentName: 'Kathy Hochul', open: false, rating: 'LikelyD' },
  { stateAbbr: 'OH', incumbentParty: 'R', incumbentName: null, open: true, rating: 'LikelyR' },
  { stateAbbr: 'OK', incumbentParty: 'R', incumbentName: null, open: true, rating: 'SafeR' },
  { stateAbbr: 'OR', incumbentParty: 'D', incumbentName: 'Tina Kotek', open: false, rating: 'LikelyD' },
  { stateAbbr: 'PA', incumbentParty: 'D', incumbentName: 'Josh Shapiro', open: false, rating: 'LikelyD' },
  { stateAbbr: 'RI', incumbentParty: 'D', incumbentName: 'Dan McKee', open: false, rating: 'SafeD' },
  { stateAbbr: 'SC', incumbentParty: 'R', incumbentName: null, open: true, rating: 'SafeR' },
  { stateAbbr: 'SD', incumbentParty: 'R', incumbentName: 'Larry Rhoden', open: false, rating: 'SafeR' },
  { stateAbbr: 'TN', incumbentParty: 'R', incumbentName: null, open: true, rating: 'SafeR' },
  { stateAbbr: 'TX', incumbentParty: 'R', incumbentName: 'Greg Abbott', open: false, rating: 'SafeR' },
  { stateAbbr: 'VT', incumbentParty: 'R', incumbentName: 'Phil Scott', open: false, rating: 'SafeR' },
  { stateAbbr: 'WI', incumbentParty: 'D', incumbentName: null, open: true, rating: 'Tossup' },
  { stateAbbr: 'WY', incumbentParty: 'R', incumbentName: null, open: true, rating: 'SafeR' },
];

export const GOVERNOR_RACES: GovernorRace[] = RAW.map((r) => ({
  ...r,
  id: `gov-${r.stateAbbr.toLowerCase()}`,
  stateName: STATE_NAMES[r.stateAbbr],
}));

/** Same idea as computeSenateRaces — individually polled, so a lighter weight. */
export function computeGovernorRaces(currentGcbRMargin: number, weight = 0.25): GovernorRace[] {
  return GOVERNOR_RACES.map((r) => {
    const ownMargin = rProbToPseudoMargin(RATING_R_PROB[r.rating]);
    const shifted = applyEnvironmentShiftMargin(ownMargin, PREVIOUS_GCB_R_MARGIN, currentGcbRMargin, weight);
    return { ...r, rating: ratingFromRProb(pseudoMarginToRProb(shifted)) };
  });
}
