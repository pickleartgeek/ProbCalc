import type { HouseSeat } from './types';
import { HOUSE_APPORTIONMENT, STATE_NAMES, STATE_PVI_2024_FALLBACK, PREVIOUS_GCB_R_MARGIN, DEFAULT_CURRENT_GCB_R_MARGIN } from './stateGrid';
import { ratingFromRProb } from './ratings';
import { HOUSE_STRENGTH, winProbR } from './raceProb';
import { mulberry32, seedFrom } from '../mosaicUtil';
import { applyEnvironmentShiftMargin } from '../environmentShift';
import districtPres from '../../data/house-pres-2024.json';

/** Real 2024 presidential margin (R − D, points) per district, keyed "GA-5" (at-large "AK-0"). Source: The Downballot via jaytimm/PresElectionResults; 435 rows minus NY-21 (blank in source). Lines are the 119th-Congress maps — NOT any 2025–26 mid-decade redistricting. */
const REAL_DISTRICT_MARGINS = districtPres as Record<string, number>;

// Each district's "previous result" is its REAL 2024 presidential margin
// (house-pres-2024.json). Only a district missing from that file (NY-21) falls
// back to its state's margin plus a seeded within-state spread.
//
// The actual prediction is the guide's III.II extrapolation (environmentShift.ts)
// applied at full weight (1.0): House districts get essentially no independent
// polling, so the whole estimate rides on how far the generic ballot has moved
// since 2024, applied on top of each district's real previous lean.

function generateOne(
  stateAbbr: string,
  district: number,
  rand: () => number,
  currentGcbRMargin: number,
  stateMargins: Record<string, number>
): HouseSeat {
  const stateMargin = stateMargins[stateAbbr] ?? STATE_PVI_2024_FALLBACK[stateAbbr] ?? 0;
  // Real district result where we have it; otherwise the state lean plus a seeded spread. The draw is always consumed so
  // the fallback for one district never depends on whether its neighbours had real data.
  const spread = (rand() + rand() + rand() - 1.5) * 14; // ~triangular, mean 0, points
  const districtPrevMargin = REAL_DISTRICT_MARGINS[`${stateAbbr}-${district}`] ?? stateMargin + spread;

  const shiftedMargin = applyEnvironmentShiftMargin(
    districtPrevMargin,
    PREVIOUS_GCB_R_MARGIN,
    currentGcbRMargin,
    1 // House: full uniform swing, no independent race-level polling to lean on
  );
  const pR = winProbR(shiftedMargin, HOUSE_STRENGTH); // ProbCalc's own probability for this margin (see raceProb.ts)

  return {
    id: `hd-${stateAbbr.toLowerCase()}-${district}`,
    stateAbbr,
    stateName: STATE_NAMES[stateAbbr],
    district,
    rating: ratingFromRProb(pR),
    margin: shiftedMargin,
    pR,
    strength: HOUSE_STRENGTH,
  };
}

export function generateHouseSeats(
  currentGcbRMargin: number = DEFAULT_CURRENT_GCB_R_MARGIN,
  stateMargins: Record<string, number> = STATE_PVI_2024_FALLBACK
): HouseSeat[] {
  const seats: HouseSeat[] = [];
  for (const [abbr, count] of Object.entries(HOUSE_APPORTIONMENT)) {
    const rand = mulberry32(seedFrom(`house-${abbr}-2026`)); // fixed seed: only the GCB/margin inputs change results, not re-rolled randomness
    if (count === 1) {
      seats.push(generateOne(abbr, 0, rand, currentGcbRMargin, stateMargins)); // at-large
    } else {
      for (let d = 1; d <= count; d++) seats.push(generateOne(abbr, d, rand, currentGcbRMargin, stateMargins));
    }
  }
  return seats;
}

// Fallback-anchored default export, kept for any caller that doesn't (yet)
// have the real margins loaded — SplitTicket.tsx passes the real ones in
// explicitly once precinctAnchor.ts's fetch resolves.
export const HOUSE_SEATS: HouseSeat[] = generateHouseSeats();

/**
 * Previous (2024 presidential) margin, R − D in points, for every House district — the SAME
 * seeded within-state spread generateHouseSeats() uses, so the map baseline and the House
 * forecast can never disagree. Modelled, not measured: real per-district results are not bundled.
 * Keys are cd118 ids ("GA-5"; at-large = "AK-0").
 */
export function houseDistrictPrevMargins(stateMargins: Record<string, number> = STATE_PVI_2024_FALLBACK): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [abbr, count] of Object.entries(HOUSE_APPORTIONMENT)) {
    const rand = mulberry32(seedFrom(`house-${abbr}-2026`));
    const stateMargin = stateMargins[abbr] ?? STATE_PVI_2024_FALLBACK[abbr] ?? 0;
    const ds = count === 1 ? [0] : Array.from({ length: count }, (_, i) => i + 1);
    for (const d of ds) { const fb = stateMargin + (rand() + rand() + rand() - 1.5) * 14; out[`${abbr}-${d}`] = REAL_DISTRICT_MARGINS[`${abbr}-${d}`] ?? fb; }
  }
  return out;
}
