// Standard 9-point forecaster rating scale (Cook/Sabato/Inside Elections style),
// mapped to an implied win probability for the leading party and a display color.
// These win-probability mappings are a reasonable, commonly-used convention —
// swap them out freely once you're wiring in a real model's output.

export type Rating =
  | 'SafeD'
  | 'LikelyD'
  | 'LeanD'
  | 'TiltD'
  | 'Tossup'
  | 'TiltR'
  | 'LeanR'
  | 'LikelyR'
  | 'SafeR';

export const RATING_ORDER: Rating[] = [
  'SafeD',
  'LikelyD',
  'LeanD',
  'TiltD',
  'Tossup',
  'TiltR',
  'LeanR',
  'LikelyR',
  'SafeR',
];

export const RATING_LABEL: Record<Rating, string> = {
  SafeD: 'Safe D',
  LikelyD: 'Likely D',
  LeanD: 'Lean D',
  TiltD: 'Tilt D',
  Tossup: 'Toss-up',
  TiltR: 'Tilt R',
  LeanR: 'Lean R',
  LikelyR: 'Likely R',
  SafeR: 'Safe R',
};

// Probability that the *Republican* candidate wins, per rating band.
export const RATING_R_PROB: Record<Rating, number> = {
  SafeD: 0.02,
  LikelyD: 0.1,
  LeanD: 0.25,
  TiltD: 0.4,
  Tossup: 0.5,
  TiltR: 0.6,
  LeanR: 0.75,
  LikelyR: 0.9,
  SafeR: 0.98,
};

export const DEM = '#3b82f6';
export const REP = '#e14b4b';
export const OTHER = '#a78bfa';

// Blended color per rating band, D -> R.
export const RATING_COLOR: Record<Rating, string> = {
  SafeD: '#1d4ed8',
  LikelyD: '#3b82f6',
  LeanD: '#7ab0f5',
  TiltD: '#a9c9f5',
  Tossup: '#8b8fa3',
  TiltR: '#f0a8a8',
  LeanR: '#ea7373',
  LikelyR: '#e14b4b',
  SafeR: '#b91c1c',
};

// Treats a rating's implied R win-probability as a pseudo vote-margin (points,
// R positive) so it can be blended with real environment-margin figures via
// environmentShift.ts. Not a literal vote share — just a consistent scale for
// blending a categorical rating against a numeric swing.
export function rProbToPseudoMargin(pR: number): number {
  return (pR - 0.5) * 200;
}
export function pseudoMarginToRProb(margin: number): number {
  return Math.min(0.99, Math.max(0.01, 0.5 + margin / 200));
}

export function ratingFromRProb(pR: number): Rating {
  if (pR <= 0.05) return 'SafeD';
  if (pR <= 0.15) return 'LikelyD';
  if (pR <= 0.3) return 'LeanD';
  if (pR <= 0.45) return 'TiltD';
  if (pR <= 0.55) return 'Tossup';
  if (pR <= 0.7) return 'TiltR';
  if (pR <= 0.85) return 'LeanR';
  if (pR <= 0.95) return 'LikelyR';
  return 'SafeR';
}
