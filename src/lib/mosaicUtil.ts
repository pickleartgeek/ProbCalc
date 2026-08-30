// Shared seeded-shuffle helpers used by both the results mosaic map and the
// decorative pre-built-race card backgrounds, so tiling logic isn't duplicated.

export function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

/** Builds a deterministic, seeded-shuffled array of colors of length `count`, cycling through `colors`. */
export function buildTileColors(colors: string[], count: number, seedKey: string): string[] {
  if (colors.length === 0) return Array(count).fill('#1a2233');
  const rand = mulberry32(seedFrom(seedKey));
  const pool: string[] = [];
  for (let i = 0; i < count; i++) pool.push(colors[i % colors.length]);
  for (let j = pool.length - 1; j > 0; j--) {
    const k = Math.floor(rand() * (j + 1));
    [pool[j], pool[k]] = [pool[k], pool[j]];
  }
  return pool;
}
