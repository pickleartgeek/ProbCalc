import type { Party } from './types';

export interface HistorySnapshot {
  t: string; // ISO timestamp
  base: Record<string, number>; // partyId -> BaseCalc percentage (0-1)
  prob?: Record<string, number>; // partyId -> ProbCalc win probability (0-1), if run
}

export interface RaceMeta {
  title: string;
  region: string;
  parties: Party[];
}

export interface TrackedRace {
  id: string;
  meta: RaceMeta;
  history: HistorySnapshot[];
}

const HISTORY_PREFIX = 'probcalc:history:';
const META_PREFIX = 'probcalc:racemeta:';
const MAX_SNAPSHOTS = 60;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (private browsing, etc.) — silently skip persistence
  }
}

export function saveRaceMeta(raceId: string, meta: RaceMeta) {
  safeSet(META_PREFIX + raceId, JSON.stringify(meta));
}

export function getRaceMeta(raceId: string): RaceMeta | null {
  const raw = safeGet(META_PREFIX + raceId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getHistory(raceId: string): HistorySnapshot[] {
  const raw = safeGet(HISTORY_PREFIX + raceId);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Appends a new snapshot with BaseCalc values (and ProbCalc, if already run). */
export function pushSnapshot(raceId: string, base: Record<string, number>, prob?: Record<string, number>) {
  const hist = getHistory(raceId);
  hist.push({ t: new Date().toISOString(), base, prob });
  while (hist.length > MAX_SNAPSHOTS) hist.shift();
  safeSet(HISTORY_PREFIX + raceId, JSON.stringify(hist));
}

/** Attaches ProbCalc results to the most recent snapshot (ProbCalc is always derived from the current BaseCalc). */
export function attachProbToLatest(raceId: string, prob: Record<string, number>) {
  const hist = getHistory(raceId);
  if (hist.length === 0) return;
  hist[hist.length - 1] = { ...hist[hist.length - 1], prob };
  safeSet(HISTORY_PREFIX + raceId, JSON.stringify(hist));
}

export function listTrackedRaces(): TrackedRace[] {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(HISTORY_PREFIX)) ids.add(k.slice(HISTORY_PREFIX.length));
    }
  } catch {
    return [];
  }
  const races: TrackedRace[] = [];
  for (const id of ids) {
    const meta = getRaceMeta(id);
    const history = getHistory(id);
    if (meta && history.length > 0) races.push({ id, meta, history });
  }
  return races.sort((a, b) => (b.history.at(-1)?.t ?? '').localeCompare(a.history.at(-1)?.t ?? ''));
}
