import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { computeSenateRaces } from '../lib/midterms/senateData';
import { computeGovernorRaces } from '../lib/midterms/governorData';
import { generateHouseSeats } from '../lib/midterms/houseData';
import { simulateChamber, SENATE_BASELINE, GOVERNOR_BASELINE, HOUSE_BASELINE } from '../lib/midterms/simulate';
import { RATING_ORDER, RATING_LABEL, RATING_COLOR } from '../lib/midterms/ratings';
import { PREVIOUS_GCB_R_MARGIN, DEFAULT_CURRENT_GCB_R_MARGIN, STATE_PVI_2024_FALLBACK } from '../lib/midterms/stateGrid';
import { loadRealStatePVI } from '../lib/midterms/precinctAnchor';
import { loadSenatePrecinctAnchor, type SenatePrecinctAnchor } from '../lib/midterms/senatePrecinctAnchor';
import { loadLivePolls, liveEntryFromLoad, type LivePollEntry } from '../lib/midterms/livePollData';
import { loadRace } from '../lib/races/loader';
import { recordGcbSnapshot, recordRaceMargins, getGcbHistory } from '../lib/midterms/gcbHistory';
import { StateMap, type StateMapRace } from '../components/midterms/StateMap';
import { StatePrecinctPanel } from '../components/precinct/StatePrecinctPanel';
import { MapViewToggle } from '../components/midterms/MapViewToggle';
import { isMapView, type MapView } from '../lib/midterms/mapViews';
import { racesToCsv, downloadCsv } from '../lib/midterms/exportCsv';
import { SeatDistribution, RaceLadder, ControlCurve, type LadderRace } from '../components/midterms/LikelihoodCharts';
import { controlCurve, type ControlCurvePoint } from '../lib/midterms/envCurve';
import { NATIONAL_SD, UNPOLLED_ENV_WEIGHT } from '../lib/midterms/raceProb';
import { HouseMosaic } from '../components/midterms/HouseMosaic';
import { ControlGauge } from '../components/midterms/ControlGauge';
import { RaceList } from '../components/midterms/RaceList';
import { RatingBadge } from '../components/midterms/RatingBadge';
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
  return `${favored} favored to win ${chamber} (${pct}%)`;
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

/** What StatePrecinctPanel needs to swing the state's real 2024 results to this specific race's computed margin. */
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
  // Shareable state: ?tab=senate&view=margin&gcb=-3.5&state=GA live in the URL (after the # — HashRouter) and are read once on
  // load, then kept in sync with `replace` so the back button isn't flooded. Anything absent or invalid falls back to the default.
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => { const t = params.get('tab'); return TABS.some((x) => x.key === t) ? (t as Tab) : 'overview'; });
  const [selectedState, setSelectedState] = useState<string | null>(() => { const st = params.get('state')?.toUpperCase(); return st && st in STATE_PVI_2024_FALLBACK ? st : null; });
  // What the state maps are coloured by (rating / margin / win probability). Remembered in this browser; one choice drives every map on the page.
  const [mapView, setMapViewState] = useState<MapView>(() => {
    const q = params.get('view');
    if (isMapView(q)) return q;
    try { const v = localStorage.getItem('probcalc:mapview'); return isMapView(v) ? v : 'rating'; } catch { return 'rating'; }
  });
  const setMapView = (v: MapView) => {
    setMapViewState(v);
    try { localStorage.setItem('probcalc:mapview', v); } catch { /* storage unavailable */ }
  };
  const urlGcb = parseFloat(params.get('gcb') ?? '');
  const hasUrlGcb = Number.isFinite(urlGcb) && Math.abs(urlGcb) <= 30;
  const [currentGcb, setCurrentGcb] = useState(hasUrlGcb ? urlGcb : DEFAULT_CURRENT_GCB_R_MARGIN);
  // Until the reader moves the slider themselves, it follows the live generic-ballot average (the 'gcb-2026' race: fetched
  // and modelled by BaseCalc like every other race). The constant above is only the fallback before the first fetch lands.
  const [gcbTouched, setGcbTouched] = useState(hasUrlGcb); // a shared link pins the slider where the sender left it

  // Write the shareable state back to the URL: gcb only once the reader has set it (otherwise it just follows the live average),
  // debounced so dragging the slider is one history-neutral update, not hundreds.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams();
      if (tab !== 'overview') next.set('tab', tab);
      if (mapView !== 'rating') next.set('view', mapView);
      if (gcbTouched) next.set('gcb', currentGcb.toFixed(1));
      if (selectedState) next.set('state', selectedState);
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(id);
  }, [tab, mapView, gcbTouched, currentGcb, selectedState, params, setParams]);

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
      // functional update: the generic-ballot load below may land first and must not be clobbered
      setLivePolls((prev) => ({ ...polls, ...(prev['gcb-2026'] ? { 'gcb-2026': prev['gcb-2026'] } : {}) }));
    });
    // The generic ballot also goes through the same live -> browser cache -> bundled fallback loader its own card uses, so the
    // hero number agrees with that card and still works where no CI-written public/data/polls file exists (dev, first deploy,
    // or a day the scheduled fetch failed). A real load beats the static file; a seed/empty load leaves the static file alone.
    if (GCB_DEF) {
      loadRace(GCB_DEF).then((load) => {
        if (cancelled) return;
        const entry = liveEntryFromLoad(load, GCB_DEF);
        if (entry) setLivePolls((prev) => ({ ...prev, 'gcb-2026': entry }));
      });
    }
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
  // independent polling; Senate/Governors at UNPOLLED_ENV_WEIGHT (0.6) when
  // they have no poll of their own, and only a nudge (≤0.1) when they do. The
  // House's state-level anchor (statePvi) is now the real precinct-derived
  // margin rather than an approximation.
  const liveMarginsById = useMemo(
    () => Object.fromEntries(Object.entries(livePolls).map(([id, e]) => [id, e.margin])),
    [livePolls]
  );

  const liveStrengthsById = useMemo(
    () => Object.fromEntries(Object.entries(livePolls).filter(([, e]) => e.strength !== undefined).map(([id, e]) => [id, e.strength as number])),
    [livePolls]
  );

  const SENATE_RACES = useMemo(
    () => computeSenateRaces(currentGcb, UNPOLLED_ENV_WEIGHT, senateAnchor?.baselineSenateMargins, liveMarginsById, liveStrengthsById),
    [currentGcb, senateAnchor, liveMarginsById, liveStrengthsById]
  );
  const GOVERNOR_RACES = useMemo(
    () => computeGovernorRaces(currentGcb, UNPOLLED_ENV_WEIGHT, liveMarginsById, liveStrengthsById),
    [currentGcb, liveMarginsById, liveStrengthsById]
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

  const senateSim = useMemo(() => simulateChamber(SENATE_RACES, SENATE_BASELINE, 'senate-2026', 8000, { nationalSd: NATIONAL_SD }), [SENATE_RACES]);
  const governorSim = useMemo(() => simulateChamber(GOVERNOR_RACES, GOVERNOR_BASELINE, 'governors-2026', 8000, { nationalSd: NATIONAL_SD }), [GOVERNOR_RACES]);
  const houseSim = useMemo(() => simulateChamber(HOUSE_SEATS, HOUSE_BASELINE, 'house-2026', 8000, { nationalSd: NATIONAL_SD }), [HOUSE_SEATS]);

  // Race ladders: every race with the share of simulations each side won it.
  const ladder = (races: (typeof SENATE_RACES)[number][] | (typeof GOVERNOR_RACES)[number][], sim: typeof senateSim): LadderRace[] =>
    races.map((r, i) => ({
      key: r.id,
      label: `${r.stateName}${'special' in r && r.special ? ' (sp.)' : ''}`,
      detail: `${r.demCandidate ?? 'Democrat'} vs ${r.repCandidate ?? 'Republican'}`,
      pR: sim.raceRWins[i] / sim.iterations,
    }));
  const senateLadder = useMemo(() => ladder(SENATE_RACES, senateSim), [SENATE_RACES, senateSim]); // eslint-disable-line react-hooks/exhaustive-deps
  const governorLadder = useMemo(() => ladder(GOVERNOR_RACES, governorSim), [GOVERNOR_RACES, governorSim]); // eslint-disable-line react-hooks/exhaustive-deps

  // "What if the national mood moves?" — the three chamber simulations re-run across a range of generic-ballot values.
  // Independent of the slider (the slider only places the marker), so it is computed once the real anchors have loaded.
  // Computed after a short pause so the several data loads that land at page start (anchors, polls, precincts) trigger
  // one computation rather than one each, and so it never delays the first paint.
  const [envCurve, setEnvCurve] = useState<ControlCurvePoint[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      setEnvCurve(controlCurve({
        gcbs: Array.from({ length: 19 }, (_, i) => -12 + i),
        senate: (g) => computeSenateRaces(g, UNPOLLED_ENV_WEIGHT, senateAnchor?.baselineSenateMargins, liveMarginsById, liveStrengthsById),
        governors: (g) => computeGovernorRaces(g, UNPOLLED_ENV_WEIGHT, liveMarginsById, liveStrengthsById),
        house: (g) => generateHouseSeats(g, statePvi),
        nationalSd: NATIONAL_SD,
      }));
    }, 600);
    return () => clearTimeout(t);
  }, [senateAnchor, liveMarginsById, liveStrengthsById, statePvi]);

  // What the map tooltip shows: each race's rating plus how many of the chamber simulation's iterations each side won it.
  const senateMapRaces = useMemo<StateMapRace[]>(
    () => SENATE_RACES.map((r, i) => ({ abbr: r.stateAbbr, kind: 'Senate', special: r.special, rating: r.rating, iterations: senateSim.iterations, rWins: senateSim.raceRWins[i], margin: r.computedMargin, incumbentParty: r.incumbentParty, incumbentName: r.incumbentName, demCandidate: r.demCandidate, repCandidate: r.repCandidate })),
    [SENATE_RACES, senateSim]
  );
  const governorMapRaces = useMemo<StateMapRace[]>(
    () => GOVERNOR_RACES.map((r, i) => ({ abbr: r.stateAbbr, kind: 'Governor', rating: r.rating, iterations: governorSim.iterations, rWins: governorSim.raceRWins[i], margin: r.computedMargin, incumbentParty: r.incumbentParty, incumbentName: r.incumbentName, demCandidate: r.demCandidate, repCandidate: r.repCandidate })),
    [GOVERNOR_RACES, governorSim]
  );

  const houseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    RATING_ORDER.forEach((r) => (counts[r] = 0));
    HOUSE_SEATS.forEach((s) => (counts[s.rating] += 1));
    return counts;
  }, [HOUSE_SEATS]);

  const selectedSenate = selectedState ? SENATE_RACES.find((r) => r.stateAbbr === selectedState) : null;
  const selectedGov = selectedState ? GOVERNOR_RACES.find((r) => r.stateAbbr === selectedState) : null;

  // Opening a race loads its poll average the same way its own card does (live Wikipedia -> browser cache -> bundled) and feeds
  // THAT number to the model — otherwise a race the scheduled CI fetch missed shows "85 polls, D+2" on its card while the
  // forecast quietly runs off the 2024 baseline. A seed/empty load leaves whatever was there.
  const selectedIds = [selectedSenate?.id, selectedGov?.id].filter((x): x is string => !!x).join('|');
  useEffect(() => {
    let cancelled = false;
    for (const id of selectedIds ? selectedIds.split('|') : []) {
      const def = midtermRaceDef(id);
      if (!def) continue;
      loadRace(def).then((load) => {
        if (cancelled) return;
        const entry = liveEntryFromLoad(load, def);
        if (entry) setLivePolls((prev) => ({ ...prev, [id]: entry }));
      });
    }
    return () => { cancelled = true; };
  }, [selectedIds]);

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
          . Click any race for its live BaseCalc trend and a simulated 2026 county map (real 2024 results,
          uniformly swung to the computed margin).
        </div>
        <div className="bg-panel border border-hairline rounded-lg px-4 py-3 text-xs text-ink-muted mb-2">
          <span className="text-ink">How the odds are computed.</span> Each race's chance is ProbCalc's own: the two candidates'
          BaseCalc alphas set a Gamma draw each, the larger share wins, and — for two candidates — that is exactly a Beta
          distribution, so the probability is evaluated directly rather than sampled. A race with a live polling average
          uses that average's real alphas (capped, so a flurry of last-minute polls can't make it look certain); a race without
          one gets a fixed prior strength (about ±7 points for statewide races, ±10 for House districts) and takes on {Math.round(UNPOLLED_ENV_WEIGHT * 100)}% of the national generic-ballot movement since 2024 (polled races only a nudge, since their polls already reflect it). House districts start from their real 2024 presidential result and take the full movement. The chamber odds
          then simulate every race {senateSim.iterations.toLocaleString()} times, with one shared national swing per simulation
          (±2 points) so errors are correlated, not independent.
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
            <div className="grid md:grid-cols-3 gap-5 mt-5">
              <SeatDistribution title="Senate" sim={senateSim} baseline={SENATE_BASELINE} />
              <SeatDistribution title="Governors" sim={governorSim} baseline={GOVERNOR_BASELINE} />
              <SeatDistribution title="House" sim={houseSim} baseline={HOUSE_BASELINE} />
            </div>
          </div>

          <ControlCurve points={envCurve} currentGcb={currentGcb} />

          <div className="bg-panel border border-hairline rounded-lg p-5">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h3 className="font-display font-700 text-lg">By state</h3>
              <MapViewToggle value={mapView} onChange={setMapView} />
            </div>
            <p className="text-ink-dim text-xs mb-1">hover a state for its simulation results · click one on either map — a state with both races up shows both</p>
            <div className="grid md:grid-cols-2 gap-5 mt-3">
              <div>
                <h4 className="font-display font-700 text-sm text-ink-dim uppercase tracking-wide mb-2">Senate</h4>
                <StateMap view={mapView} races={senateMapRaces} onSelect={setSelectedState} selected={selectedState} />
              </div>
              <div>
                <h4 className="font-display font-700 text-sm text-ink-dim uppercase tracking-wide mb-2">Governors</h4>
                <StateMap view={mapView} races={governorMapRaces} onSelect={setSelectedState} selected={selectedState} />
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
                <StatePrecinctPanel unit="county" stateAbbr={selectedState} simulate={raceSimulate(selectedSenate ?? selectedGov, selectedSenate ? 'Senate' : 'Governor')} />
              </div>
            )}

          </div>
        </div>
      )}

      {tab === 'senate' && (
        <div className="space-y-6">
          <ControlGauge title="Senate" sim={senateSim} baseline={SENATE_BASELINE} />
          <div className="grid md:grid-cols-2 gap-5">
            <SeatDistribution title="Seat distribution" sim={senateSim} baseline={SENATE_BASELINE} />
            <RaceLadder races={senateLadder} baseline={SENATE_BASELINE} />
          </div>
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <MapViewToggle value={mapView} onChange={setMapView} />
              <button
                onClick={() => downloadCsv('probcalc-senate-2026.csv', racesToCsv('Senate', SENATE_RACES, senateSim, currentGcb))}
                className="px-2.5 py-1 rounded-md border border-hairline-bright text-[11px] font-display font-700 text-ink-muted hover:text-ink hover:border-gold/50"
                title="Every race: rating, projected margin, win probabilities and simulation counts"
              >
                Download CSV
              </button>
            </div>
            <StateMap view={mapView} races={senateMapRaces} onSelect={setSelectedState} selected={selectedState} />
            {selectedState && (
              <div className="mt-5 pt-5 border-t border-hairline">
                <StatePrecinctPanel unit="county" stateAbbr={selectedState} simulate={raceSimulate(selectedSenate, 'Senate')} />
              </div>
            )}
          </div>
          <RaceList races={SENATE_RACES} selected={selectedState} onSelect={setSelectedState} pvi={statePvi} />
        </div>
      )}

      {tab === 'governors' && (
        <div className="space-y-6">
          <ControlGauge title="Governors" sim={governorSim} baseline={GOVERNOR_BASELINE} />
          <div className="grid md:grid-cols-2 gap-5">
            <SeatDistribution title="Seat distribution" sim={governorSim} baseline={GOVERNOR_BASELINE} />
            <RaceLadder races={governorLadder} baseline={GOVERNOR_BASELINE} />
          </div>
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <MapViewToggle value={mapView} onChange={setMapView} />
              <button
                onClick={() => downloadCsv('probcalc-governor-2026.csv', racesToCsv('Governor', GOVERNOR_RACES, governorSim, currentGcb))}
                className="px-2.5 py-1 rounded-md border border-hairline-bright text-[11px] font-display font-700 text-ink-muted hover:text-ink hover:border-gold/50"
                title="Every race: rating, projected margin, win probabilities and simulation counts"
              >
                Download CSV
              </button>
            </div>
            <StateMap view={mapView} races={governorMapRaces} onSelect={setSelectedState} selected={selectedState} />
            {selectedState && (
              <div className="mt-5 pt-5 border-t border-hairline">
                <StatePrecinctPanel unit="county" stateAbbr={selectedState} simulate={raceSimulate(selectedGov, 'Governor')} />
              </div>
            )}
          </div>
          <RaceList races={GOVERNOR_RACES} selected={selectedState} onSelect={setSelectedState} pvi={statePvi} />
        </div>
      )}

      {tab === 'house' && (
        <div className="space-y-6">
          <ControlGauge title="House" sim={houseSim} baseline={HOUSE_BASELINE} />
          <SeatDistribution title="Seat distribution" sim={houseSim} baseline={HOUSE_BASELINE} />

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
            <p className="text-ink-dim text-[11px] font-data mt-3">click a state's tile group to see its counties</p>
            {selectedState && (
              <div className="mt-5 pt-5 border-t border-hairline">
                <StatePrecinctPanel unit="county" stateAbbr={selectedState} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
