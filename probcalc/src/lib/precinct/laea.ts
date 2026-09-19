// Mirrors scripts/laea.mjs's inverse transform exactly — kept as a small
// separate copy since the data-prep script runs in plain Node and this runs
// in the bundled browser code.
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function laeaInverse(x: number, y: number, lon0: number, lat0: number, R: number): [number, number] {
  const λ0 = lon0 * D2R;
  const φ0 = lat0 * D2R;
  const rho = Math.sqrt(x * x + y * y);
  if (rho < 1e-9) return [lon0, lat0];
  const c = 2 * Math.asin(Math.min(1, rho / (2 * R)));
  const φ = Math.asin(Math.cos(c) * Math.sin(φ0) + (y * Math.sin(c) * Math.cos(φ0)) / rho);
  const λ = λ0 + Math.atan2(x * Math.sin(c), rho * Math.cos(φ0) * Math.cos(c) - y * Math.sin(φ0) * Math.sin(c));
  return [λ * R2D, φ * R2D];
}
