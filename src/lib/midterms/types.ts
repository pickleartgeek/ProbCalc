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
}

export interface GovernorRace {
  id: string;
  stateAbbr: string;
  stateName: string;
  incumbentParty: Party;
  incumbentName: string | null;
  open: boolean;
  rating: Rating;
}

export interface HouseSeat {
  id: string;
  stateAbbr: string;
  stateName: string;
  district: number; // 0 = at-large
  rating: Rating;
}
