// Spherical Lambert Azimuthal Equal-Area projection, centered at (lon0, lat0).
// R in km (mean Earth radius) means 1 projected unit = 1 km, by construction —
// squares built in this space have exact real-world areas, no calibration needed.
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function laeaForward(lon, lat, lon0, lat0, R) {
  const λ = lon * D2R, φ = lat * D2R, λ0 = lon0 * D2R, φ0 = lat0 * D2R;
  const cosc = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ - λ0);
  const k = R * Math.sqrt(2 / (1 + cosc));
  const x = k * Math.cos(φ) * Math.sin(λ - λ0);
  const y = k * (Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ - λ0));
  return [x, y];
}

export function laeaInverse(x, y, lon0, lat0, R) {
  const λ0 = lon0 * D2R, φ0 = lat0 * D2R;
  const rho = Math.sqrt(x * x + y * y);
  if (rho < 1e-9) return [lon0, lat0];
  const c = 2 * Math.asin(Math.min(1, rho / (2 * R)));
  const φ = Math.asin(Math.cos(c) * Math.sin(φ0) + (y * Math.sin(c) * Math.cos(φ0)) / rho);
  const λ = λ0 + Math.atan2(x * Math.sin(c), rho * Math.cos(φ0) * Math.cos(c) - y * Math.sin(φ0) * Math.sin(c));
  return [λ * R2D, φ * R2D];
}

export const EARTH_R_KM = 6371.0088; // IUGG mean radius
