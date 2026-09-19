// Generalizes the guide's Section III.II ("Split vote count and extrapolation"):
// a race's own baseline gets nudged by however much the *overall environment* has
// moved since that baseline was set, so races without their own fresh polling
// (a demographic crosstab, an unpolled district) can still be extrapolated from
// whatever *is* polled (the topline, the generic ballot, etc.)
//
// own_new[p]  =  own_old[p]  +  weight * ( env_new[p] − env_old[p] )
//
// weight = 1   → full uniform swing (no independent signal on this race at all —
//                its old deviation from the old environment is assumed to carry
//                forward exactly, e.g. an unpolled House district)
// weight = 0   → ignore the environment entirely, trust the race's own number as-is
//                (great independent polling that already reflects the current mood)
// in between   → blend: own polling exists but is thin/stale/lower-quality, so let
//                the environment move part of the way
//
// Works for any number of parties — shares don't need to be two-party.

export interface EnvironmentShiftInput {
  /** The race's own baseline (e.g. its last result, or its own current polling). partyId -> share (any consistent unit: %, points, whatever). */
  ownShares: Record<string, number>;
  /** The broader environment at the time `ownShares` was measured (e.g. previous generic ballot / previous topline). */
  previousEnvironment: Record<string, number>;
  /** The broader environment now. */
  currentEnvironment: Record<string, number>;
  /** 0..1 — how much of the environment's movement to apply. */
  weight: number;
}

/**
 * Returns shifted shares, renormalized so they sum to the same total as `ownShares`
 * (negative shares are clamped to 0 before renormalizing, so a big swing can't
 * produce a nonsensical negative vote share).
 */
export function applyEnvironmentShift({
  ownShares,
  previousEnvironment,
  currentEnvironment,
  weight,
}: EnvironmentShiftInput): Record<string, number> {
  const w = Math.max(0, Math.min(1, weight));
  const parties = new Set([
    ...Object.keys(ownShares),
    ...Object.keys(previousEnvironment),
    ...Object.keys(currentEnvironment),
  ]);

  const targetTotal = Object.values(ownShares).reduce((a, b) => a + b, 0);

  const raw: Record<string, number> = {};
  for (const p of parties) {
    const own = ownShares[p] ?? 0;
    const envOld = previousEnvironment[p] ?? 0;
    const envNew = currentEnvironment[p] ?? 0;
    raw[p] = Math.max(0, own + w * (envNew - envOld));
  }

  const rawTotal = Object.values(raw).reduce((a, b) => a + b, 0);
  const shifted: Record<string, number> = {};
  for (const p of parties) {
    shifted[p] = rawTotal > 0 ? (raw[p] / rawTotal) * targetTotal : 0;
  }
  return shifted;
}

/**
 * Convenience wrapper for the common two-party (R vs. D, "margin in points")
 * case — the shape most US race data comes in. Positive margin = R.
 */
export function applyEnvironmentShiftMargin(
  ownMarginR: number,
  previousEnvironmentMarginR: number,
  currentEnvironmentMarginR: number,
  weight: number
): number {
  const shifted = applyEnvironmentShift({
    ownShares: { R: 50 + ownMarginR / 2, D: 50 - ownMarginR / 2 },
    previousEnvironment: { R: 50 + previousEnvironmentMarginR / 2, D: 50 - previousEnvironmentMarginR / 2 },
    currentEnvironment: { R: 50 + currentEnvironmentMarginR / 2, D: 50 - currentEnvironmentMarginR / 2 },
    weight,
  });
  return shifted.R - shifted.D;
}
