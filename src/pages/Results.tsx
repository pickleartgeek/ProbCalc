import { useState, useEffect } from 'react';
import { readableOn } from '../lib/partyColors';
import { Link, Navigate } from 'react-router-dom';
import { useEngine } from '../state/store';
import { runProbCalc } from '../lib/probCalc';
import { ResultsDonut } from '../components/ResultsDonut';
import { PlaceholderMap } from '../components/PlaceholderMap';
import { attachProbToLatest, getHistory, pushSnapshot } from '../lib/history';

export function Results() {
  const {
    config,
    pollData,
    baseCalcResults,
    probCalcResults,
    outcomes,
    viewMode,
    setViewMode,
    setProbCalcResults,
  } = useEngine();

  const [simulations, setSimulations] = useState(1000);
  const [beta, setBeta] = useState(1);
  const [running, setRunning] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(() => (config ? getHistory(config.id).length : 0));
  const [justLogged, setJustLogged] = useState(false);

  const [shiftEnabled, setShiftEnabled] = useState(false);
  const [shiftWeight, setShiftWeight] = useState(0.3);
  const [prevEnv, setPrevEnv] = useState<Record<string, number>>({});
  const [curEnv, setCurEnv] = useState<Record<string, number>>({});

  useEffect(() => {
    if (config && baseCalcResults && Object.keys(prevEnv).length === 0) {
      const defaults = Object.fromEntries(baseCalcResults.map((r) => [r.partyId, +(r.percentage * 100).toFixed(1)]));
      setPrevEnv(defaults);
      setCurEnv(defaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.id]);

  if (!config || !pollData || !baseCalcResults) {
    return <Navigate to="/build" replace />;
  }

  const sorted = [...baseCalcResults].sort((a, b) => b.percentage - a.percentage);
  const partyById = Object.fromEntries(config.parties.map((p) => [p.id, p]));

  const leader = sorted[0];
  const leaderParty = partyById[leader?.partyId];

  function handleRunProbCalc() {
    setRunning(true);
    setTimeout(() => {
      const { results, outcomes } = runProbCalc(config!.parties, baseCalcResults!, {
        simulations,
        beta,
        dateWeighting: { enabled: true, divisor: 100 },
        environmentShift: shiftEnabled
          ? { enabled: true, previousEnvironment: prevEnv, currentEnvironment: curEnv, weight: shiftWeight }
          : undefined,
      });
      setProbCalcResults(results, outcomes);
      attachProbToLatest(config!.id, Object.fromEntries(results.map((r) => [r.partyId, r.winProbability])));
      setSnapshotCount(getHistory(config!.id).length);
      setRunning(false);
    }, 30);
  }

  function handleLogSnapshot() {
    const base = Object.fromEntries(baseCalcResults!.map((r) => [r.partyId, r.percentage]));
    const prob = probCalcResults ? Object.fromEntries(probCalcResults.map((r) => [r.partyId, r.winProbability])) : undefined;
    pushSnapshot(config!.id, base, prob);
    setSnapshotCount(getHistory(config!.id).length);
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 1800);
  }

  const donutSlices =
    viewMode === 'base'
      ? baseCalcResults.map((r) => ({ partyId: r.partyId, value: r.percentage }))
      : (probCalcResults ?? []).map((r) => ({ partyId: r.partyId, value: r.winProbability }));

  const mapShares: Record<string, number> =
    viewMode === 'base'
      ? Object.fromEntries(baseCalcResults.map((r) => [r.partyId, r.percentage]))
      : Object.fromEntries((probCalcResults ?? []).map((r) => [r.partyId, r.winProbability]));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <div>
          <p className="text-ink-dim text-xs font-data uppercase tracking-wide">
            {config.region || 'Untitled region'} · {config.votingSystem}
          </p>
          <h1 className="font-display font-800 text-3xl">{config.title}</h1>
        </div>
        <div className="flex items-center gap-2 bg-panel border border-hairline rounded-full p-1">
          <button
            onClick={() => setViewMode('base')}
            className={`px-4 py-1.5 rounded-full text-sm font-display font-700 transition ${
              viewMode === 'base' ? 'bg-cyan/90 text-void' : 'text-ink-muted hover:text-ink'
            }`}
          >
            BaseCalc
          </button>
          <button
            onClick={() => setViewMode('prob')}
            disabled={!probCalcResults}
            className={`px-4 py-1.5 rounded-full text-sm font-display font-700 transition disabled:opacity-30 disabled:cursor-not-allowed ${
              viewMode === 'prob' ? 'bg-gold text-void' : 'text-ink-muted hover:text-ink'
            }`}
            title={!probCalcResults ? 'Run ProbCalc first' : undefined}
          >
            ProbCalc
          </button>
        </div>
      </div>

      {leaderParty && (
        <p className="text-ink-muted text-sm mb-8">
          Leading:{' '}
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: leaderParty.color }} />
            <span style={{ color: readableOn(leaderParty.color, 'dark') }}>{leaderParty.name}</span>
          </span>{' '}
          {viewMode === 'base'
            ? `at ${(leader.percentage * 100).toFixed(1)}%`
            : `wins ${((probCalcResults?.find((r) => r.partyId === leader.partyId)?.winProbability ?? 0) * 100).toFixed(1)}% of simulations`}
        </p>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Map — main piece */}
        <div className="lg:col-span-2 bg-panel border border-hairline rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-700 text-lg">
              {viewMode === 'base' ? 'Vote share by district' : 'Win probability by district'}
            </h2>
          </div>
          <PlaceholderMap parties={config.parties} shares={mapShares} mode={viewMode} />
        </div>

        {/* Donut + list */}
        <div className="bg-panel border border-hairline rounded-lg p-5 flex flex-col items-center">
          <ResultsDonut
            parties={config.parties}
            slices={donutSlices}
            centerLabel={viewMode === 'base' ? `${(leader.percentage * 100).toFixed(0)}%` : `${((probCalcResults?.find(r=>r.partyId===leader.partyId)?.winProbability ?? 0) * 100).toFixed(0)}%`}
            centerSubLabel={leaderParty?.shortName ?? ''}
          />
          <div className="w-full mt-4 space-y-1.5">
            {sorted.map((r) => {
              const p = partyById[r.partyId];
              const prob = probCalcResults?.find((pr) => pr.partyId === r.partyId)?.winProbability;
              return (
                <div key={r.partyId} className="flex items-center justify-between text-sm" title={p?.name}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p?.color }} />
                    <span className="truncate">{p?.name}</span>
                  </div>
                  <span className="font-data text-ink-muted shrink-0">
                    {viewMode === 'base'
                      ? `${(r.percentage * 100).toFixed(1)}%`
                      : `${((prob ?? 0) * 100).toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Config + simulate */}
      <div className="mt-6 bg-panel border border-hairline rounded-lg p-5">
        <h2 className="font-display font-700 text-lg mb-4">ProbCalc simulation</h2>
        <div className="grid sm:grid-cols-3 gap-6 items-end">
          <div>
            <label className="block text-xs text-ink-dim font-data uppercase mb-1">Simulations</label>
            <input
              type="range"
              min={100}
              max={10000}
              step={100}
              value={simulations}
              onChange={(e) => setSimulations(parseInt(e.target.value, 10))}
              className="w-full accent-gold"
            />
            <span className="font-data text-sm text-ink-muted">{simulations.toLocaleString()} runs</span>
          </div>
          <div>
            <label className="block text-xs text-ink-dim font-data uppercase mb-1">
              Gamma β (scale)
            </label>
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.1}
              value={beta}
              onChange={(e) => setBeta(parseFloat(e.target.value))}
              className="w-full accent-gold"
            />
            <span className="font-data text-sm text-ink-muted">β = {beta.toFixed(1)}</span>
          </div>
          <button
            onClick={handleRunProbCalc}
            disabled={running}
            className="px-5 py-3 bg-gold text-void font-display font-800 text-lg rounded hover:brightness-110 disabled:opacity-50"
          >
            {running ? 'Simulating…' : probCalcResults ? 'Re-run ProbCalc' : 'Run ProbCalc'}
          </button>
        </div>
      </div>

      {/* Environment shift — guide III.II, generalized */}
      <div className="mt-6 bg-panel border border-hairline rounded-lg p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-700 text-lg">Environment shift</h2>
          <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
            <input
              type="checkbox"
              checked={shiftEnabled}
              onChange={(e) => setShiftEnabled(e.target.checked)}
              className="accent-gold"
            />
            Enabled
          </label>
        </div>
        <p className="text-ink-dim text-xs mb-4 max-w-2xl">
          Re-centers each party's alpha around how much the broader environment has moved
          since your BaseCalc baseline, before sampling. Weight 0 trusts BaseCalc as-is;
          weight 1 is a full uniform swing — use something in between when this race has
          thinner or older polling than the environment figures below.
        </p>
        {shiftEnabled && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-ink-dim font-data uppercase mb-1">
                Shift weight
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={shiftWeight}
                onChange={(e) => setShiftWeight(parseFloat(e.target.value))}
                className="w-full max-w-xs accent-gold"
              />
              <span className="font-data text-sm text-ink-muted">
                {(shiftWeight * 100).toFixed(0)}%
                {shiftWeight < 0.2 ? ' — trust own polling' : shiftWeight > 0.8 ? ' — full swing' : ' — blended'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-ink-dim font-data uppercase mb-1.5">
                  Previous environment (%)
                </label>
                {config.parties.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
                    <span className="text-sm text-ink-muted w-24 truncate">{p.shortName}</span>
                    <input
                      type="number"
                      step={0.1}
                      value={prevEnv[p.id] ?? 0}
                      onChange={(e) => setPrevEnv({ ...prevEnv, [p.id]: parseFloat(e.target.value) || 0 })}
                      className="w-20 bg-panel-raised border border-hairline rounded px-2 py-1 text-sm font-data"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs text-ink-dim font-data uppercase mb-1.5">
                  Current environment (%)
                </label>
                {config.parties.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
                    <span className="text-sm text-ink-muted w-24 truncate">{p.shortName}</span>
                    <input
                      type="number"
                      step={0.1}
                      value={curEnv[p.id] ?? 0}
                      onChange={(e) => setCurEnv({ ...curEnv, [p.id]: parseFloat(e.target.value) || 0 })}
                      className="w-20 bg-panel-raised border border-hairline rounded px-2 py-1 text-sm font-data"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 bg-panel border border-hairline rounded-lg p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-700 text-lg">Tracker</h2>
          <p className="text-ink-dim text-sm">
            Log the current numbers as a snapshot to build a trend line on the{' '}
            <Link to="/tracker" className="text-cyan hover:underline">
              Tracker
            </Link>{' '}
            page. {snapshotCount} snapshot{snapshotCount !== 1 ? 's' : ''} logged for this race so far.
          </p>
        </div>
        <button
          onClick={handleLogSnapshot}
          className="px-4 py-2 bg-panel-raised border border-hairline-bright rounded font-display font-700 hover:bg-panel transition shrink-0"
        >
          {justLogged ? '✓ Logged' : '📌 Log snapshot'}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/scenarios"
          className={`px-4 py-2 border rounded font-display font-700 transition ${
            outcomes ? 'border-hairline-bright text-ink hover:bg-panel' : 'border-hairline text-ink-dim pointer-events-none'
          }`}
        >
          Browse scenarios {outcomes ? `(${outcomes.length})` : '— run ProbCalc first'} →
        </Link>
        <Link
          to="/infobox"
          className="px-4 py-2 border border-hairline-bright text-ink rounded font-display font-700 hover:bg-panel transition"
        >
          Generate infobox →
        </Link>
        <Link
          to="/tracker"
          className="px-4 py-2 border border-hairline-bright text-ink rounded font-display font-700 hover:bg-panel transition"
        >
          View tracker →
        </Link>
      </div>
    </div>
  );
}
