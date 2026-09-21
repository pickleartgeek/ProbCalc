import type { Party } from './types';
import { registryColor as c, US_DEM, US_REP } from './partyRegistry';

export interface TrackedRace {
  id: string;
  title: string;
  region: string;
  leader: string;
  leaderColor: string;
  leadPct: string;
  status: 'polling' | 'projected' | 'called';
  parties: Party[];
  isoNumeric: string;
}

export const TRACKED_RACES: TrackedRace[] = [
  {
    id: 'de-2025',
    title: '2025 German Federal Election',
    region: 'Germany',
    leader: 'Union',
    leaderColor: c('DE', 'union'),
    leadPct: '+7.7',
    status: 'called',
    isoNumeric: '276',
    parties: [
      { id: 'union', name: 'Union', shortName: 'Union', color: c('DE', 'union') },
      { id: 'afd', name: 'AfD', shortName: 'AfD', color: c('DE', 'afd') },
      { id: 'spd', name: 'SPD', shortName: 'SPD', color: c('DE', 'spd') },
      { id: 'grune', name: 'Grüne', shortName: 'Grüne', color: c('DE', 'gruene') },
    ],
  },
  {
    id: 'pa-sen-2024',
    title: '2024 Pennsylvania Senate',
    region: 'United States',
    leader: 'McCormick',
    leaderColor: US_REP,
    leadPct: '+0.2',
    status: 'called',
    isoNumeric: '840',
    parties: [
      { id: 'mccormick', name: 'McCormick (R)', shortName: 'McCormick', color: US_REP },
      { id: 'casey', name: 'Casey (D)', shortName: 'Casey', color: US_DEM },
    ],
  },
  {
    id: 'bg-2026',
    title: 'Bulgaria — Next Election',
    region: 'Bulgaria',
    leader: 'PB',
    leaderColor: '#004225',
    leadPct: '+13.7',
    status: 'polling',
    isoNumeric: '100',
    parties: [
      { id: 'pb', name: 'PB', shortName: 'PB', color: '#004225' },
      { id: 'gerbsds', name: 'GERB-SDS', shortName: 'GERB', color: '#0033A0' },
      { id: 'ppdb', name: 'PP-DB', shortName: 'PP-DB', color: '#F7941D' },
      { id: 'dps', name: 'DPS', shortName: 'DPS', color: '#009B77' },
    ],
  },
  {
    id: 'sk-nrsr',
    title: 'Slovakia — NRSR Tracker',
    region: 'Slovakia',
    leader: 'Smer-SD',
    leaderColor: c('SK', 'smersd'),
    leadPct: '+4.1',
    status: 'polling',
    isoNumeric: '703',
    parties: [
      { id: 'smer', name: 'Smer-SD', shortName: 'Smer', color: c('SK', 'smersd') },
      { id: 'ps', name: 'Progresívne Slovensko', shortName: 'PS', color: c('SK', 'ps') },
      { id: 'hlas', name: 'Hlas-SD', shortName: 'Hlas', color: c('SK', 'hlassd') },
      { id: 'kdh', name: 'KDH', shortName: 'KDH', color: c('SK', 'kdh') },
    ],
  },
];

export interface GalleryCountry {
  id: string;
  name: string;
  flagEmoji: string;
  races: number;
  system: string;
  // Representative party colors, used only to render a decorative mosaic
  // background on the card — not a real projection.
  colors: string[];
  // ISO 3166-1 numeric code, for matching against world-atlas topojson country IDs.
  isoNumeric: string;
}

export const GALLERY_COUNTRIES: GalleryCountry[] = [
  { id: 'de', name: 'Germany', flagEmoji: '🇩🇪', races: 3, system: 'Party List (MMP)', colors: [c('DE', 'union'), c('DE', 'spd'), c('DE', 'fdp'), c('DE', 'afd'), c('DE', 'gruene')], isoNumeric: '276' },
  { id: 'us', name: 'United States', flagEmoji: '🇺🇸', races: 12, system: 'FPTP', colors: [US_DEM, US_REP], isoNumeric: '840' },
  { id: 'bg', name: 'Bulgaria', flagEmoji: '🇧🇬', races: 1, system: "D'Hondt", colors: ['#0033A0', '#F7941D', '#004225', '#D2001C', '#5B2C6F'], isoNumeric: '100' },
  { id: 'sk', name: 'Slovakia', flagEmoji: '🇸🇰', races: 2, system: "D'Hondt", colors: [c('SK', 'smersd'), c('SK', 'ps'), c('SK', 'hlassd'), c('SK', 'kdh')], isoNumeric: '703' },
  { id: 'uk', name: 'United Kingdom', flagEmoji: '🇬🇧', races: 1, system: 'FPTP', colors: [c('UK', 'labour'), c('UK', 'conservative'), c('UK', 'reform'), c('UK', 'libdem'), c('UK', 'green')], isoNumeric: '826' },
];
