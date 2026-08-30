// Marsaglia & Tsang (2000) method for sampling from a Gamma(shape, scale) distribution.
// This is the same family of distribution as the guide's GAMMA.INV(RAND(); alpha; beta) —
// sampling directly is equivalent to inverting a uniform random draw through the CDF, and
// avoids needing a numerically-stable inverse-gamma CDF implementation in the browser.
function sampleStandardNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function sampleGamma(shape: number, scale: number): number {
  if (shape <= 0) return 0;
  if (shape < 1) {
    // Boost trick: Gamma(shape+1) * U^(1/shape) is distributed Gamma(shape)
    const u = Math.random();
    return sampleGamma(shape + 1, scale) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = sampleStandardNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}
