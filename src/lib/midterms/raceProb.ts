// Win probabilities for a two-candidate race, straight from ProbCalc's own engine.
//
// runProbCalc (../probCalc.ts) draws a Gamma(alpha_i) for every candidate, normalises the draws to vote shares and gives
// the race to the biggest share. For TWO candidates that normalised share is exactly Beta(alphaR, alphaD) distributed, so
// "the fraction of simulations the Republican wins" is P(Beta(alphaR, alphaD) > 1/2) — the regularised incomplete beta
// function. This module evaluates that directly, so a race's probability is precisely what running ProbCalc would
// converge to (tests/raceprob.test.ts checks it against runProbCalc itself), with no sampling noise and no separate,
// hand-made margin-to-probability scale.
//
// What sets how sure ProbCalc is: the SIZE of the alphas. In BaseCalc an alpha is the sum over polls of
// (poll share x sample size / (days till election x divisor)), so more and fresher polling means bigger alphas and a
// tighter result. A race with real polling uses its actual BaseCalc alphas; a race with only a 2024-anchored margin has
// no polls, so it gets a fixed prior strength (STATE_STRENGTH / HOUSE_STRENGTH below).

/** Combined D+R alpha for a state-wide race with no polling of its own (about a ±7-point 1-sigma on the margin). */
export const STATE_STRENGTH = 200;
/** Same for a House district: no polling and a noisier anchor, so a weaker prior (about ±10 points). */
export const HOUSE_STRENGTH = 90;
/**
 * Bounds applied to a polled race's real D+R alpha. BaseCalc weights by 1/daysTillElection, so in the last days before
 * the election a handful of polls drives alpha into the thousands and the race looks certain — far more confident than
 * poll error allows. The cap (about ±5 points) keeps a polled race from claiming more precision than polls have had.
 */
export const STRENGTH_FLOOR = 40;
export const STRENGTH_CAP = 400;
/** One-sigma shared national swing (points) applied to every race in a simulation, so races don't err independently. */
export const NATIONAL_SD = 2;

export const clampStrength = (a: number): number => Math.min(STRENGTH_CAP, Math.max(STRENGTH_FLOOR, a));

// ---- regularised incomplete beta (Numerical Recipes, continued fraction) ---------------------------------------------
function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let t = x + 5.5;
  t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (let j = 0; j < 6; j++) s += c[j] / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
function betaContinuedFraction(a: number, b: number, x: number): number {
  const FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
/** I_x(a, b): P(Beta(a, b) <= x). */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betaContinuedFraction(a, b, x)) / a : 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * The two candidates' ProbCalc alphas for a race at `marginR` (R − D, points) with combined strength `strength`.
 * Shares are 50 ± margin/2, the same convention the environment shift uses.
 */
export function twoPartyAlphas(marginR: number, strength: number): { alphaD: number; alphaR: number } {
  const rShare = Math.min(0.9995, Math.max(0.0005, 0.5 + marginR / 200));
  return { alphaR: rShare * strength, alphaD: (1 - rShare) * strength };
}

/** P(the Republican wins) — what runProbCalc's simulations converge to for these two alphas. */
export function winProbR(marginR: number, strength: number): number {
  const { alphaD, alphaR } = twoPartyAlphas(marginR, strength);
  return 1 - betaCdf(0.5, alphaR, alphaD);
}

// ---- fast lookup for the simulations ---------------------------------------------------------------------------------
// The chamber simulations need P(R wins) for hundreds of races across thousands of iterations, each at its own margin
// plus that iteration's national swing. winProbR is exact but not free, so tabulate it once per strength on a fine grid
// (0.25-point steps) and interpolate — the error is far below a simulation's own sampling noise.
const GRID_MIN = -125, GRID_MAX = 125, GRID_STEP = 0.25;
const tables = new Map<number, Float64Array>();
function tableFor(strength: number): Float64Array {
  const key = Math.round(strength / 5) * 5; // strengths within 5 share a table
  let t = tables.get(key);
  if (!t) {
    const n = Math.round((GRID_MAX - GRID_MIN) / GRID_STEP) + 1;
    t = new Float64Array(n);
    for (let i = 0; i < n; i++) t[i] = winProbR(GRID_MIN + i * GRID_STEP, key);
    tables.set(key, t);
  }
  return t;
}
/** Interpolated winProbR — use inside simulation loops. */
export function winProbRFast(marginR: number, strength: number): number {
  const t = tableFor(strength);
  const x = (Math.min(GRID_MAX, Math.max(GRID_MIN, marginR)) - GRID_MIN) / GRID_STEP;
  const i = Math.min(t.length - 2, Math.floor(x));
  return t[i] + (t[i + 1] - t[i]) * (x - i);
}

/** The margin (R − D, points) at which a race of this strength gives the Republican win probability `p` — for races known only by a rating band. */
export function marginForRProb(p: number, strength: number): number {
  const target = Math.min(0.995, Math.max(0.005, p));
  let lo = -100, hi = 100;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (winProbR(mid, strength) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** How much of the national generic-ballot movement since 2024 an UNPOLLED Senate/Governor race takes on (polled races keep min(weight, 0.1) — their own polls already carry the environment). */
export const UNPOLLED_ENV_WEIGHT = 0.6;
