import { useMemo } from 'react';
import type { ElectionConfig } from '../lib/types';
import { useGeoScene } from './useGeoScene';
import { buildReturnsPlan } from '../lib/geo/returns';

/** Presets whose regions are single-winner seats: the infobox then counts real seats off the map instead of approximating from vote share. */
const SEAT_PRESETS = new Set(['uk-constituencies', 'us-house']);

/**
 * What the infobox's map needs: the colour of each region's winner for the chosen aggregate (BaseCalc shares or one
 * scenario), and — for seat-based geographies — how many regions each party wins. Deterministic: the same inputs give the same map.
 */
export function useInfoboxMap(config: ElectionConfig | null, values: Record<string, number>, seed: string) {
  const scene = useGeoScene(config);
  const result = useMemo(() => {
    if (!config || !scene.geo || !scene.scene || scene.units.length === 0) return null;
    const partyIds = config.parties.map((p) => p.id);
    const plan = buildReturnsPlan(partyIds, values, scene.units, scene.prevNational, { seed, noise: 90 });
    const color = Object.fromEntries(config.parties.map((p) => [p.id, p.color]));
    const fills: Record<string, string> = {};
    const seats: Record<string, number> = {};
    for (const u of plan.units) {
      let best: string | null = null;
      for (const id of partyIds) if (best === null || (u.expected[id] ?? 0) > (u.expected[best] ?? 0)) best = id;
      if (best === null) continue;
      fills[u.id] = color[best];
      seats[best] = (seats[best] ?? 0) + 1;
    }
    return { fills, seats, regions: plan.units.length };
  }, [config, scene.geo, scene.scene, scene.units, scene.prevNational, values, seed]);
  const seatBased = !!scene.scene && SEAT_PRESETS.has(scene.scene.presetId);
  return { scene, fills: result?.fills ?? null, seats: result && seatBased ? result.seats : null, regions: result?.regions ?? 0, seatBased, loading: scene.loading };
}
