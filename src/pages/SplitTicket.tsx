import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { computeSenateRaces } from '../lib/midterms/senateData';
import { computeGovernorRaces } from '../lib/midterms/governorData';
import { generateHouseSeats } from '../lib/midterms/houseData';
import { simulateChamber, SENATE_BASELINE, GOVERNOR_BASELINE, HOUSE_BASELINE } from '../lib/midterms/simulate';
import { RATING_ORDER, RATING_LABEL, RATING_COLOR } from '../lib/midterms/ratings';
import { PREVIOUS_GCB_R_MARGIN, DEFAULT_CURRENT_GCB_R_MARGIN, STATE_PVI_2024_FALLBACK } from '../lib/midterms/stateGrid';
import { loadRealStatePVI } from '../lib/midterms/precinctAnchor';
import { loadSenatePrecinctAnchor, type SenatePrecinctAnchor } from '../lib/midterms/senatePrecinctAnchor';
import { loadLivePolls, type LivePollEntry } from '../lib/midterms/livePollData';
import { recordGcbSnapshot, recordRaceMargins, getGcbHistory } from '../lib/midterms/gcbHistory';
import { StateTileMap } from '../components/midterms/StateTileMap';
import { HouseMosaic } from '../components/midterms/HouseMosaic';
import { ControlGauge } from '../components/midterms/ControlGauge';
import { RaceList } from '../components/midterms/RaceList';
import { RatingBadge } from '../components/midterms/RatingBadge';
import { StatePrecinctPanel } from '../components/precinct/StatePrecinctPanel';
import { RaceCardActions } from '../components/races/RaceTrend';
import { midtermRaceDef, raceDefById } from '../lib/races/registry';
import type { SenateRace, GovernorRace } from '../lib/midterms/types';

type Tab = 'overview' | 'senate' | 'governors' | 'house';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'senate', label: 'Senate' },
  { key: 'governors', label: 'Governors' },
  { key: 'house', label: 'House' },
];

function gcbLabel(margin: number): string {
  if (Math.abs(margin) < 0.05) return 'EVEN';
  return margin > 0 ? `R+${margin.toFixed(1)}` : `D+${Math.abs(margin).toFixed(1)}`;
}

function favoredLine(chamber: string, pRControl: number, pDControl: number): string {
  const favored = pRControl >= pDControl ? 'Republicans' : 'Democrats';
  const pct = Math.round(Math.max(pRControl, pDControl) * 100);
  if (pct < 55) return `${chamber} is a toss-up (${favored} lead narrowly, ${pct}%)`;
  return `${favored} favored to win the ${chamber} (${pct}%)`;
}

/** A collapsed-by-default explanation, for the methodology paragraph and the session-exploration chart — both are
 *  real and worth having, but neither needs to be read before someone's seen the headline numbers. Keeping the
 *  default view to "here's what's true" and tucking "here's how we know" one click away is the main fix for a
 *  page that otherwise reads as one long wall of boxes before you reach anything interactive. */
function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="cursor-pointer select-none list-none flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink">
        <span className="inline-block transition-transform group-open:rotate-90 text-ink-dim">&#9656;</span>
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/** What StatePrecinctPanel needs to swing the state's real 2024 precincts to this specific race's computed margin. */
function raceSimulate(race: (SenateRace | GovernorRace) | null | undefined, kind: 'Senate' | 'Governor') {
  if (!race || race.computedMargin === undefined) return null;
  const label = race.demCandidate || race.repCandidate ? `${race.demCandidate ?? 'Dem'} (D) vs ${race.repCandidate ?? 'Rep'} (R)` : `${kind} race`;
  return { targetMarginR: race.computedMargin, label };
}

/**
 * Clicking a race used to show only its name and one poll line. This gives it the exact same live BaseCalc trend and
 * one-click BaseCalc/ProbCalc/Election-night entry a Gallery card has (RaceCardActions), plus the model's own
 * computed rating and margin, which Gallery has no notion of — the two views of the same race side by side.
 */
function RaceWindow({ race, kind, livePolls }: { race: SenateRace | GovernorRace; kind: 'Senate' | 'Governor'; livePolls: Record<string, LivePollEntry> }) {
  const def = midtermRaceDef(race.id);
  const live = livePolls[race.id];
  return (
    <div className="bg-panel-raised border border-hairline-bright rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-ink-dim text-xs uppercase tracking-wide">{kind} &middot; {race.stateName}</div>
        <RatingBadge rating={race.rating} />
      </div>
      {race.demCandidate || race.repCandidate ? (
        <div className="font-display font-700">
          <span className="text-cyan">{race.demCandidate ?? '?'} (D)</span>
          {' vs '}
          <span className="text-red-call">{race.repCandidate ?? '?'} (R)</span>
        </div>
      ) : (
        <div className="font-display font-700">
          {race.open ? 'Open seat' : race.incumbentName} ({race.incumbentParty})
        </div>
      )}
      <div className="text-ink-dim text-[11px] font-data mt-1 space-y-0.5">
        {race.computedMargin !== undefined && <div>Model margin: <span className="text-ink-muted">{gcbLabel(race.computedMargin)}</span></div>}
        {live ? (
          <div className="text-cyan">
            &#9679; Live: {gcbLabel(live.margin)} avg from {live.includedPolls} polls &mdash; auto-updated {new Date(live.asOf).toLocaleDateString()}
          </div>
        ) : (
          race.pollMargin != null && race.pollSource && (
            <div>Real polling: {gcbLabel(race.pollMargin)} avg &mdash; {race.pollSource}{race.pollAsOf ? ` (as of ${race.pollAsOf})` : ''}</div>
          )
        )}
      </div>
      {def && <RaceCardActions def={def} />}
    </div>
  );
}

const GCB_DEF = raceDefById('gcb-2026');

export function SplitTicket() {
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [currentGcb, setCurrentGcb] = useState(DEFAULT_CURRENT_GCB_R_MARGIN);
  // Until the reader moves the slider themselves, it follows the live generic-ballot average (the 'gcb-2026' race: fetched
  // and modelled by BaseCalc like every other race). The constant above is only the fallback before the first fetch lands.
  const [gcbTouched, setGcbTouched] = useState(false);

  // Real 2024 presidential margins, aggregated off the actual 163,925-precinct
  // set (same manifest.json the Results page's US precinct map reads). Starts
  // as the old approximate constant so the page renders instantly, then swaps
  // to the real per-state figures once the small manifest fetch resolves.
  const [statePvi, setStatePvi] = useState(STATE_PVI_2024_FALLBACK);
  const [pviSource, setPviSource] = useState<{ realCount: number; precinctCount: number } | null>(null);

  // Real 2024 President-vs-Senate ticket-splitting, aggregated off the same
  // MEDSL precinct set for BOTH races in every state that had a 2024 Senate
  // race (~34 states) — the measured average offset across those states
  // becomes the "universal shift" applied to the rest. See senatePrecinctAnchor.ts.
  const [senateAnchor, setSenateAnchor] = useState<SenatePrecinctAnchor | null>(null);

  // Auto-refreshed poll averages from scripts/fetch-polls.mts (runs on a
  // schedule — see .github/workflows/deploy.yml). Supersedes the hand-entered
  // pollMargin snapshots in senateData.ts/governorData.ts once present.
  const [livePolls, setLivePolls] = useState<Record<string, LivePollEntry>>({});

  useEffect(() => {
    let cancelled = false;
    loadRealStatePVI().then(({ margins, realStates, precinctCount }) => {
      if (cancelled) return;
      setStatePvi(margins);
      setPviSource({ realCount: realStates.size, precinctCount });
    });
    loadSenatePrecinctAnchor().then((anchor) => {
      if (cancelled) return;
      setSenateAnchor(anchor);
    });
    loadLivePolls().then((polls) => {
      if (cancelled) return;
      setLivePolls(polls);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const liveGcb = livePolls['gcb-2026'];
  useEffect(() => {
    if (liveGcb && !gcbTouched) setCurrentGcb(Math.round(liveGcb.margin * 10) / 10);
  }, [liveGcb, gcbTouched]);

  // Every race in every chamber runs through the same environment-shift model
  // (guide III.II, generalized) — House at full weight since it has no
  // independent polling, Senate/Governors at a light weight since those are
  // individually polled and the shift is just a nudge on top of that. The
  // House's state-level anchor (statePvi) is now the real precinct-derived
  // margin rather than an approximation.
  const liveMarginsById = useMemo(
    () => Object.fromEntries(Object.entries(livePolls).map(([id, e]) => [id, e.margin])),
    [livePolls]
  );

  const SENATE_RACES = useMemo(
    () => computeSenateRaces(currentGcb, 0.25, senateAnchor?.baselineSenateMargins, liveMarginsById),
    [currentGcb, senateAnchor, liveMarginsById]
  );
  const GOVERNOR_RACES = useMemo(
    () => computeGovernorRaces(currentGcb, 0.25, liveMarginsById),
    [currentGcb, liveMarginsById]
  );
  const HOUSE_SEATS = useMemo(() => generateHouseSeats(currentGcb, statePvi), [currentGcb, statePvi]);

  // How much of the rating for every Senate/governor race is coming from something real (auto-fetched live polling,
  // or a hand-researched pollMargin snapshot) versus the 2024 precinct/rating-derived prior — the honest version of
  // what the old "placeholder ratings" banner used to just assert without checking.
  const coverage = useMemo(() => {
    const all = [...SENATE_RACES, ...GOVERNOR_RACES];
    const live = all.filter((r) => livePolls[r.id]).length;
    const hand = all.filter((r) => !livePolls[r.id] && r.pollMargin != null).length;
    return { total: all.length, live, hand, anchored: all.length - live - hand };
  }, [SENATE_RACES, GOVERNOR_RACES, livePolls]);

  const senateSim = useMemo(() => simulateChamber(SENATE_RACES, SENATE_BASELINE, 'senate-2026'), [SENATE_RACES]);
  const governorSim = useMemo(() => simulateChamber(GOVERNOR_RACES, GOVERNOR_BASELINE, 'governors-2026'), [GOVERNOR_RACES]);
  const houseSim = useMemo(() => simulateChamber(HOUSE_SEATS, HOUSE_BASELINE, 'house-2026'), [HOUSE_SEATS]);

  const senateRatings = useMemo(
    () => Object.fromEntries(SENATE_RACES.map((r) => [r.stateAbbr, r.rating])),
    [SENATE_RACES]
  );
  const governorRatings = useMemo(
    () => Object.fromEntries(GOVERNOR_RACES.map((r) => [r.stateAbbr, r.rating])),
    [GOVERNOR_RACES]
  );

  const houseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    RATING_ORDER.forEach((r) => (counts[r] = 0));
    HOUSE_SEATS.forEach((s) => (counts[s.rating] += 1));
    return counts;
  }, [HOUSE_SEATS]);

  const selectedSenate = selectedState ? SENATE_RACES.find((r) => r.stateAbbr === selectedState) : null;
  const selectedGov = selectedState ? GOVERNOR_RACES.find((r) => r.stateAbbr === selectedState) : null;

  // Records this reading into the local GCB/race-margin history (see
  // gcbHistory.ts) so the trend chart below has something beyond a single
  // point. Debounced so dragging the slider doesn't write on every pixel of
  // movement — only once you pause, and only if the reading actually moved.
  const [historyTick, setHistoryTick] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      recordGcbSnapshot(currentGcb, senateSim.pRControl, houseSim.pRControl, governorSim.pRControl);
      const margins: Record<string, number> = {};
      for (const r of SENATE_RACES) if (r.computedMargin !== undefined) margins[r.id] = r.computedMargin;
      for (const r of GOVERNOR_RACES) if (r.computedMargin !== undefined) margins[r.id] = r.computedMargin;
      recordRaceMargins(margins);
      setHistoryTick((t) => t + 1); // nudge the chart to re-read localStorage
    }, 500);
    return () => clearTimeout(timer);
  }, [currentGcb, senateSim.pRControl, houseSim.pRControl, governorSim.pRControl, SENATE_RACES, GOVERNOR_RACES]);

  const gcbTrend = useMemo(() => {
    void historyTick; // dependency only — re-reads localStorage after each recorded snapshot
    return getGcbHistory().map((s, i) => ({
      i,
      gcb: Number(s.gcb.toFixed(2)),
      'Senate R%': Math.round(s.senateR * 100),
      'House R%': Math.round(s.houseR * 100),
      'Governors R%': Math.round(s.govR * 100),
    }));
  }, [historyTick]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2.5">
        <span className="relative flex items-center justify-center w-7 h-7 rounded-[4px] border border-gold/50 bg-gold/5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-call pulse-live" />
        </span>
        <h1 className="font-display font-800 text-3xl sm:text-4xl tracking-tight">
          SPLIT<span className="text-gold">TICKET</span>
        </h1>
        <span className="font-data text-[10px] text-ink-dim tracking-widest border border-hairline-bright rounded px-1.5 py-0.5">
          2026 MIDTERMS
        </span>
      </div>
      <p className="text-ink-muted mb-6 max-w-2xl">
        Senate, House, and governors — one board. Every race, one probabilistic engine.
      </p>

      {/* GCB hero — the national environment number every race on this page derives from, fetched and modelled
          exactly like every other race (see the Gallery), so it leads the page instead of sitting halfway down it. */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gold/10 via-panel to-panel border border-gold/30 rounded-xl px-5 sm:px-7 py-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-1">
          <div>
            <div className="text-ink-dim text-xs uppercase tracking-widest font-data mb-1.5">
              Generic congressional ballot &middot; the number everything below is built on
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                className="font-display font-800 text-5xl sm:text-6xl tracking-tight leading-none"
                style={{ color: currentGcb > 0.05 ? 'var(--red-call, #ea4b4b)' : currentGcb < -0.05 ? 'var(--cyan, #38bdf8)' : undefined }}
              >
                {gcbLabel(currentGcb)}
              </span>
              {liveGcb ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-cyan font-data">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-live" />
                  live avg {gcbLabel(liveGcb.margin)} &middot; {liveGcb.includedPolls} polls &middot; as of {liveGcb.asOf.slice(0, 10)}
                  {gcbTouched && (
                    <button
                      className="ml-1 text-cyan hover:underline"
                      onClick={() => { setGcbTouched(false); setCurrentGcb(Math.round(liveGcb.margin * 10) / 10); }}
                    >
                      use live
                    </button>
                  )}
                </span>
              ) : (
                <span className="text-ink-dim text-xs font-data">no live average yet &mdash; starting from the last aggregator snapshot</span>
              )}
            </div>
          </div>
          <div className="text-right font-data text-xs text-ink-dim shrink-0">
            2024 baseline<br /><span className="text-ink text-sm">{gcbLabel(PREVIOUS_GCB_R_MARGIN)}</span>
          </div>
        </div>

        {GCB_DEF && (
          <div className="mt-3">
            <RaceCardActions def={GCB_DEF} />
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-hairline/60">
          <p className="text-ink-dim text-xs mb-2 max-w-2xl">
            Explore a different national environment &mdash; House rides it almost entirely (no independent district
            polling), Senate and governors get a light nudge since those races are individually polled. Every tab
            below re-derives live as you move this.
          </p>
          <input
            type="range"
            min={-20}
            max={20}
            step={0.5}
            value={-currentGcb}
            onChange={(e) => { setGcbTouched(true); setCurrentGcb(-parseFloat(e.target.value)); }}
            className="w-full max-w-md accent-gold"
          />

          {gcbTrend.length >= 2 && (
            <Disclosure summary={`See how exploring has moved the odds (${gcbTrend.length} readings this session)`}>
              <div style={{ width: '100%', height: 160 }}>
                <ResponsiveContainer>
                  <LineChart data={gcbTrend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline, #2a3348)" opacity={0.3} />
                    <XAxis dataKey="i" hide />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={32} />
                    <Tooltip
                      contentStyle={{ background: '#12172a', border: '1px solid #2a3348', fontSize: 11, fontFamily: 'monospace' }}
                      labelFormatter={(i) => `Reading #${Number(i) + 1}`}
                    />
                    <Line type="monotone" dataKey="Senate R%" stroke="#ea4b4b" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="House R%" stroke="#f5c542" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="Governors R%" stroke="#3b82f6" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-ink-dim text-[11px] mt-1">
                Not historical polling — this traces P(R control) each time you've moved the slider above this
                session, persisted locally so it builds up over time as you explore scenarios.
              </p>
            </Disclosure>
          )}
        </div>
      </div>

      <Disclosure
        summary={<span><span className="text-ink">Ratings are computed, not hand-set</span> — {coverage.live} of {coverage.total} races use live polling; how the rest are derived</span>}
      >
        <div className="bg-panel border border-hairline rounded-lg px-4 py-3 text-xs text-ink-muted mb-2">
          Every Senate and governor rating is derived live: {coverage.live} of {coverage.total} races blend a real, auto-refreshed
          Wikipedia polling average (see the Gallery) into the environment-shift model; {coverage.hand} more use a
          hand-researched polling snapshot; the remaining {coverage.anchored} fall back to the 2024
          precinct/ticket-split anchor, nudged by the generic-ballot slider above — a reasonable prior, not a
          forecast, until live polling exists for them too. House districts anchor to the{' '}
          <span className="text-ink">real 2024 presidential margin</span>
          {pviSource ? (
            <> ({pviSource.realCount} states from {pviSource.precinctCount.toLocaleString()} real
            precincts{pviSource.realCount < 50 ? `, ${50 - pviSource.realCount} on fallback` : ''})</>
          ) : (
            ' (loading…)'
          )}
          . Senate races without their own live polling anchor instead to the{' '}
          <span className="text-ink">real 2024 President-vs-Senate ticket-split</span>
          {senateAnchor ? (
            <>
              {' '}— {senateAnchor.realStates.size} states measured directly from{' '}
              {senateAnchor.precinctCount.toLocaleString()} real precincts, the rest estimated by applying
              the measured average split ({gcbLabel(senateAnchor.universalOffset)} senate-vs-president) as a
              universal shift on top of that state's real presidential margin
            </>
          ) : (
            ' (loading…)'
          )}
          . Click any race for its live BaseCalc trend and a simulated 2026 precinct map (real 2024 precincts,
          uniformly swung to the computed margin).
        </div>
      </Disclosure>
      <div className="mb-8" />

      {/* Tabs */}
      <div className="flex gap-1.5 mb-8 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-gold text-gold'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div>
            <p className="font-data text-sm text-ink-muted mb-3">
              {favoredLine('the Senate', senateSim.pRControl, senateSim.pDControl)} &middot;{' '}
              {favoredLine('the House', houseSim.pRControl, houseSim.pDControl)} &middot;{' '}
              {favoredLine('governorships', governorSim.pRControl, governorSim.pDControl)}
            </p>
            <div className="grid md:grid-cols-3 gap-5">
              <ControlGauge title="Senate" sim={senateSim} baseline={SENATE_BASELINE} />
              <ControlGauge title="Governors" sim={governorSim} baseline={GOVERNOR_BASELINE} />
              <ControlGauge title="House" sim={houseSim} baseline={HOUSE_BASELINE} />
            </div>
          </div>

          <div className="bg-panel border border-hairline rounded-lg p-5">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h3 className="font-display font-700 text-lg">By state</h3>
              <p className="text-ink-dim text-xs">click a state on either map — a state with both races up shows both</p>
            </div>
            <div className="grid md:grid-cols-2 gap-5 mt-3">
              <div>
                <h4 className="font-display font-700 text-sm text-ink-dim uppercase tracking-wide mb-2">Senate</h4>
                <StateTileMap ratings={senateRatings} onSelect={setSelectedState} selected={selectedState} />
              </div>
              <div>
                <h4 className="font-display font-700 text-sm text-ink-dim uppercase tracking-wide mb-2">Governors</h4>
                <StateTileMap ratings={governorRatings} onSelect={setSelectedState} selected={selectedState} />
              </div>
            </div>

            {(selectedSenate || selectedGov) && (
              <div className="grid md:grid-cols-2 gap-4 mt-5 pt-5 border-t border-hairline">
                {selectedSenate && <RaceWindow race={selectedSenate} kind="Senate" livePolls={livePolls} />}
                {selectedGov && <RaceWindow race={selectedGov} kind="Governor" livePolls={livePolls} />}
              </div>
            )}

            {selectedState && (
              <div className="mt-5 pt-5 border-t border-hairline">
                <StatePrecinctPanel stateAbbr={selectedState} simulate={raceSimulate(selectedSenate ?? selectedGov, selectedSenate ? 'Senate' : 'Governor')} />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'senate' && (
        <div className="space-y-6">
          <ControlGauge title="Senate" sim={senateSim} baseline={SENATE_BASELINE} />
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <StateTileMap ratings={senateRatings} onSelect={setSelectedState} selected={selectedState} />
            {selectedState && (
              <div className="mt-5 pt-5 border-t border-hairline">
                <StatePrecinctPanel stateAbbr={selectedState} simulate={raceSimulate(selectedSenate, 'Senate')} />
              </div>
            )}
          </div>
          <RaceList races={SENATE_RACES} selected={selectedState} onSelect={setSelectedState} pvi={statePvi} />
        </div>
      )}

      {tab === 'governors' && (
        <div className="space-y-6">
          <ControlGauge title="Governors" sim={governorSim} baseline={GOVERNOR_BASELINE} />
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <StateTileMap ratings={governorRatings} onSelect={setSelectedState} selected={selectedState} />
            {selectedState && (
              <div className="mt-5 pt-5 border-t border-hairline">
                <StatePrecinctPanel stateAbbr={selectedState} simulate={raceSimulate(selectedGov, 'Governor')} />
              </div>
            )}
          </div>
          <RaceList races={GOVERNOR_RACES} selected={selectedState} onSelect={setSelectedState} pvi={statePvi} />
        </div>
      )}

      {tab === 'house' && (
        <div className="space-y-6">
          <ControlGauge title="House" sim={houseSim} baseline={HOUSE_BASELINE} />

          <div className="bg-panel border border-hairline rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-700 text-lg">All 435 seats</h3>
              <p className="text-ink-dim text-xs">grouped by state, roughly geographic order</p>
            </div>
            <div className="flex flex-wrap gap-3 mb-5">
              {RATING_ORDER.map((r) => (
                <div key={r} className="flex items-center gap-1.5 text-[11px] text-ink-muted font-data">
                  <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: RATING_COLOR[r] }} />
                  {RATING_LABEL[r]} &middot; {houseCounts[r]}
                </div>
              ))}
            </div>
            <div className="max-h-[520px] overflow-y-auto pr-1">
              <HouseMosaic seats={HOUSE_SEATS} onSelectState={setSelectedState} selected={selectedState} />
            </div>
            <p className="text-ink-dim text-[11px] font-data mt-3">click a state's tile group to see its real precincts</p>
            {selectedState && (
              <div className="mt-5 pt-5 border-t border-hairline">
                <StatePrecinctPanel stateAbbr={selectedState} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
