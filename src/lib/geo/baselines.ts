import { presetById } from './presets';
import { defaultFetchJson, geoUrl, type JsonFetcher, type RegionFeature } from './loadGeo';
import { slugify } from '../partyColors';
import { HOUSE_APPORTIONMENT, STATE_PVI_2024_FALLBACK } from '../midterms/stateGrid';
import { houseDistrictPrevMargins } from '../midterms/houseData';

/**
 * The previous election, per region — the "previous results by group" table from guide section III.II.
 * `shares` are fractions of each region's own valid votes; `votes` weights regions against each other.
 */
export interface RegionBaseline {
  presetId: string;
  /** measured = official results; modelled = derived, see `source`; none = nothing bundled */
  kind: 'measured' | 'modelled' | 'none';
  source: string;
  keys: { key: string; label: string }[];
  regions: Record<string, { votes: number; shares: Record<string, number> }>;
  /** vote-weighted national share per key */
  national: Record<string, number>;
}

export function nationalFrom(regions: RegionBaseline['regions'], keys: { key: string }[]): Record<string, number> {
  let total = 0;
  const sums: Record<string, number> = Object.fromEntries(keys.map((k) => [k.key, 0]));
  for (const r of Object.values(regions)) {
    total += r.votes;
    for (const k of keys) sums[k.key] += (r.shares[k.key] ?? 0) * r.votes;
  }
  return Object.fromEntries(keys.map((k) => [k.key, total > 0 ? sums[k.key] / total : 0]));
}

export const emptyBaseline = (presetId: string): RegionBaseline => ({
  presetId, kind: 'none', source: presetById(presetId)?.baselineNote ?? '', keys: [], regions: {}, national: {},
});

// ---- built from the release data (DE, SK) -------------------------------------------------------

interface RawBaselineFile {
  election: string;
  parties: { key: string; label: string }[];
  regions: Record<string, { n: string; g: string; v: number; r: number[] }>;
}

export function baselineFromFile(presetId: string, raw: RawBaselineFile): RegionBaseline {
  const regions: RegionBaseline['regions'] = {};
  for (const [id, r] of Object.entries(raw.regions)) {
    const shares: Record<string, number> = {};
    raw.parties.forEach((p, i) => (shares[p.key] = r.v > 0 ? (r.r[i] ?? 0) / r.v : 0));
    regions[id] = { votes: r.v, shares };
  }
  return { presetId, kind: 'measured', source: raw.election, keys: raw.parties, regions, national: nationalFrom(regions, raw.parties) };
}

// ---- US (D vs R two-party, margins in points R − D) -----------------------------------------------

const US_KEYS = [{ key: 'D', label: 'Democratic' }, { key: 'R', label: 'Republican' }];
const twoParty = (marginR: number) => ({ D: 0.5 - marginR / 200, R: 0.5 + marginR / 200 });

export function usStatesBaseline(stateMargins: Record<string, number>, measured: boolean): RegionBaseline {
  const regions: RegionBaseline['regions'] = {};
  for (const [abbr, seats] of Object.entries(HOUSE_APPORTIONMENT)) {
    regions[abbr] = { votes: seats * 760_000, shares: twoParty(stateMargins[abbr] ?? STATE_PVI_2024_FALLBACK[abbr] ?? 0) };
  }
  regions.DC = { votes: 330_000, shares: twoParty(-84) }; // approximate
  return {
    presetId: 'us-states', kind: measured ? 'measured' : 'modelled',
    source: measured ? '2024 presidential margin, aggregated from real precincts' : '2024 presidential margin — approximate constants (precinct data not loaded)',
    keys: US_KEYS, regions, national: nationalFrom(regions, US_KEYS),
  };
}

export function usHouseBaseline(stateMargins: Record<string, number>, measuredStates: boolean): RegionBaseline {
  const regions: RegionBaseline['regions'] = {};
  for (const [id, m] of Object.entries(houseDistrictPrevMargins(stateMargins))) {
    regions[id] = { votes: 760_000, shares: twoParty(m) }; // districts are equal-population by construction
  }
  return {
    presetId: 'us-house', kind: 'modelled',
    source: `Modelled: ${measuredStates ? 'real' : 'approximate'} 2024 state margin + seeded within-state spread (no per-district results bundled)`,
    keys: US_KEYS, regions, national: nationalFrom(regions, US_KEYS),
  };
}

/** Real state margins if the precinct manifest is present, else the bundled approximations. Never throws. */
export async function loadUsMargins(): Promise<{ margins: Record<string, number>; measured: boolean }> {
  try {
    const { loadRealStatePVI } = await import('../midterms/precinctAnchor');
    const r = await loadRealStatePVI();
    return { margins: r.margins, measured: r.realStates.size > 0 };
  } catch {
    return { margins: STATE_PVI_2024_FALLBACK, measured: false };
  }
}

export async function loadBaseline(presetId: string, fetchJson: JsonFetcher = defaultFetchJson): Promise<RegionBaseline> {
  const preset = presetById(presetId);
  if (!preset) throw new Error(`Unknown region preset "${presetId}"`);
  if (presetId === 'us-states') { const m = await loadUsMargins(); return usStatesBaseline(m.margins, m.measured); }
  if (presetId === 'us-house') { const m = await loadUsMargins(); return usHouseBaseline(m.margins, m.measured); }
  if (!preset.baselineFile) return emptyBaseline(presetId);
  try {
    return baselineFromFile(presetId, (await fetchJson(geoUrl(preset.baselineFile))) as RawBaselineFile);
  } catch {
    return emptyBaseline(presetId); // file missing (e.g. CI step not run) — degrade to a uniform swing rather than fail
  }
}

// ---- user-pasted baseline ---------------------------------------------------------------------------

const norm = (s: string) => slugify(s);

/**
 * "Attach your own previous results": first column = region id or name, then one column per party,
 * optionally a `votes` column. Cells may be counts or percentages (a row summing to ≤ 101 is read as %).
 * Separators: comma, semicolon or tab.
 */
export function parseBaselineCsv(text: string, features: RegionFeature[], presetId: string): { baseline: RegionBaseline; unmatched: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('Need a header row and at least one region row.');
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map((h) => h.trim());
  const votesCol = head.findIndex((h, i) => i > 0 && /^(votes|valid|total)$/i.test(h));
  const partyCols = head.map((h, i) => ({ h, i })).filter((c) => c.i > 0 && c.i !== votesCol && c.h);
  if (partyCols.length === 0) throw new Error('No party columns found.');
  const keys = partyCols.map((c) => ({ key: norm(c.h) || `c${c.i}`, label: c.h }));

  const byId = new Map(features.map((f) => [norm(f.properties.id), f.properties.id]));
  const byName = new Map(features.map((f) => [norm(f.properties.name), f.properties.id]));
  const regions: RegionBaseline['regions'] = {};
  const unmatched: string[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(sep).map((c) => c.trim());
    const id = byId.get(norm(cells[0])) ?? byName.get(norm(cells[0]));
    if (!id) { unmatched.push(cells[0]); continue; }
    const nums = partyCols.map((c) => parseFloat((cells[c.i] ?? '').replace(',', '.')) || 0);
    const sum = nums.reduce((a, b) => a + b, 0);
    if (sum <= 0) continue;
    const declared = votesCol >= 0 ? parseFloat((cells[votesCol] ?? '').replace(/[\s,]/g, '')) : NaN;
    const votes = Number.isFinite(declared) && declared > 0 ? declared : sum > 101 ? sum : 1;
    const shares: Record<string, number> = {};
    keys.forEach((k, j) => (shares[k.key] = nums[j] / sum));
    regions[id] = { votes, shares };
  }
  return {
    baseline: { presetId, kind: 'measured', source: 'User-supplied baseline', keys, regions, national: nationalFrom(regions, keys) },
    unmatched,
  };
}
