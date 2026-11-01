import { RATING_COLOR, type Rating } from './ratings';

// One definition of what a map can show, shared by the state maps and the county/precinct window so a colour means the
// same thing everywhere. Margins are in points, R positive (the convention everywhere else in Split Ticket).

/** State maps: what each state is coloured by. */
export type MapView = 'rating' | 'margin' | 'probability';

export const MAP_VIEWS: { key: MapView; label: string; hint: string }[] = [
  { key: 'rating', label: 'Rating', hint: 'the model’s rating band' },
  { key: 'margin', label: 'Margin', hint: 'projected vote margin, in points' },
  { key: 'probability', label: 'Win probability', hint: 'share of simulations the Republican wins' },
];

export const isMapView = (v: unknown): v is MapView => v === 'rating' || v === 'margin' || v === 'probability';

/** County / precinct window: what each unit is coloured by. */
export type UnitView = 'margin' | 'rating' | 'winner';

export const UNIT_VIEWS: { key: UnitView; label: string }[] = [
  { key: 'margin', label: 'Margin' },
  { key: 'rating', label: 'Rating' },
  { key: 'winner', label: 'Winner' },
];

const NEUTRAL = '#8b8fa3';
const DEEP_D = '#1d4ed8';
const DEEP_R = '#b91c1c';

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
}

/** Diverging fill for a margin (points, R positive): grey at 0, fully saturated at ±`full` points. */
export function marginColor(marginR: number, full = 20): string {
  if (!Number.isFinite(marginR)) return '#1a2233';
  const t = Math.min(1, Math.abs(marginR) / full);
  return mix(NEUTRAL, marginR >= 0 ? DEEP_R : DEEP_D, Math.pow(t, 0.75));
}

/** Diverging fill for P(Republican wins), 0-1: grey at 50%, fully saturated at 0% / 100%. */
export function probabilityColor(pR: number): string {
  if (!Number.isFinite(pR)) return '#1a2233';
  const t = Math.min(1, Math.abs(pR - 0.5) / 0.5);
  return mix(NEUTRAL, pR >= 0.5 ? DEEP_R : DEEP_D, Math.pow(t, 0.85));
}

/**
 * Rating band for an OBSERVED vote margin (county, precinct) — the same nine bands as the race ratings, cut on points of
 * margin rather than on win probability, since a county has no simulated outcome of its own: <1 toss-up, <3 tilt, <6
 * lean, <12 likely, otherwise safe.
 */
export function ratingFromMargin(marginR: number): Rating {
  const a = Math.abs(marginR);
  const side = marginR >= 0 ? 'R' : 'D';
  if (a < 1) return 'Tossup';
  if (a < 3) return `Tilt${side}`;
  if (a < 6) return `Lean${side}`;
  if (a < 12) return `Likely${side}`;
  return `Safe${side}`;
}
export const ratingColorFromMargin = (marginR: number): string => RATING_COLOR[ratingFromMargin(marginR)];

export const winnerColor = (marginR: number): string => (marginR === 0 ? NEUTRAL : marginR > 0 ? '#e14b4b' : '#3b82f6');

export function fmtMargin(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (Math.abs(m) < 0.05) return 'EVEN';
  return m > 0 ? `R+${m.toFixed(1)}` : `D+${Math.abs(m).toFixed(1)}`;
}

/** A smooth legend ramp: CSS colour stops from D (left) to R (right). */
export function rampStops(fn: (x: number) => string, from: number, to: number, n = 9): string[] {
  return Array.from({ length: n }, (_, i) => fn(from + ((to - from) * i) / (n - 1)));
}
