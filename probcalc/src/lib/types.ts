export interface Party {
  id: string;
  name: string;
  shortName: string;
  color: string; // hex
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

export interface ElectionConfig {
  id: string;
  title: string;
  region: string;
  electionDate: string; // ISO date
  votingSystem: VotingSystem;
  parties: Party[];
  sim: SimulationConfig;
}

export interface ParsedPollData {
  parties: Party[];
  rows: PollRow[];
  warnings: string[];
  format: 'plain' | 'wikitext' | 'unknown';
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
