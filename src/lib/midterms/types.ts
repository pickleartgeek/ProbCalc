import type { Rating } from './ratings';

export type Party = 'D' | 'R' | 'I';

export interface StateInfo {
  abbr: string;
  name: string;
}

export interface SenateRace {
  id: string;
  stateAbbr: string;
  stateName: string;
  seatClass: 2 | 3;
  special: boolean;
  incumbentParty: Party;
  incumbentName: string | null;
  open: boolean;
  rating: Rating;
  /** Real, named 2026 nominees where known (open seats have both; incumbent races may only need the challenger). */
  demCandidate?: string | null;
  repCandidate?: string | null;
  /** A real polling-average margin (R positive) for this specific race, hand-researched — overrides the rating/anchor-derived estimate when present. */
  pollMargin?: number | null;
  pollSource?: string | null;
  pollAsOf?: string | null;
  computedMargin?: number;
}

export interface GovernorRace {
  id: string;
  stateAbbr: string;
  stateName: string;
  incumbentParty: Party;
  incumbentName: string | null;
  open: boolean;
  rating: Rating;
  demCandidate?: string | null;
  repCandidate?: string | null;
  pollMargin?: number | null;
  pollSource?: string | null;
  pollAsOf?: string | null;
  computedMargin?: number;
}

export interface HouseSeat {
  id: string;
  stateAbbr: string;
  stateName: string;
  district: number; // 0 = at-large
  rating: Rating;
}
