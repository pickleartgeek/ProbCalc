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

interface PollFile {
  raceId: string;
  asOf: string;
  includedPolls: number;
  sourcePage: string;
  parties: { id: string; name: string }[];
  results: { partyId: string; percentage: number }[];
}

function marginFromResults(file: PollFile): number | null {
  const rep = file.results.find((r) => r.partyId === 'republican');
  const dem = file.results.find((r) => r.partyId === 'democrat');
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
