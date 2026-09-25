import { useEffect, useMemo, useState } from 'react';
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
import { StatePrecinctPanel } from '../components/precinct/StatePrecinctPanel';

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
      <p className="text-ink-muted mb-4 max-w-2xl">
        Senate, House, and governors — one board. Every race, one probabilistic engine.
      </p>

      <div className="bg-gold/5 border border-gold/30 rounded-lg px-4 py-2.5 mb-8 text-xs text-ink-muted">
        <span className="text-gold font-semibold">Placeholder ratings, real anchors.</span> The race
        field (states, incumbents, open seats) is real for Senate and governors. House districts anchor
        to the <span className="text-ink">real 2024 presidential margin</span>
        {pviSource ? (
          <> ({pviSource.realCount} states from {pviSource.precinctCount.toLocaleString()} real
          precincts{pviSource.realCount < 50 ? `, ${50 - pviSource.realCount} on fallback` : ''})</>
        ) : (
          ' (loading…)'
        )}
        . Senate races anchor to the{' '}
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
        . Every <span className="text-ink">rating band</span> is still a synthetic starting point, not a
        forecast — swap those in{' '}
        <code className="font-data text-[11px] text-cyan">src/lib/midterms/</code> whenever you have them.
      </div>

      <div className="bg-panel border border-hairline rounded-lg px-5 py-4 mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h3 className="font-display font-700 text-base">Generic ballot</h3>
          <span className="font-data text-xs text-ink-dim">
            2024 baseline: <span className="text-ink">{gcbLabel(PREVIOUS_GCB_R_MARGIN)}</span>
          </span>
        </div>
        <p className="text-ink-dim text-xs mb-3 max-w-2xl">
          Every race — Senate, governors, and all 435 House seats — is extrapolated from this
          number via the guide's environment-shift model (III.II): House rides it almost
          entirely (no independent district polling), Senate and governors only get a light
          nudge from it since those races are individually polled.
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
        <div className="font-data text-sm mt-1">
          Current: <span className="text-gold font-semibold">{gcbLabel(currentGcb)}</span>
          {liveGcb ? (
            <span className="text-ink-dim text-xs ml-3">
              live average {gcbLabel(liveGcb.margin)} · {liveGcb.includedPolls} polls · as of {liveGcb.asOf.slice(0, 10)}
              {gcbTouched && (
                <button className="ml-2 text-cyan hover:underline" onClick={() => { setGcbTouched(false); setCurrentGcb(Math.round(liveGcb.margin * 10) / 10); }}>
                  use live
                </button>
              )}
            </span>
          ) : (
            <span className="text-ink-dim text-xs ml-3">no live average yet — starting from the last aggregator snapshot</span>
          )}
        </div>
      </div>

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
          {gcbTrend.length >= 2 && (
            <div className="bg-panel border border-hairline rounded-lg px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display font-700 text-sm text-ink-dim uppercase tracking-wide">
                  GCB &amp; chamber odds — this session
                </h3>
                <span className="text-ink-dim text-[11px] font-data">{gcbTrend.length} readings explored</span>
              </div>
              <div style={{ width: '100%', height: 180 }}>
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
                Not historical polling — this traces P(R control) each time you've moved the GCB slider this
                session, persisted locally so it builds up over time as you explore scenarios.
              </p>
            </div>
          )}

          <div className="bg-panel-raised border border-hairline-bright rounded-lg px-5 py-4">
            <h3 className="font-display font-700 text-sm text-ink-dim uppercase tracking-wide mb-2">
              Headline
            </h3>
            <ul className="space-y-1 font-data text-sm">
              <li>&bull; {favoredLine('Senate', senateSim.pRControl, senateSim.pDControl)}</li>
              <li>&bull; {favoredLine('House', houseSim.pRControl, houseSim.pDControl)}</li>
              <li>&bull; {favoredLine('governorships', governorSim.pRControl, governorSim.pDControl)}</li>
            </ul>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <ControlGauge title="Senate" sim={senateSim} baseline={SENATE_BASELINE} />
            <ControlGauge title="Governors" sim={governorSim} baseline={GOVERNOR_BASELINE} />
            <ControlGauge title="House" sim={houseSim} baseline={HOUSE_BASELINE} />
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="bg-panel border border-hairline rounded-lg p-5">
              <h3 className="font-display font-700 text-lg mb-3">Senate map</h3>
              <StateTileMap ratings={senateRatings} onSelect={setSelectedState} selected={selectedState} />
            </div>
            <div className="bg-panel border border-hairline rounded-lg p-5">
              <h3 className="font-display font-700 text-lg mb-3">Governors map</h3>
              <StateTileMap ratings={governorRatings} onSelect={setSelectedState} selected={selectedState} />
            </div>
          </div>

          {(selectedSenate || selectedGov) && (
            <div className="bg-panel-raised border border-hairline-bright rounded-lg p-4 flex flex-wrap gap-6">
              {selectedSenate && (
                <div>
                  <div className="text-ink-dim text-xs uppercase tracking-wide mb-1">Senate &middot; {selectedSenate.stateName}</div>
                  {selectedSenate.demCandidate || selectedSenate.repCandidate ? (
                    <div className="font-display font-700">
                      <span className="text-cyan">{selectedSenate.demCandidate ?? '?'} (D)</span>
                      {' vs '}
                      <span className="text-red-call">{selectedSenate.repCandidate ?? '?'} (R)</span>
                    </div>
                  ) : (
                    <div className="font-display font-700">
                      {selectedSenate.open ? 'Open seat' : selectedSenate.incumbentName} ({selectedSenate.incumbentParty})
                    </div>
                  )}
                  {livePolls[selectedSenate.id] ? (
                    <div className="text-cyan text-[11px] font-data mt-1">
                      &#9679; Live: {gcbLabel(livePolls[selectedSenate.id].margin)} avg from{' '}
                      {livePolls[selectedSenate.id].includedPolls} polls &mdash; auto-updated{' '}
                      {new Date(livePolls[selectedSenate.id].asOf).toLocaleDateString()}
                    </div>
                  ) : (
                    selectedSenate.pollMargin != null &&
                    selectedSenate.pollSource && (
                      <div className="text-ink-dim text-[11px] font-data mt-1">
                        Real polling: {gcbLabel(selectedSenate.pollMargin)} avg &mdash; {selectedSenate.pollSource}
                        {selectedSenate.pollAsOf ? ` (as of ${selectedSenate.pollAsOf})` : ''}
                      </div>
                    )
                  )}
                </div>
              )}
              {selectedGov && (
                <div>
                  <div className="text-ink-dim text-xs uppercase tracking-wide mb-1">Governor &middot; {selectedGov.stateName}</div>
                  {selectedGov.demCandidate || selectedGov.repCandidate ? (
                    <div className="font-display font-700">
                      <span className="text-cyan">{selectedGov.demCandidate ?? '?'} (D)</span>
                      {' vs '}
                      <span className="text-red-call">{selectedGov.repCandidate ?? '?'} (R)</span>
                    </div>
                  ) : (
                    <div className="font-display font-700">
                      {selectedGov.open ? 'Open seat' : selectedGov.incumbentName} ({selectedGov.incumbentParty})
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedState && (
            <div className="bg-panel border border-hairline rounded-lg p-5">
              <StatePrecinctPanel stateAbbr={selectedState} />
            </div>
          )}
        </div>
      )}

      {tab === 'senate' && (
        <div className="space-y-6">
          <ControlGauge title="Senate" sim={senateSim} baseline={SENATE_BASELINE} />
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <StateTileMap ratings={senateRatings} onSelect={setSelectedState} selected={selectedState} />
          </div>
          {selectedState && (
            <div className="bg-panel border border-hairline rounded-lg p-5">
              <StatePrecinctPanel stateAbbr={selectedState} />
            </div>
          )}
          <RaceList races={SENATE_RACES} selected={selectedState} onSelect={setSelectedState} pvi={statePvi} />
        </div>
      )}

      {tab === 'governors' && (
        <div className="space-y-6">
          <ControlGauge title="Governors" sim={governorSim} baseline={GOVERNOR_BASELINE} />
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <StateTileMap ratings={governorRatings} onSelect={setSelectedState} selected={selectedState} />
          </div>
          {selectedState && (
            <div className="bg-panel border border-hairline rounded-lg p-5">
              <StatePrecinctPanel stateAbbr={selectedState} />
            </div>
          )}
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
          </div>

          {selectedState && (
            <div className="bg-panel border border-hairline rounded-lg p-5">
              <StatePrecinctPanel stateAbbr={selectedState} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
