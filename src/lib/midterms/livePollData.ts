// Reads whatever scripts/fetch-polls.mts most recently wrote to
// public/data/polls/ (refreshed on a schedule — see .github/workflows/deploy.yml).
// Where a race has live data, it supersedes the hand-entered `pollMargin` in
// senateData.ts/governorData.ts, which was only ever a bootstrap snapshot.

export interface LivePollEntry {
  margin: number; // R positive
  asOf: string;
  includedPolls: number;
  sourcePage: string;
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
  results: { partyId: string; percentage: number }[];
}

/**
 * R − D in points. Wikipedia's US tables name their columns after CANDIDATES ("Jon Ossoff Democratic"), so the party
 * ids are candidate-derived ("jonossoffdemocratic"), not the literal 'democrat' / 'republican' this used to look for —
 * which made every live margin silently come back null. The parser now records each column's affiliation; fall back to
 * the classic ids and to reading "(D)" / "Democratic" out of the name for files written before that.
 */
export function marginFromResults(file: PollFile): number | null {
  const side = (aff: 'D' | 'R', idRe: RegExp, nameRe: RegExp) => {
    const cands = file.parties.filter((p) => p.affiliation === aff || idRe.test(p.id) || nameRe.test(p.name));
    // several Democrats/Republicans (a primary table slipped through): take the best-supported one
    return cands
      .map((p) => file.results.find((r) => r.partyId === p.id))
      .filter((r): r is { partyId: string; percentage: number } => !!r)
      .sort((a, b) => b.percentage - a.percentage)[0];
  };
  const rep = side('R', /^republican$/, /\(R\)|republican/i);
  const dem = side('D', /^democrat(ic)?$/, /\(D\)|democrat/i);
  if (!rep || !dem) return null;
  return (rep.percentage - dem.percentage) * 100;
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
                out[e.raceId] = { margin, asOf: file.asOf, includedPolls: file.includedPolls, sourcePage: file.sourcePage };
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
