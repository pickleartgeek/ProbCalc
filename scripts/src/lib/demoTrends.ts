import { mulberry32, seedFrom } from './mosaicUtil';
import type { Party } from './types';

export interface TrendPoint {
  t: string;
  base: Record<string, number>;
  prob: Record<string, number>;
}

/**
 * Generates a deterministic, seeded synthetic polling trend for demo/example races that
 * don't have real logged history yet. Clearly not real data — used only to show what the
 * Tracker page looks like with a populated trend line.
 */
export function generateSyntheticTrend(raceId: string, parties: Party[], points = 14): TrendPoint[] {
  const rand = mulberry32(seedFrom(raceId));
  // start from a mildly uneven distribution so lines aren't all flat at first
  let current = parties.map((_, i) => 1 / (i + 1.6));
  const sumStart = current.reduce((a, b) => a + b, 0);
  current = current.map((v) => v / sumStart);

  const result: TrendPoint[] = [];
  const now = Date.now();
  for (let i = 0; i < points; i++) {
    current = current.map((v) => Math.max(0.005, v + (rand() - 0.5) * 0.02));
    const sum = current.reduce((a, b) => a + b, 0);
    const normalized = current.map((v) => v / sum);

    const base: Record<string, number> = {};
    parties.forEach((p, idx) => (base[p.id] = normalized[idx]));

    // Sharpen the distribution to emulate how win probability swings harder than vote share
    const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length;
    const sharp = normalized.map((v) => Math.exp((v - mean) * 18));
    const sharpSum = sharp.reduce((a, b) => a + b, 0);
    const prob: Record<string, number> = {};
    parties.forEach((p, idx) => (prob[p.id] = sharp[idx] / sharpSum));

    const t = new Date(now - (points - i) * 86400000 * 3).toISOString();
    result.push({ t, base, prob });
  }
  return result;
}
