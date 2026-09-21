// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Party colour registry — the ONE place party colours live. Edit here; everything else (poll parsing,
// charts, maps, gallery seeds, the Home ticker) resolves through src/lib/partyRegistry.ts.
//
// `color` is the party's identity colour as used on Wikipedia-style election graphics. The UI never draws it
// straight onto the dark background — very dark colours (Union black, US Democratic navy) are lifted for
// on-screen fills by onDark() in lib/partyColors.ts; exports/infoboxes keep the canonical value.
//
// `confidence` says how far to trust the hex:
//   'high'   — a widely used, stable value that agrees across the sources I could check
//   'medium' — right hue, exact shade may differ from the current Wikipedia template
//   'low'    — best available guess; check against the party's Wikipedia infobox before relying on it
// tests/partycolors.test.ts prints every non-'high' entry so nothing unverified hides.
//
// `aliases` are matched after slugify() (lower-case, accents and punctuation stripped): "Smer–SD", "SMER - SD" and
// "Smer SD" are all `smersd`. Aliases only need to be unique WITHIN a country; the resolver picks the country
// from context ("Greens" beside "AfD" is German, beside "Reform UK" it is British).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

export type PartyCountry = 'DE' | 'SK' | 'US' | 'UK' | 'BG';
export type Confidence = 'high' | 'medium' | 'low';

export interface RegistryParty {
  key: string;
  country: PartyCountry | 'ANY';
  name: string;
  color: string;
  aliases: string[];
  confidence: Confidence;
  note?: string;
}

const p = (country: RegistryParty['country'], key: string, name: string, color: string, confidence: Confidence, aliases: string[] = [], note?: string): RegistryParty =>
  ({ key, country, name, color, confidence, aliases: [key, ...aliases], note });

/** Two-party US colours (Wikipedia's current party templates). Used for D/R affiliation everywhere. */
export const US_DEM = '#0015BC';
export const US_REP = '#E81B23';
export const US_IND = '#9AA0A6';

export const PARTY_COLORS: RegistryParty[] = [
  // ── Generic ─────────────────────────────────────────────────────────────────────────────────────
  p('ANY', 'others', 'Others', '#A0A0A0', 'high', ['other', 'oth', 'otherundecided', 'undecidedother', 'miscellaneous', 'ostatni']),

  // ── Germany ─────────────────────────────────────────────────────────────────────────────────────
  p('DE', 'union', 'CDU/CSU', '#000000', 'high', ['cducsu', 'cdu', 'cdu/csu', 'christdemokraten']),
  p('DE', 'csu', 'CSU', '#0088CE', 'medium'),
  p('DE', 'spd', 'SPD', '#E3000F', 'high'),
  p('DE', 'afd', 'AfD', '#009EE0', 'high', ['alternativefurdeutschland']),
  p('DE', 'gruene', 'Bündnis 90/Die Grünen', '#64A12D', 'medium', ['grune', 'grunen', 'greens', 'bundnis90diegrunen', 'bundnis90', 'b90grune', 'die grunen']),
  p('DE', 'fdp', 'FDP', '#FFED00', 'high', ['freedemocrats']),
  p('DE', 'linke', 'Die Linke', '#BE3075', 'high', ['dielinke', 'left', 'thelinke']),
  p('DE', 'bsw', 'BSW', '#7D3F98', 'low', ['bundnissahrawagenknecht'], 'purple; verify against the current Wikipedia infobox'),
  p('DE', 'fw', 'Freie Wähler', '#F5A300', 'low', ['freiewahler', 'freevoters']),
  p('DE', 'ssw', 'SSW', '#003C8F', 'low'),
  p('DE', 'volt', 'Volt', '#502379', 'medium'),
  p('DE', 'piraten', 'Piratenpartei', '#FF8800', 'medium', ['pirates', 'piratenpartei']),

  // ── Slovakia ────────────────────────────────────────────────────────────────────────────────────
  // Only PS is anchored to something I could read (Wikipedia's infobox names its colour "Capri").
  // The rest are best guesses chosen to be clearly distinguishable — please check them.
  p('SK', 'smersd', 'Smer–SD', '#D71920', 'medium', ['smer', 'smersocialnademokracia', 'direction', 'directionsocialdemocracy']),
  p('SK', 'ps', 'Progresívne Slovensko', '#00BFFF', 'medium', ['progresivneslovensko', 'progressiveslovakia', 'psspolu', 'psspoluod']),
  p('SK', 'hlassd', 'Hlas–SD', '#8C1C3E', 'low', ['hlas', 'voice', 'hlassocialnademokracia', 'voicesocialdemocracy']),
  p('SK', 'kdh', 'KDH', '#F7941D', 'low', ['kresťanskodemokratickehnutie', 'kresťanskodemokratickehnutie', 'christiandemocraticmovement']),
  p('SK', 'sas', 'SaS', '#7CB342', 'low', ['slobodaasolidarita', 'freedomandsolidarity']),
  p('SK', 'olano', 'OĽaNO / Slovensko', '#C6D21F', 'low', ['slovensko', 'hnutieslovensko', 'olanoaslovensko', 'olanoapriatelia', 'olanonova', 'slovakiamovement', 'ordinarypeople', 'sk-zl', 'skzl', 'szl', 'skzlnova']),
  p('SK', 'republika', 'Republika', '#0B2A5B', 'low', ['hnutierepublika', 'republicmovement']),
  p('SK', 'sns', 'SNS', '#4A8FD9', 'low', ['slovenskanarodnastrana', 'slovaknationalparty']),
  p('SK', 'demokrati', 'Demokrati', '#7B4BA0', 'low', ['demokratislovenska', 'democrats', 'thedemocrats']),
  p('SK', 'aliancia', 'Aliancia', '#1B7F6B', 'low', ['madarskaaliancia', 'szovetseg', 'hungarianalliance', 'alliance', 'msz', 'smkmkp']),
  p('SK', 'lsns', 'ĽSNS', '#5B6B2A', 'low', ['kotleba', 'kotlebaľsns', 'kotlebalsns', 'kotlebovci', 'ludovastranananasslovensko']),
  p('SK', 'smerodina', 'Sme rodina', '#E4572E', 'low', ['smerodina']),

  // ── United States ───────────────────────────────────────────────────────────────────────────────
  p('US', 'democratic', 'Democratic', US_DEM, 'high', ['democrat', 'democrats', 'dem', 'd']),
  p('US', 'republican', 'Republican', US_REP, 'high', ['gop', 'rep', 'republicans', 'r']),
  p('US', 'independent', 'Independent', US_IND, 'medium', ['ind', 'independents', 'i']),
  p('US', 'libertarian', 'Libertarian', '#FED105', 'medium', ['lib', 'libertarianparty']),
  p('US', 'green', 'Green', '#17AA5C', 'medium', ['greenparty', 'greens']),
  p('US', 'constitution', 'Constitution', '#A356DE', 'low', ['constitutionparty']),

  // ── United Kingdom ──────────────────────────────────────────────────────────────────────────────
  p('UK', 'labour', 'Labour', '#E4003B', 'high', ['lab', 'labourparty']),
  p('UK', 'conservative', 'Conservative', '#0087DC', 'high', ['con', 'cons', 'tory', 'tories', 'conservatives', 'conservativeandunionist', 'conservativeparty']),
  p('UK', 'reform', 'Reform UK', '#12B6CF', 'high', ['ref', 'reformuk', 'brexitparty', 'brx', 'reformukparty']),
  p('UK', 'libdem', 'Liberal Democrats', '#FAA61A', 'medium', ['ld', 'libdems', 'libdem', 'liberaldemocrat', 'liberaldemocrats', 'lddem', 'lib dem']),
  p('UK', 'green', 'Green', '#02A95B', 'medium', ['grn', 'greens', 'greenparty', 'greenpartyofenglandandwales', 'gpew']),
  p('UK', 'snp', 'SNP', '#FDF38E', 'high', ['scottishnationalparty']),
  p('UK', 'plaid', 'Plaid Cymru', '#005B54', 'high', ['pc', 'plaidcymru', 'plaidc']),
  p('UK', 'ukip', 'UKIP', '#70147A', 'medium'),
  p('UK', 'dup', 'DUP', '#D46A4C', 'medium'),
  p('UK', 'sinnfein', 'Sinn Féin', '#326760', 'medium', ['sf']),
  p('UK', 'sdlp', 'SDLP', '#2AA82C', 'medium'),
  p('UK', 'alliance', 'Alliance', '#F6CB2F', 'medium', ['allianceparty']),
  p('UK', 'uup', 'UUP', '#48A5EE', 'medium'),
  p('UK', 'independent', 'Independent', '#DDDDDD', 'medium', ['ind']),

  // ── Bulgaria (carried over from the previous table; not re-verified) ───────────────────────────────
  p('BG', 'gerbsds', 'GERB–SDS', '#0033A0', 'low', ['gerb']),
  p('BG', 'ppdb', 'PP–DB', '#F7941D', 'low', ['pp-db']),
  p('BG', 'vaz', 'Vazrazhdane', '#5B2C6F', 'low', ['vazrazhdane', 'vaz']),
  p('BG', 'dps', 'DPS', '#009B77', 'low'),
  p('BG', 'bspol', 'BSP–OL', '#D2001C', 'low', ['bsp', 'bsp-ol']),
  p('BG', 'aps', 'APS', '#663399', 'low'),
  p('BG', 'itn', 'ITN', '#00AEEF', 'low'),
  p('BG', 'mech', 'MECh', '#0B2340', 'low'),
  p('BG', 'veli', 'Velichie', '#8B0000', 'low', ['velichie']),
  p('BG', 'sb', 'SB', '#1E88E5', 'low'),
  p('BG', 'pb', 'PB', '#004225', 'low'),
  p('BG', 'siy', 'Siyanie', '#00A99D', 'low', ['siyanie']),
];

/** Standard short labels (keyed "COUNTRY/key"), used when a poll header was long enough to be auto-truncated. */
export const SHORT_NAMES: Record<string, string> = {
  'DE/union': 'Union', 'DE/gruene': 'Grüne', 'DE/linke': 'Linke', 'DE/fw': 'FW',
  'SK/smersd': 'Smer', 'SK/ps': 'PS', 'SK/hlassd': 'Hlas', 'SK/olano': 'OĽaNO', 'SK/republika': 'Republika', 'SK/demokrati': 'Demokrati', 'SK/aliancia': 'Aliancia',
  'UK/labour': 'Lab', 'UK/conservative': 'Con', 'UK/reform': 'Reform', 'UK/libdem': 'LD', 'UK/green': 'Green', 'UK/plaid': 'Plaid',
};
