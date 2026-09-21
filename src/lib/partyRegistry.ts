import type { Party } from './types';
import { PARTY_COLORS, SHORT_NAMES, US_DEM, US_IND, US_REP, type PartyCountry, type RegistryParty } from '../data/partyColors';

export type { PartyCountry, RegistryParty };
export { US_DEM, US_REP, US_IND };

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

// slug -> entries, built once. A slug can belong to several countries ("greens"); resolution picks by country.
const INDEX = new Map<string, RegistryParty[]>();
for (const entry of PARTY_COLORS) {
  for (const a of new Set([entry.key, entry.name, ...entry.aliases].map(slug))) {
    if (!a) continue;
    const list = INDEX.get(a) ?? [];
    list.push(entry);
    INDEX.set(a, list);
  }
}

/** Every string a party might be known by in a poll table: id, short name, full name. */
const namesOf = (p: Pick<Party, 'id' | 'name' | 'shortName'>) => [p.id, p.shortName, p.name].map(slug).filter(Boolean);

function matches(p: Pick<Party, 'id' | 'name' | 'shortName'>): RegistryParty[] {
  const out = new Set<RegistryParty>();
  for (const n of namesOf(p)) for (const e of INDEX.get(n) ?? []) out.add(e);
  return [...out];
}

/** "Germany" -> DE, "United Kingdom"/"Scotland" -> UK … used when the caller knows where the race is. */
export function countryFromRegion(text: string | undefined): PartyCountry | undefined {
  const t = (text ?? '').trim();
  if (!t) return undefined;
  if (/german|deutsch|bundestag/i.test(t)) return 'DE';
  if (/slovak|slovensk|nrsr/i.test(t)) return 'SK';
  if (/bulgar/i.test(t)) return 'BG';
  if (/united kingdom|^uk$|great britain|^gb$|britain|england|scotland|wales|westminster/i.test(t)) return 'UK';
  if (/united states|^us$|^usa$|america|senate|gubernatorial|congress/i.test(t)) return 'US';
  return undefined;
}

/**
 * Which country's parties are these? Votes by how many parties in the table resolve to each country's entries
 * (D/R affiliation = US). The country with the clear most wins; a tie gives up rather than guess.
 */
export function detectCountry(parties: Pick<Party, 'id' | 'name' | 'shortName' | 'affiliation'>[]): PartyCountry | undefined {
  if (parties.some((p) => p.affiliation === 'D' || p.affiliation === 'R')) return 'US';
  const votes = new Map<PartyCountry, number>();
  for (const p of parties) {
    const countries = new Set(matches(p).map((e) => e.country).filter((c): c is PartyCountry => c !== 'ANY'));
    for (const c of countries) votes.set(c, (votes.get(c) ?? 0) + 1 / countries.size);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return undefined;
  if (ranked.length > 1 && ranked[0][1] - ranked[1][1] < 0.5) return undefined;
  return ranked[0][1] >= 1 ? ranked[0][0] : undefined;
}

/** Best registry entry for a party: same country first, then a generic ("Others"), then a global unique match. */
export function lookupParty(p: Pick<Party, 'id' | 'name' | 'shortName'>, country?: PartyCountry): RegistryParty | null {
  const all = matches(p);
  if (!all.length) return null;
  if (country) {
    const own = all.find((e) => e.country === country);
    if (own) return own;
  }
  const generic = all.find((e) => e.country === 'ANY');
  if (generic) return generic;
  const countries = new Set(all.map((e) => e.country));
  return countries.size === 1 ? all[0] : null; // ambiguous across countries and no context: don't guess
}

export function registryColor(country: PartyCountry, key: string): string {
  const e = PARTY_COLORS.find((x) => x.country === country && x.key === key);
  if (!e) throw new Error(`No registry colour for ${country}/${key}`);
  return e.color;
}

/**
 * Gives every party its proper identity colour. US candidate columns (which carry a D/R affiliation) are handled by
 * buildPartyFromHeader and left alone; anything the registry does not know keeps the colour it already had.
 */
export function applyPartyColors<T extends Party>(parties: T[], hint?: PartyCountry): T[] {
  const country = hint ?? detectCountry(parties);
  return parties.map((party) => {
    if (party.affiliation) return party;
    const hit = lookupParty(party, country);
    if (!hit) return party;
    // a long header ("Conservative", "Liberal Democrats") was auto-truncated to something ugly: use the standard label
    const short = SHORT_NAMES[`${hit.country}/${hit.key}`];
    return { ...party, color: hit.color, ...(short && party.name.length > 6 && party.shortName !== party.name ? { shortName: short } : {}) };
  });
}
