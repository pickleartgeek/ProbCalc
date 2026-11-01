// Reads whatever scripts/fetch-polls.mts most recently wrote to
// public/data/polls/ (refreshed on a schedule — see .github/workflows/deploy.yml).
// Where a race has live data, it supersedes the hand-entered `pollMargin` in
// senateData.ts/governorData.ts, which was only ever a bootstrap snapshot.

import { computeBaseCalc, optionsFromWeighting } from '../baseCalc';
import { hasUsablePolls, type RaceLoad } from '../races/loader';
import { configForRace, type RaceDef } from '../races/registry';

export interface LivePollEntry {
  margin: number; // R positive
  asOf: string;
  includedPolls: number;
  sourcePage: string;
  /** combined D+R BaseCalc alpha of the polling behind `margin` — how sure ProbCalc is (see raceProb.ts) */
  strength?: number;
}

interface PollIndexEntry {
  raceId: string;
  asOf: string;
  includedPolls: number;
  ok: boolean;
}

export interface PollFile {
  raceId: string;
  asOf: string;
  includedPolls: number;
  sourcePage: string;
  parties: { id: string; name: string; shortName?: string; affiliation?: 'D' | 'R' | 'I' }[];
  results: { partyId: string; percentage: number; alpha?: number }[];
}

/**
 * R − D in points. Wikipedia's US tables name their columns after CANDIDATES ("Jon Ossoff Democratic"), so the party
 * ids are candidate-derived ("jonossoffdemocratic"), not the literal 'democrat' / 'republican' this used to look for —
 * which made every live margin silently come back null. The parser now records each column's affiliation; fall back to
 * the classic ids and to reading "(D)" / "Democratic" out of the name for files written before that.
 */
type Side = { partyId: string; percentage: number; alpha?: number };
function sidesFromResults(file: PollFile): { rep: Side; dem: Side } | null {
  // No poll made it into the average (e.g. every poll fell outside the race's recency window): the percentages are all
  // 0, which would read as a dead-even 0.0 margin rather than "no data". Report no margin instead.
  if (!(file.includedPolls > 0)) return null;
  const side = (aff: 'D' | 'R', idRe: RegExp, nameRe: RegExp) => {
    const cands = file.parties.filter((p) => p.affiliation === aff || idRe.test(p.id) || nameRe.test(p.name));
    // several Democrats/Republicans (a primary table slipped through): take the best-supported one
    return cands
      .map((p) => file.results.find((r) => r.partyId === p.id))
      .filter((r): r is Side => !!r)
      .sort((a, b) => b.percentage - a.percentage)[0];
  };
  const rep = side('R', /^republican$/, /\(R\)|republican/i);
  const dem = side('D', /^democrat(ic)?$/, /\(D\)|democrat/i);
  if (!rep || !dem) return null;
  if (rep.percentage === 0 && dem.percentage === 0) return null;
  return { rep, dem };
}

export function marginFromResults(file: PollFile): number | null {
  const s = sidesFromResults(file);
  return s ? (s.rep.percentage - s.dem.percentage) * 100 : null;
}

/** Combined D+R BaseCalc alpha of the polling behind the margin — how sure ProbCalc is of this race (undefined for files written before alphas were recorded). */
export function strengthFromResults(file: PollFile): number | undefined {
  const s = sidesFromResults(file);
  const a = s ? (s.rep.alpha ?? 0) + (s.dem.alpha ?? 0) : 0;
  return a > 0 ? a : undefined;
}

/**
 * Turns a loaded race (live Wikipedia / browser cache / bundled fallback) into the same LivePollEntry the CI-written
 * files produce, so a page can use the very number the race's own card shows. Seed (synthetic placeholder) and empty
 * loads give null — they must never drive the model. Uses the race's own BaseCalc weighting (sample cap, recency window).
 */
export function liveEntryFromLoad(load: RaceLoad, def: RaceDef): LivePollEntry | null {
  if (load.source === 'seed' || load.source === 'none' || !hasUsablePolls(load.parsed, def.cutoffDate)) return null;
  const { results, includedPolls } = computeBaseCalc(load.parsed.parties, load.parsed.rows, def.electionDate, optionsFromWeighting(configForRace(def, load.parsed).sim.dateWeighting));
  const margin = marginFromResults({ raceId: def.id, asOf: load.fetchedAt, includedPolls, sourcePage: def.wikiPage, parties: load.parsed.parties, results });
  if (margin === null) return null;
  const strength = strengthFromResults({ raceId: def.id, asOf: load.fetchedAt, includedPolls, sourcePage: def.wikiPage, parties: load.parsed.parties, results });
  return { margin, asOf: load.fetchedAt, includedPolls, sourcePage: def.wikiPage, strength };
}

let cached: Promise<Record<string, LivePollEntry>> | null = null;

export function loadLivePolls(): Promise<Record<string, LivePollEntry>> {
  if (!cached) {
    cached = (async () => {
      try {
        const idx: PollIndexEntry[] = await fetch(`${import.meta.env.BASE_URL}data/polls/index.json`).then((r) =>
          r.json()
        );
        const out: Record<string, LivePollEntry> = {};
        await Promise.all(
          idx
            .filter((e) => e.ok)
            .map(async (e) => {
              const file: PollFile = await fetch(`${import.meta.env.BASE_URL}data/polls/${e.raceId}.json`).then((r) =>
                r.json()
              );
              const margin = marginFromResults(file);
              if (margin !== null) {
                out[e.raceId] = { margin, asOf: file.asOf, includedPolls: file.includedPolls, sourcePage: file.sourcePage, strength: strengthFromResults(file) };
              }
            })
        );
        return out;
      } catch {
        return {}; // no polls/ directory yet, or the fetch schedule hasn't run — not an error, just nothing live yet
      }
    })();
  }
  return cached;
}
