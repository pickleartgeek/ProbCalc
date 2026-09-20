// Records a lightweight time series every time the Split Ticket model is
// recomputed (the GCB slider moves, or real polling/precinct data finishes
// loading and shifts a race). This is NOT historical polling data — there's
// no daily GCB feed wired up — it's a running log of what YOU'VE explored in
// this browser, persisted so the trend lines have something to draw beyond a
// single point. Once a real polling-average time series exists, swap the
// recorder for that; nothing else here needs to change.

export interface GcbSnapshot {
  t: number; // epoch ms
  gcb: number; // R positive
  senateR: number; // P(R controls Senate), 0-1
  houseR: number;
  govR: number;
}

export interface RaceMarginPoint {
  t: number;
  margin: number; // R positive
}

const GCB_KEY = 'probcalc:gcbhistory';
const RACE_KEY_PREFIX = 'probcalc:racehistory:';
const MAX_POINTS = 200;

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
    // ignore — private browsing / storage disabled
  }
}

export function getGcbHistory(): GcbSnapshot[] {
  const raw = safeGet(GCB_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Only appends when the GCB reading has actually moved (rounded to 0.1) — dragging a slider shouldn't spam hundreds of near-identical points. */
export function recordGcbSnapshot(gcb: number, senateR: number, houseR: number, govR: number) {
  const hist = getGcbHistory();
  const last = hist[hist.length - 1];
  if (last && Math.abs(last.gcb - gcb) < 0.05) return;
  hist.push({ t: Date.now(), gcb, senateR, houseR, govR });
  while (hist.length > MAX_POINTS) hist.shift();
  safeSet(GCB_KEY, JSON.stringify(hist));
}

export function getRaceMarginHistory(raceId: string): RaceMarginPoint[] {
  const raw = safeGet(RACE_KEY_PREFIX + raceId);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function recordRaceMargins(margins: Record<string, number>) {
  for (const [raceId, margin] of Object.entries(margins)) {
    const hist = getRaceMarginHistory(raceId);
    const last = hist[hist.length - 1];
    if (last && Math.abs(last.margin - margin) < 0.05) continue;
    hist.push({ t: Date.now(), margin });
    while (hist.length > MAX_POINTS) hist.shift();
    safeSet(RACE_KEY_PREFIX + raceId, JSON.stringify(hist));
  }
}
