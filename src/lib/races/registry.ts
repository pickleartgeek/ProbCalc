import type { ElectionConfig, ParsedPollData, RegionBinding, VotingSystem } from '../types';
import { SENATE_RACES } from '../midterms/senateData';
import { GOVERNOR_RACES } from '../midterms/governorData';
import type { PartyCountry } from '../partyRegistry';
import type { ParseOptions } from '../wikitextParser';

// Every pre-built race: which Wikipedia page holds its polling, when it is/was held, and which geography it
// maps onto for Election Night. Gallery races are hand-listed below; every 2026 Senate and governor race is
// generated from the same data Split Ticket already uses, so a new race added there gets a card and a
// BaseCalc trajectory with no extra wiring.

export type RaceGroup = 'United States' | 'Germany' | 'Bulgaria' | 'Slovakia' | 'United Kingdom';

export const GROUP_COUNTRY: Record<RaceGroup, PartyCountry> = { 'United States': 'US', Germany: 'DE', Bulgaria: 'BG', Slovakia: 'SK', 'United Kingdom': 'UK' };

export interface RaceDef {
  id: string;
  title: string;
  group: RaceGroup;
  region: string;
  electionDate: string;
  votingSystem: VotingSystem;
  wikiPage: string;
  wiki?: string;
  sectionHint?: string;
  /** used to rescue a slightly wrong title via Wikipedia search */
  searchQuery?: string;
  /** ignore polls before this date (the guide's "cut off at a pivotal point") */
  cutoffDate?: string;
  /** rolling recency window in days (see BaseCalcOptions.recencyWindowDays) — for races with a long, high-volume polling history and a distant/assumed election date, where cumulative decay alone can't surface momentum */
  recencyWindowDays?: number;
  /** cap each poll's effective sample size (see BaseCalcOptions.maxSampleSize) — for national averages where a few huge trackers would otherwise swamp everything */
  maxSampleSize?: number;
  regionBinding?: RegionBinding;
  kind: 'gallery' | 'senate' | 'governor';
  /** the date is a placeholder (next election not yet scheduled) */
  dateAssumed?: boolean;
  /** known real nominees, when named — lets the parser backfill party affiliation/color for columns that only give a bare candidate surname (see partyColors.ts's backfillAffiliationFromCandidates) */
  demCandidate?: string | null;
  repCandidate?: string | null;
}

/**
 * Everything the parser should know about a race up front: its country, and — for US races — the real nominees and the
 * poll cutoff, so that on a page with a dozen polling tables (nominee head-to-head, withdrawn candidates, "vs. generic
 * Democrat") it picks the table that is actually this race.
 */
export const parseOptionsFor = (def: RaceDef): ParseOptions => ({
  country: GROUP_COUNTRY[def.group],
  known: { demCandidate: def.demCandidate, repCandidate: def.repCandidate },
  cutoffDate: def.cutoffDate,
});

const MIDTERM_DATE = '2026-11-03';
const stateBinding = (abbr: string): RegionBinding => ({ presetId: 'us-states', participants: [abbr] });

export function senateRaceDefs(): RaceDef[] {
  return SENATE_RACES.map((r) => ({
    id: r.id,
    title: `${r.stateName} Senate${r.special ? ' (special)' : ''}`,
    group: 'United States' as const,
    region: r.stateName,
    electionDate: MIDTERM_DATE,
    votingSystem: 'FPTP' as const,
    wikiPage: `2026 United States Senate ${r.special ? 'special ' : ''}election in ${r.stateName}`,
    kind: 'senate' as const,
    regionBinding: stateBinding(r.stateAbbr),
    cutoffDate: r.pollCutoffDate ?? undefined,
    demCandidate: r.demCandidate,
    repCandidate: r.repCandidate,
  }));
}

export function governorRaceDefs(): RaceDef[] {
  return GOVERNOR_RACES.map((r) => ({
    id: r.id,
    title: `${r.stateName} Governor`,
    group: 'United States' as const,
    region: r.stateName,
    electionDate: MIDTERM_DATE,
    votingSystem: 'FPTP' as const,
    wikiPage: `2026 ${r.stateName} gubernatorial election`,
    kind: 'governor' as const,
    regionBinding: stateBinding(r.stateAbbr),
    demCandidate: r.demCandidate,
    repCandidate: r.repCandidate,
  }));
}

// Built once. This used to rebuild all 71 defs on every call, so each render handed a card a brand-new object, which
// re-triggered its loading effects and recomputed its BaseCalc every time anything above it re-rendered.
let midtermIndex: Map<string, RaceDef> | null = null;
export const midtermRaceDef = (id: string): RaceDef | undefined => {
  if (!midtermIndex) midtermIndex = new Map([...senateRaceDefs(), ...governorRaceDefs()].map((d) => [d.id, d]));
  return midtermIndex.get(id);
};

/** Marquee races shown in the Gallery. */
export const GALLERY_RACES: RaceDef[] = [
  {
    // The national generic congressional ballot — the environment number Split Ticket's whole model hangs off. It is
    // fetched, cached, seeded and modelled exactly like every other race here, so it gets a card and a BaseCalc trajectory.
    // The polls live in year-headed tables ("2025–2026") on the elections page, not on a page of their own.
    // Two settings a state race doesn't need: a national average has huge, frequent trackers (Morning Consult runs 24,000–
    // 30,000 respondents a week) that would otherwise outweigh ~30 normal polls each, so effective sample is capped; and its
    // history runs back to 2025, so a trailing 90-day window keeps the headline about *now* rather than the whole cycle.
    id: 'gcb-2026', title: 'Generic congressional ballot 2026', group: 'United States', region: 'United States', electionDate: MIDTERM_DATE, votingSystem: 'FPTP',
    wikiPage: '2026 United States elections', sectionHint: '2025–2026', searchQuery: '2026 United States elections generic ballot polling', kind: 'gallery',
    maxSampleSize: 3000, recencyWindowDays: 90,
  },
  ...['sen-ga', 'sen-me', 'sen-mi', 'sen-nc'].map((id) => ({ ...midtermRaceDef(id)!, kind: 'gallery' as const })),
  {
    id: 'de-2025', title: 'German federal election 2025', group: 'Germany', region: 'Germany', electionDate: '2025-02-23', votingSystem: 'PartyList',
    wikiPage: 'Opinion polling for the 2025 German federal election', kind: 'gallery', regionBinding: { presetId: 'de-wahlkreise', participants: 'all' },
  },
  {
    id: 'de-next', title: 'Next German federal election', group: 'Germany', region: 'Germany', electionDate: '2029-02-25', votingSystem: 'PartyList', dateAssumed: true,
    wikiPage: 'Opinion polling for the next German federal election', searchQuery: 'Opinion polling for the next German federal election', kind: 'gallery',
    regionBinding: { presetId: 'de-wahlkreise', participants: 'all' },
  },
  {
    id: 'bg-2026', title: 'Bulgarian parliamentary election 2026', group: 'Bulgaria', region: 'Bulgaria', electionDate: '2026-04-19', votingSystem: 'PartyList',
    wikiPage: 'Opinion polling for the 2026 Bulgarian parliamentary election', searchQuery: 'Opinion polling Bulgarian parliamentary election 2026', kind: 'gallery',
    regionBinding: { presetId: 'bg-provinces', participants: 'all' },
  },
  {
    // UK polling tables carry Client and Area columns (GB / Scotland / Wales) — both are ignored as metadata by the parser.
    // No constituency map yet: it needs the 2024 boundaries + results, see the UK note in the README.
    id: 'uk-next', title: 'Next UK general election', group: 'United Kingdom', region: 'United Kingdom', electionDate: '2029-08-15', votingSystem: 'FPTP', dateAssumed: true,
    wikiPage: 'Opinion polling for the next United Kingdom general election', searchQuery: 'Opinion polling for the next United Kingdom general election', kind: 'gallery',
  },
  {
    id: 'sk-next', title: 'Next Slovak parliamentary election', group: 'Slovakia', region: 'Slovakia', electionDate: '2027-09-30', votingSystem: 'PartyList', dateAssumed: true,
    wikiPage: 'Opinion polling for the next Slovak parliamentary election', searchQuery: 'Opinion polling for the next Slovak parliamentary election', kind: 'gallery',
    regionBinding: { presetId: 'sk-obce', participants: 'all' },
    // Slovak pollsters publish very frequently and the election date is a distant placeholder,
    // so 1/daysTillElection decay barely differentiates old polls from new ones and the sheer
    // poll count buries any real momentum shift. A ~9-month trailing window keeps the headline
    // number reflecting recent movement instead of the entire multi-year backlog.
    recencyWindowDays: 270,
  },
];

/**
 * Races whose polling must name real candidates. Every 2026 Senate/governor race qualifies; the national generic ballot
 * is the one US race that is *about* "the Democrat" and "the Republican", and international races have no D/R at all.
 */
export const requiresNamedCandidates = (def: RaceDef): boolean => def.group === 'United States' && def.id !== 'gcb-2026';

/** Any pre-built race by id — gallery, Senate or governor — for callers (fetch-polls) that only have the id. */
let raceIndex: Map<string, RaceDef> | null = null;
export const raceDefById = (id: string): RaceDef | undefined => {
  if (!raceIndex) raceIndex = new Map(allRaceDefs().map((d) => [d.id, d]));
  return raceIndex.get(id);
};

export const allRaceDefs = (): RaceDef[] => {
  const seen = new Set<string>();
  return [...GALLERY_RACES, ...senateRaceDefs(), ...governorRaceDefs()].filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
};

/** ElectionConfig for a race once its polls are parsed — what the Results / Election Night pages consume. */
export function configForRace(def: RaceDef, parsed: ParsedPollData): ElectionConfig {
  return {
    id: def.id,
    title: def.title,
    region: def.region,
    electionDate: def.electionDate,
    votingSystem: def.votingSystem,
    parties: parsed.parties,
    regionBinding: def.regionBinding,
    sim: {
      simulations: 1000,
      beta: 1,
      dateWeighting: { enabled: true, divisor: 100, cutoffDate: def.cutoffDate ?? null, minSampleSize: 0, maxSampleSize: def.maxSampleSize ?? null, dateBasis: 'end', recencyWindowDays: def.recencyWindowDays ?? null },
    },
  };
}
