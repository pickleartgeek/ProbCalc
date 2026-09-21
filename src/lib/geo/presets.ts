import type { RegionBinding } from '../types';

// Region presets: each links a real boundary file to the baseline electoral data that goes with it.
// The German and Slovak presets sit at the SMALLEST division the official results are published at
// (Wahlkreis / obec) — data prepared by scripts/prepare-germany.mjs and prepare-slovakia.mjs from the
// files on the project's `united-states` release, the same place the US precinct data comes from.

export type PresetId = 'us-states' | 'us-house' | 'de-wahlkreise' | 'sk-obce' | 'bg-provinces';

export interface RegionPreset {
  id: PresetId;
  label: string;
  country: string;
  /** what one region is called, for UI copy */
  unit: string;
  approxUnits: number;
  /** what regions are grouped by (tooltips, participant picker) */
  groupLabel: string;
  geoFile: string;
  objectName: string;
  projection: 'albersUsa' | 'mercator';
  baselineFile?: string;
  baselineNote: string;
  attribution: string;
  /** used to auto-attach a preset when the race's region text names its country */
  infer: RegExp;
}

export const REGION_PRESETS: RegionPreset[] = [
  {
    id: 'de-wahlkreise', label: 'German Wahlkreise (299)', country: 'Germany', unit: 'Wahlkreis', approxUnits: 299, groupLabel: 'Land',
    geoFile: 'de-wahlkreise.topo.json', objectName: 'regions', projection: 'mercator', baselineFile: 'de-wahlkreise.baseline.json',
    baselineNote: 'Bundestag 2025 Zweitstimmen by Wahlkreis (measured, official final result)',
    attribution: '© Die Bundeswahlleiterin 2025, Datenlizenz Deutschland – Namensnennung 2.0', infer: /german|deutsch|bundestag/i,
  },
  {
    id: 'sk-obce', label: 'Slovak municipalities (2,926 obce)', country: 'Slovakia', unit: 'municipality', approxUnits: 2926, groupLabel: 'Okres',
    geoFile: 'sk-obce.topo.json', objectName: 'regions', projection: 'mercator', baselineFile: 'sk-obce.baseline.json',
    baselineNote: 'NRSR 2023 valid votes by obec (measured, official result; postal votes from abroad are not mapped)',
    attribution: 'Štatistický úrad SR (NRSR 2023, tab. 08d); obec boundaries ÚGKK SR', infer: /slovak|slovensk|nrsr/i,
  },
  {
    id: 'bg-provinces', label: 'Bulgarian provinces (28)', country: 'Bulgaria', unit: 'province', approxUnits: 28, groupLabel: 'Province',
    geoFile: 'bg-provinces.topo.json', objectName: 'regions', projection: 'mercator',
    baselineNote: 'No results bundled — paste a baseline CSV below, or regions swing uniformly with the national aggregate',
    attribution: 'dimitara/bulgaria-interactive-map (MIT)', infer: /bulgar/i,
  },
  {
    id: 'us-states', label: 'US states', country: 'United States', unit: 'state', approxUnits: 51, groupLabel: 'State',
    geoFile: 'us-states-10m.json', objectName: 'states', projection: 'albersUsa',
    baselineNote: '2024 presidential margin per state (measured from the precinct data when loaded, approximate constants otherwise)',
    attribution: 'us-atlas (US Census Bureau)', infer: /united states|^us$|^usa$|america/i,
  },
  {
    id: 'us-house', label: 'US House districts (435)', country: 'United States', unit: 'district', approxUnits: 435, groupLabel: 'State',
    geoFile: 'us-cd118.topo.json', objectName: 'regions', projection: 'albersUsa',
    baselineNote: 'MODELLED: real 2024 state margin + seeded within-state spread (no per-district results bundled). 118th Congress lines — states that redrew for 2026 differ',
    attribution: 'Census TIGER/Line 2022 via civic-interconnect/civic-data-boundaries-us-cd118 (MIT)', infer: /^$/,
  },
];

export const presetById = (id: string | undefined): RegionPreset | undefined => REGION_PRESETS.find((p) => p.id === id);

/** "Germany" -> de-wahlkreise, "Slovakia" -> sk-obce … Lets a race attach itself to its geography without any clicks. */
export function inferPreset(regionText: string): PresetId | null {
  const t = regionText.trim();
  if (!t) return null;
  return REGION_PRESETS.find((p) => p.infer.test(t))?.id ?? null;
}

/**
 * A single-state US race has one shape on a states map, which makes for a dull election night. When a
 * US-states binding names only a few states, the map drills down to those states' House districts —
 * equal-population sub-regions, so their results can be tallied to the statewide total fairly.
 */
export function resolveScene(binding: RegionBinding): { presetId: PresetId; participants: 'all' | string[]; drilled: boolean } {
  if (binding.presetId === 'us-states' && binding.participants !== 'all' && binding.participants.length > 0 && binding.participants.length <= 4) {
    return { presetId: 'us-house', participants: binding.participants, drilled: true };
  }
  return { presetId: binding.presetId as PresetId, participants: binding.participants, drilled: false };
}
