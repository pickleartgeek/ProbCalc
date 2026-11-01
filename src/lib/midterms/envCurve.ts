import { simulateChamber, SENATE_BASELINE, GOVERNOR_BASELINE, HOUSE_BASELINE, type SimRace } from './simulate';

export interface ControlCurvePoint {
  /** national generic-ballot margin, points, R positive */
  gcb: number;
  /** P(Democratic control) of each chamber at that environment, 0-1 */
  senate: number;
  governors: number;
  house: number;
}

type Rated = SimRace[];

/**
 * "How much do the odds depend on the national mood?" — reruns all three chamber simulations at each generic-ballot
 * value. The seeds match the page's own simulations (and are the same at every step), so the only thing that changes
 * between points is the environment: the curves are smooth and monotone rather than jittering with sampling noise.
 */
export function controlCurve(opts: {
  gcbs: number[];
  senate: (gcb: number) => Rated;
  governors: (gcb: number) => Rated;
  house: (gcb: number) => Rated;
  iterations?: number;
  nationalSd?: number;
}): ControlCurvePoint[] {
  const n = opts.iterations ?? 1500;
  return opts.gcbs.map((gcb) => ({
    gcb,
    senate: simulateChamber(opts.senate(gcb), SENATE_BASELINE, 'senate-2026', n, { nationalSd: opts.nationalSd }).pDControl,
    governors: simulateChamber(opts.governors(gcb), GOVERNOR_BASELINE, 'governors-2026', n, { nationalSd: opts.nationalSd }).pDControl,
    house: simulateChamber(opts.house(gcb), HOUSE_BASELINE, 'house-2026', n, { nationalSd: opts.nationalSd }).pDControl,
  }));
}

/**
 * The tipping-point race: line the races up from most to least Republican (by P(R wins)); the race whose seat takes the
 * Republicans over `majority` (holdovers counted) is the one that decides control if every race goes the way it leans.
 * Returns its index in that ordering, or -1 if the Republicans can't get there (or are there before any race is decided).
 */
export function tippingIndex(pR: number[], holdoverR: number, majority: number): { order: number[]; at: number } {
  const order = pR.map((_, i) => i).sort((a, b) => pR[b] - pR[a]);
  let seats = holdoverR;
  for (let k = 0; k < order.length; k++) {
    seats++;
    if (seats >= majority) return { order, at: k };
  }
  return { order, at: -1 };
}
