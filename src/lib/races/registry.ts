import type { ElectionConfig, ParsedPollData, RegionBinding, VotingSystem } from '../types';
import { SENATE_RACES } from '../midterms/senateData';
import { GOVERNOR_RACES } from '../midterms/governorData';
import type { PartyCountry } from '../partyRegistry';

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
  regionBinding?: RegionBinding;
  kind: 'gallery' | 'senate' | 'governor';
  /** the date is a placeholder (next election not yet scheduled) */
  dateAssumed?: boolean;
}

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
  }));
}

const midtermById = () => new Map([...senateRaceDefs(), ...governorRaceDefs()].map((d) => [d.id, d]));
export const midtermRaceDef = (id: string): RaceDef | undefined => midtermById().get(id);

/** Marquee races shown in the Gallery. */
export const GALLERY_RACES: RaceDef[] = [
  {
    id: 'us-pa-sen-2024', title: 'Pennsylvania Senate 2024', group: 'United States', region: 'Pennsylvania', electionDate: '2024-11-05', votingSystem: 'FPTP',
    wikiPage: '2024 United States Senate election in Pennsylvania', cutoffDate: '2024-09-10', kind: 'gallery', regionBinding: stateBinding('PA'),
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
  },
];

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
      dateWeighting: { enabled: true, divisor: 100, cutoffDate: def.cutoffDate ?? null, minSampleSize: 0, dateBasis: 'end' },
    },
  };
}
