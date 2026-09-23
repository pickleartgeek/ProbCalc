import { lookupParty, US_DEM, US_REP, US_IND, type PartyCountry } from './partyRegistry';

// A broadcast-desk-friendly fallback palette, cycled when we can't infer a party's real color.
const FALLBACK_PALETTE = [
  '#E14B4B', '#3E7CB1', '#4FA86B', '#F2B705', '#8A6FD6',
  '#E0864F', '#3FB8AF', '#C24E85', '#7C8A9E', '#B5C24E',
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/** Registry colour when the name is a known party (given a country if the caller has one), else a distinct fallback. */
export function assignColor(index: number, name: string, country?: PartyCountry): string {
  const hit = lookupParty({ id: slugify(name), name, shortName: name }, country);
  return hit ? hit.color : FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

// ---- US-style affiliation handling ------------------------------------------------
// Wikipedia's US polling tables name columns after candidates ("Jon Ossoff<br/>Democratic"),
// so party identity has to be read out of the header text rather than being the header.

export type Affiliation = 'D' | 'R' | 'I';
const AFFILIATION_WORDS: [RegExp, Affiliation][] = [
  [/\b(democratic|democrat|dem)\b/i, 'D'],
  [/\b(republican|gop|rep)\b/i, 'R'],
  [/\b(independent|ind)\b/i, 'I'],
];
const AFFILIATION_COLOR: Record<Affiliation, string> = { D: US_DEM, R: US_REP, I: US_IND };
const NAME_SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;

/** Reads "Democratic"/"Republican"/"Independent" out of a header, if present. */
export function detectAffiliation(header: string): Affiliation | undefined {
  for (const [re, aff] of AFFILIATION_WORDS) if (re.test(header)) return aff;
  return undefined;
}

/**
 * "Jon Ossoff Democratic" -> { name: "Jon Ossoff (D)", shortName: "Ossoff" }.
 * A header that is only the affiliation ("Republican") is left alone. Headers without an
 * affiliation are returned unchanged, so European party columns behave exactly as before.
 */
export function derivePartyLabel(header: string): { name: string; shortName: string; affiliation?: Affiliation } {
  const affiliation = detectAffiliation(header);
  const fallback = { name: header, shortName: header.length > 6 ? header.slice(0, 6) : header, affiliation };
  if (!affiliation) return fallback;
  let stripped = header;
  for (const [re] of AFFILIATION_WORDS) stripped = stripped.replace(new RegExp(re.source, 'ig'), ' ');
  stripped = stripped.replace(/[()/,–-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripped.length < 3) return fallback; // header was just "Democratic"
  const tokens = stripped.split(' ').filter((t) => !NAME_SUFFIX.test(t));
  const surname = tokens[tokens.length - 1] ?? stripped;
  return { name: `${stripped} (${affiliation})`, shortName: surname, affiliation };
}

/** Builds a Party from a header cell. `seen` counts affiliations already used so a 2nd Democrat gets a lighter blue. */
export function buildPartyFromHeader(header: string, index: number, seen: Partial<Record<Affiliation, number>>): {
  id: string; name: string; shortName: string; color: string; affiliation?: Affiliation;
} {
  const label = derivePartyLabel(header);
  const id = slugify(header);
  let color = assignColor(index, header);
  if (label.affiliation) {
    const n = seen[label.affiliation] ?? 0;
    seen[label.affiliation] = n + 1;
    color = n === 0 ? AFFILIATION_COLOR[label.affiliation] : adjustLightness(AFFILIATION_COLOR[label.affiliation], Math.min(0.3, n * 0.12));
  }
  const party = { id, name: label.name, shortName: label.shortName, color } as {
    id: string; name: string; shortName: string; color: string; affiliation?: Affiliation;
  };
  if (label.affiliation) party.affiliation = label.affiliation;
  return party;
}

/** Finds the party column carrying a given US affiliation, falling back to the classic ids. */
export function findByAffiliation<T extends { id: string; affiliation?: Affiliation }>(parties: T[], aff: Affiliation): T | undefined {
  return (
    parties.find((p) => p.affiliation === aff) ??
    parties.find((p) => (aff === 'D' ? /^(democrat|democratic)$/ : aff === 'R' ? /^republican$/ : /^independent$/).test(p.id))
  );
}

/**
 * Surname match for backfillAffiliationFromCandidates: a header column built from a bare
 * candidate name ("Schiff", "A. Schiff", "Adam B. Schiff") against a known full name
 * ("Adam Schiff"). Compares last tokens (surnames) case-insensitively so short columns
 * (common on Wikipedia poll tables with narrow layouts) still match.
 */
function surnameMatches(headerSlug: string, knownName: string): boolean {
  const knownTokens = knownName
    .split(/\s+/)
    .map((t) => slugify(t))
    .filter((t) => t.length > 0 && !NAME_SUFFIX.test(t));
  if (knownTokens.length === 0) return false;
  const surname = knownTokens[knownTokens.length - 1];
  // require a real surname match, not just any short substring, to avoid false positives
  return surname.length >= 3 && headerSlug.includes(surname);
}

/**
 * Backfills party affiliation (and its color) for columns the header-word detector missed —
 * i.e. a Wikipedia table column that names only a bare candidate surname, with no
 * "Democratic"/"Republican" word in the header at all. That's exactly the case that produces
 * inconsistent D/R coloring: `buildPartyFromHeader` correctly colors a column when the header
 * spells out the party, but silently falls back to an arbitrary index-based palette otherwise,
 * so which candidate gets red vs. blue ends up depending on the order columns happen to appear
 * in that particular table. This matches parsed party names/ids against the real, named
 * nominees already tracked in senateData.ts/governorData.ts (via RaceDef.demCandidate/
 * repCandidate) and, on a match, assigns the correct affiliation + color — same colors
 * `buildPartyFromHeader` would have produced had the header spelled the party out.
 *
 * Mutates nothing; returns a new array (parties without a match are returned unchanged).
 */
export function backfillAffiliationFromCandidates<
  T extends { id: string; name: string; shortName: string; color: string; affiliation?: Affiliation }
>(parties: T[], known: { demCandidate?: string | null; repCandidate?: string | null }): T[] {
  const candidates: [Affiliation, string][] = [];
  if (known.demCandidate) candidates.push(['D', known.demCandidate]);
  if (known.repCandidate) candidates.push(['R', known.repCandidate]);
  if (candidates.length === 0) return parties;

  const seen: Partial<Record<Affiliation, number>> = {};
  // count affiliations already assigned (e.g. by header-word detection) so a backfilled
  // match still gets the right shade if one party in this race was already colored
  for (const p of parties) if (p.affiliation) seen[p.affiliation] = (seen[p.affiliation] ?? 0) + 1;

  return parties.map((p) => {
    if (p.affiliation) return p; // header-word detection already handled this one
    const slug = slugify(p.name) || slugify(p.shortName) || p.id;
    const match = candidates.find(([, name]) => surnameMatches(slug, name));
    if (!match) return p;
    const [aff] = match;
    const n = seen[aff] ?? 0;
    seen[aff] = n + 1;
    const color = n === 0 ? AFFILIATION_COLOR[aff] : adjustLightness(AFFILIATION_COLOR[aff], Math.min(0.3, n * 0.12));
    return { ...p, affiliation: aff, color };
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function adjustLightness(hex: string, deltaPct: number): string {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    const rn = r / 255, gn = g / 255, bn = b / 255;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const newL = Math.min(1, Math.max(0, l + deltaPct));
  const c = (1 - Math.abs(2 * newL - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = newL - c / 2;
  let [r1, g1, b1] = [0, 0, 0];
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

/**
 * Returns a version of `hex` guaranteed to be legible as text on the given background —
 * lightening colors that are too dark for a dark background, darkening colors too light
 * for a light background. Used anywhere a party's own color is used as text color rather
 * than a swatch, since real party colors (e.g. pure black) can otherwise vanish.
 */
export function readableOn(hex: string, background: 'dark' | 'light'): string {
  const [r, g, b] = hexToRgb(hex);
  const lum = relativeLuminance(r, g, b);
  if (background === 'dark') {
    return lum < 0.32 ? adjustLightness(hex, 0.4) : hex;
  }
  return lum > 0.6 ? adjustLightness(hex, -0.35) : hex;
}

/**
 * A colour safe to FILL on the app's near-black background. Party identity colours can be very dark (Union black,
 * US Democratic navy) and would vanish as a bar or map region; this mixes them toward white just far enough to reach
 * a minimum luminance and leaves everything already visible untouched. Use readableOn() for text, this for fills.
 */
export function onDark(hex: string | undefined, minLum = 0.11): string {
  if (!hex) return '#888888';
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const lum = (h: string) => { const [r, g, b] = hexToRgb(h); return relativeLuminance(r, g, b); };
  if (lum(hex) >= minLum) return hex;
  // raise HSL lightness in small steps: hue and saturation are kept, so navy stays navy rather than washing to grey
  for (let d = 0.03; d <= 0.7; d += 0.03) {
    const out = adjustLightness(hex, d);
    if (lum(out) >= minLum) return out;
  }
  return adjustLightness(hex, 0.7);
}

/** Largest-remainder allocation of `totalSeats` proportional to each entry's share. */
export function allocateSeats(shares: { id: string; value: number }[], totalSeats: number): Record<string, number> {
  const sum = shares.reduce((a, s) => a + s.value, 0) || 1;
  const exact = shares.map((s) => ({ id: s.id, exact: (s.value / sum) * totalSeats }));
  const base = exact.map((e) => ({ id: e.id, seats: Math.floor(e.exact), rem: e.exact - Math.floor(e.exact) }));
  let assigned = base.reduce((a, b) => a + b.seats, 0);
  const byRemainder = [...base].sort((a, b) => b.rem - a.rem);
  let i = 0;
  while (assigned < totalSeats && byRemainder.length > 0) {
    byRemainder[i % byRemainder.length].seats += 1;
    assigned++;
    i++;
  }
  const result: Record<string, number> = {};
  base.forEach((b) => (result[b.id] = b.seats));
  return result;
}
