import type { HouseSeat } from './types';
import { HOUSE_APPORTIONMENT, STATE_NAMES, STATE_PVI_2024, PREVIOUS_GCB_R_MARGIN, DEFAULT_CURRENT_GCB_R_MARGIN } from './stateGrid';
import { ratingFromRProb } from './ratings';
import { mulberry32, seedFrom } from '../mosaicUtil';
import { applyEnvironmentShiftMargin } from '../environmentShift';

// There is no real per-district data here — no district-level 2024 result feed
// is wired in — so each district's "previous result" is approximated as its
// state's 2024 presidential margin (STATE_PVI_2024) plus a seeded within-state
// spread (districts within a state aren't all identical). PLACEHOLDER for the
// within-state spread; the state anchor and the GCB shift itself are real.
//
// The actual prediction is the guide's III.II extrapolation (environmentShift.ts)
// applied at full weight (1.0): House districts get essentially no independent
// polling, so the whole estimate rides on how far the generic ballot has moved
// since 2024, applied on top of each district's approximate previous lean.

function generateOne(stateAbbr: string, district: number, rand: () => number, currentGcbRMargin: number): HouseSeat {
  const stateMargin = STATE_PVI_2024[stateAbbr] ?? 0;
  // Districts within a state spread out around the state's average lean —
  // this within-state spread is the one genuinely synthetic piece.
  const spread = (rand() + rand() + rand() - 1.5) * 14; // ~triangular, mean 0, points
  const districtPrevMargin = stateMargin + spread;

  const shiftedMargin = applyEnvironmentShiftMargin(
    districtPrevMargin,
    PREVIOUS_GCB_R_MARGIN,
    currentGcbRMargin,
    1 // House: full uniform swing, no independent race-level polling to lean on
  );
  const pR = Math.min(0.99, Math.max(0.01, 0.5 + shiftedMargin / 100));

  return {
    id: `hd-${stateAbbr.toLowerCase()}-${district}`,
    stateAbbr,
    stateName: STATE_NAMES[stateAbbr],
    district,
    rating: ratingFromRProb(pR),
  };
}

export function generateHouseSeats(currentGcbRMargin: number = DEFAULT_CURRENT_GCB_R_MARGIN): HouseSeat[] {
  const seats: HouseSeat[] = [];
  for (const [abbr, count] of Object.entries(HOUSE_APPORTIONMENT)) {
    const rand = mulberry32(seedFrom(`house-${abbr}-2026`)); // fixed seed: only the GCB input changes results, not re-rolled randomness
    if (count === 1) {
      seats.push(generateOne(abbr, 0, rand, currentGcbRMargin)); // at-large
    } else {
      for (let d = 1; d <= count; d++) seats.push(generateOne(abbr, d, rand, currentGcbRMargin));
    }
  }
  return seats;
}

export const HOUSE_SEATS: HouseSeat[] = generateHouseSeats();
