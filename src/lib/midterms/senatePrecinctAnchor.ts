// Bridges the real, precinct-level 2024 ticket-splitting data
// (public/data/precincts/senate-2024-manifest.json — built by
// scripts/build_senate_manifest.py off the same-year, same-precinct MEDSL
// returns for BOTH President and Senate, state by state) into the Senate
// simulation. Unlike precinctAnchor.ts (President only, feeds the House),
// this one measures how each state's electorate actually voted differently
// for Senate than for President in the same election — the real
// "ticket-split" — instead of assuming Senate behaves like President.
//
// ~34 states had a 2024 Senate race (Class I + two specials); those get a
// REAL offset. For the ~16-17 states that didn't (2026's Class II/III
// races), we apply the *average* real offset from the states that did —
// a genuine "universal shift," measured from actual returns rather than
// hand-picked — on top of that state's real 2024 presidential margin.

interface SenateManifestEntry {
  state: string;
  precincts: number;
  president_votes_rep: number;
  president_votes_dem: number;
  president_votes_total: number;
  has_senate_race_2024: boolean;
  senate_votes_rep?: number;
  senate_votes_dem?: number;
  senate_votes_total?: number;
  senate_precincts?: number;
}

export interface SenatePrecinctAnchor {
  /** stateAbbr -> real 2024 presidential margin, points, R positive. */
  presidentMargins: Record<string, number>;
  /** stateAbbr -> real 2024 Senate margin, points, R positive. Only states with a 2024 race. */
  realSenateMargins: Record<string, number>;
  /** stateAbbr -> (senate margin - president margin), points. Only states with a 2024 race. */
  ticketSplitOffsets: Record<string, number>;
  /** stateAbbr -> best-estimate 2024 Senate baseline for EVERY state: real where measured, else president margin + universalOffset. */
  baselineSenateMargins: Record<string, number>;
  /** The measured average ticket-split offset, applied to states without their own 2024 Senate race. */
  universalOffset: number;
  /** States whose baseline came from a real, same-year Senate race (vs. the universal-offset estimate). */
  realStates: Set<string>;
  precinctCount: number;
}

const EMPTY: SenatePrecinctAnchor = {
  presidentMargins: {},
  realSenateMargins: {},
  ticketSplitOffsets: {},
  baselineSenateMargins: {},
  universalOffset: 0,
  realStates: new Set(),
  precinctCount: 0,
};

function compute(manifest: SenateManifestEntry[]): SenatePrecinctAnchor {
  const presidentMargins: Record<string, number> = {};
  const realSenateMargins: Record<string, number> = {};
  const ticketSplitOffsets: Record<string, number> = {};
  const realStates = new Set<string>();
  let precinctCount = 0;

  for (const m of manifest) {
    if (!m.president_votes_total) continue;
    const presMargin = ((m.president_votes_rep - m.president_votes_dem) / m.president_votes_total) * 100;
    presidentMargins[m.state] = presMargin;
    precinctCount += m.precincts ?? 0;

    if (m.has_senate_race_2024 && m.senate_votes_total) {
      const senMargin = ((m.senate_votes_rep! - m.senate_votes_dem!) / m.senate_votes_total) * 100;
      realSenateMargins[m.state] = senMargin;
      ticketSplitOffsets[m.state] = senMargin - presMargin;
      realStates.add(m.state);
    }
  }

  const offsets = Object.values(ticketSplitOffsets);
  const universalOffset = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0;

  const baselineSenateMargins: Record<string, number> = {};
  for (const [state, presMargin] of Object.entries(presidentMargins)) {
    baselineSenateMargins[state] = realSenateMargins[state] ?? presMargin + universalOffset;
  }

  return {
    presidentMargins,
    realSenateMargins,
    ticketSplitOffsets,
    baselineSenateMargins,
    universalOffset,
    realStates,
    precinctCount,
  };
}

let cached: Promise<SenatePrecinctAnchor> | null = null;

/** Loads (and caches) the real 2024 President-vs-Senate ticket-splitting anchor. */
export function loadSenatePrecinctAnchor(): Promise<SenatePrecinctAnchor> {
  if (!cached) {
    cached = fetch(`${import.meta.env.BASE_URL}data/precincts/senate-2024-manifest.json`)
      .then((r) => r.json())
      .then((manifest: SenateManifestEntry[]) => compute(manifest))
      .catch(() => EMPTY);
  }
  return cached;
}
