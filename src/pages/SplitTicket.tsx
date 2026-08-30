import { useMemo, useState } from 'react';
import { computeSenateRaces } from '../lib/midterms/senateData';
import { computeGovernorRaces } from '../lib/midterms/governorData';
import { generateHouseSeats } from '../lib/midterms/houseData';
import { simulateChamber, SENATE_BASELINE, GOVERNOR_BASELINE, HOUSE_BASELINE } from '../lib/midterms/simulate';
import { RATING_ORDER, RATING_LABEL, RATING_COLOR } from '../lib/midterms/ratings';
import { PREVIOUS_GCB_R_MARGIN, DEFAULT_CURRENT_GCB_R_MARGIN } from '../lib/midterms/stateGrid';
import { StateTileMap } from '../components/midterms/StateTileMap';
import { HouseMosaic } from '../components/midterms/HouseMosaic';
import { ControlGauge } from '../components/midterms/ControlGauge';
import { RaceList } from '../components/midterms/RaceList';

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

export function SplitTicket() {
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [currentGcb, setCurrentGcb] = useState(DEFAULT_CURRENT_GCB_R_MARGIN);

  // Every race in every chamber runs through the same environment-shift model
  // (guide III.II, generalized) — House at full weight since it has no
  // independent polling, Senate/Governors at a light weight since those are
  // individually polled and the shift is just a nudge on top of that.
  const SENATE_RACES = useMemo(() => computeSenateRaces(currentGcb, 0.25), [currentGcb]);
  const GOVERNOR_RACES = useMemo(() => computeGovernorRaces(currentGcb, 0.25), [currentGcb]);
  const HOUSE_SEATS = useMemo(() => generateHouseSeats(currentGcb), [currentGcb]);

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
        <span className="text-gold font-semibold">Placeholder data.</span> The race field (states,
        incumbents, open seats) is real for Senate and governors. Every{' '}
        <span className="text-ink">rating</span> — and all 435 House seats — is a synthetic
        starting point, not a forecast. Swap in real numbers in{' '}
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
          onChange={(e) => setCurrentGcb(-parseFloat(e.target.value))}
          className="w-full max-w-md accent-gold"
        />
        <div className="font-data text-sm mt-1">
          Current: <span className="text-gold font-semibold">{gcbLabel(currentGcb)}</span>
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
                  <div className="font-display font-700">
                    {selectedSenate.open ? 'Open seat' : selectedSenate.incumbentName} ({selectedSenate.incumbentParty})
                  </div>
                </div>
              )}
              {selectedGov && (
                <div>
                  <div className="text-ink-dim text-xs uppercase tracking-wide mb-1">Governor &middot; {selectedGov.stateName}</div>
                  <div className="font-display font-700">
                    {selectedGov.open ? 'Open seat' : selectedGov.incumbentName} ({selectedGov.incumbentParty})
                  </div>
                </div>
              )}
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
          <RaceList races={SENATE_RACES} selected={selectedState} onSelect={setSelectedState} />
        </div>
      )}

      {tab === 'governors' && (
        <div className="space-y-6">
          <ControlGauge title="Governors" sim={governorSim} baseline={GOVERNOR_BASELINE} />
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <StateTileMap ratings={governorRatings} onSelect={setSelectedState} selected={selectedState} />
          </div>
          <RaceList races={GOVERNOR_RACES} selected={selectedState} onSelect={setSelectedState} />
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
              <HouseMosaic seats={HOUSE_SEATS} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
