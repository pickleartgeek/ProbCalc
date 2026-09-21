export interface Party {
  id: string;
  name: string;
  shortName: string;
  color: string; // hex
  /** Set when the column header names a US-style party ("Jon Ossoff Democratic"). Lets D-vs-R logic work on candidate-named columns. */
  affiliation?: 'D' | 'R' | 'I';
}

export interface PollRow {
  id: string;
  firm: string;
  fieldworkStart: string; // ISO date, best guess
  fieldworkEnd: string; // ISO date, used as the poll's reference date
  fieldworkRaw: string; // original text, for display
  sampleSize: number | null;
  values: Record<string, number>; // partyId -> percentage
  isElectionResult?: boolean;
}

export type VotingSystem = 'FPTP' | 'RCV' | 'STAR' | 'DHondt' | 'PartyList';

export interface DateWeighting {
  enabled: boolean;
  // exponent applied to (1 / daysTillElection) — the guide's base formula uses *100 flatly;
  // this lets the user tune how aggressively recency is weighted.
  divisor: number; // default 100, per the guide
  cutoffDate?: string | null; // exclude polls fielded before this date
  minSampleSize?: number; // exclude polls below this sample size
  dateBasis?: 'end' | 'midpoint'; // which fieldwork date anchors the recency calc
}

export interface EnvironmentShiftConfig {
  enabled: boolean;
  /** partyId -> share at the time each race's own baseline was measured. */
  previousEnvironment: Record<string, number>;
  /** partyId -> share right now. */
  currentEnvironment: Record<string, number>;
  /** 0..1 — 0 trusts each race's own BaseCalc entirely, 1 is full uniform swing. */
  weight: number;
}

export interface SimulationConfig {
  simulations: number; // rows of the ProbCalc sheet, e.g. 1000
  beta: number; // gamma distribution scale (β), guide recommends 1 or 0.1
  dateWeighting: DateWeighting;
  environmentShift?: EnvironmentShiftConfig;
}

/** Which pre-built geography an election maps onto (see lib/geo/presets.ts). */
export interface RegionBinding {
  presetId: string;
  /** 'all' = every region in the preset votes; otherwise the ids of the participating regions. */
  participants: 'all' | string[];
  /** Optional user-pasted previous results (see parseBaselineCsv) that override the preset's bundled baseline. */
  baselineCsv?: string;
}

export interface ElectionConfig {
  id: string;
  title: string;
  region: string;
  electionDate: string; // ISO date
  votingSystem: VotingSystem;
  parties: Party[];
  sim: SimulationConfig;
  regionBinding?: RegionBinding;
}

export interface ParsedPollData {
  parties: Party[];
  rows: PollRow[];
  warnings: string[];
  format: 'plain' | 'wikitext' | 'unknown';
  /** Present when the source held several tables and one was chosen (e.g. one per hypothetical matchup). */
  meta?: { tablesFound: number; tableIndex: number; label?: string };
}

export interface BaseCalcResult {
  partyId: string;
  alpha: number; // sum of weighted poll contributions
  percentage: number; // alpha / sum(alpha)
}

export interface ProbCalcResult extends BaseCalcResult {
  winProbability: number; // fraction of simulations won, 0-1
}

export interface SimulationOutcome {
  index: number;
  values: Record<string, number>; // partyId -> simulated percentage
  winnerId: string;
  marginType: 'Plurality' | 'Majority' | 'Supermajority';
}
