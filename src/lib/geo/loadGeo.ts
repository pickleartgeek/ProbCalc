import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { presetById, type RegionPreset } from './presets';
import { FIPS_TO_USPS, USPS_TO_NAME } from '../usStates';

export interface RegionProps {
  id: string;
  name: string;
  group?: string;
}
export type RegionFeature = Feature<Geometry, RegionProps>;
export interface LoadedGeometry {
  preset: RegionPreset;
  features: RegionFeature[];
  collection: FeatureCollection<Geometry, RegionProps>;
}
export type JsonFetcher = (url: string) => Promise<unknown>;

const BASE: string = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? '/';
export const geoUrl = (file: string) => `${BASE}data/geo/${file}`.replace(/\/{2,}/g, '/');

export const defaultFetchJson: JsonFetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

const cache = new Map<string, Promise<LoadedGeometry>>();

/** Loads and normalises a preset's boundaries so every preset yields features with { id, name, group }. */
export function loadGeometry(presetId: string, fetchJson: JsonFetcher = defaultFetchJson): Promise<LoadedGeometry> {
  const preset = presetById(presetId);
  if (!preset) return Promise.reject(new Error(`Unknown region preset "${presetId}"`));
  const key = presetId;
  if (fetchJson === defaultFetchJson && cache.has(key)) return cache.get(key)!;
  const p = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topo: any = await fetchJson(geoUrl(preset.geoFile));
    const obj = topo.objects[preset.objectName];
    if (!obj) throw new Error(`${preset.geoFile} has no object "${preset.objectName}"`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (feature(topo, obj) as any).features as Feature<Geometry, Record<string, unknown>>[];
    const features: RegionFeature[] = [];
    for (const f of raw) {
      if (preset.id === 'us-states') {
        const usps = FIPS_TO_USPS[String(f.id).padStart(2, '0')];
        if (!usps) continue; // territories
        features.push({ ...f, id: usps, properties: { id: usps, name: USPS_TO_NAME[usps] ?? usps, group: usps } });
      } else {
        const pr = f.properties as unknown as RegionProps;
        features.push({ ...f, id: pr.id, properties: { id: pr.id, name: pr.name, group: pr.group } });
      }
    }
    return { preset, features, collection: { type: 'FeatureCollection', features } as FeatureCollection<Geometry, RegionProps> };
  })();
  if (fetchJson === defaultFetchJson) cache.set(key, p);
  return p;
}

/** Which features take part in a race. Participant entries match a region id OR its group (a Land, an okres, a state). */
export function isParticipant(f: RegionFeature, participants: 'all' | string[]): boolean {
  if (participants === 'all') return true;
  return participants.includes(f.properties.id) || (f.properties.group !== undefined && participants.includes(f.properties.group));
}
