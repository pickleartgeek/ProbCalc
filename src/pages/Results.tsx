import { useState } from 'react';
import { useGeoScene } from '../hooks/useGeoScene';
import { Link, Navigate } from 'react-router-dom';
import { useEngine } from '../state/store';
import { readableOn, onDark } from '../lib/partyColors';
import { getHistory, pushSnapshot } from '../lib/history';
import { ViewToggle } from '../components/ViewToggle';
import { BaseCalcView } from './results/BaseCalcView';
import { ProbCalcView } from './results/ProbCalcView';

export function Results() {
  const { config, pollData, baseCalc, probCalcResults, outcomes, viewMode } = useEngine();
  const [snapshotCount, setSnapshotCount] = useState(() => (config ? getHistory(config.id).length : 0));
  const [justLogged, setJustLogged] = useState(false);
  const scene = useGeoScene(config);

  if (!config || !pollData || !baseCalc) return <Navigate to="/build" replace />;

  const sorted = [...baseCalc.results].sort((a, b) => b.percentage - a.percentage);
  const leader = sorted[0];
  const leaderParty = config.parties.find((p) => p.id === leader?.partyId);
  const leaderProb = probCalcResults?.find((r) => r.partyId === leader?.partyId)?.winProbability;

  function handleLogSnapshot() {
    const base = Object.fromEntries(baseCalc!.results.map((r) => [r.partyId, r.percentage]));
    const prob = probCalcResults ? Object.fromEntries(probCalcResults.map((r) => [r.partyId, r.winProbability])) : undefined;
    pushSnapshot(config!.id, base, prob);
    setSnapshotCount(getHistory(config!.id).length);
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 1800);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <div>
          <p className="text-ink-dim text-xs font-data uppercase tracking-wide">{config.region || 'Untitled region'} · {config.votingSystem}</p>
          <h1 className="font-display font-800 text-3xl">{config.title}</h1>
        </div>
        <ViewToggle />
      </div>

      {leaderParty && (
        <p className="text-ink-muted text-sm mb-8">
          Leading:{' '}
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: onDark(leaderParty.color) }} />
            <span style={{ color: readableOn(leaderParty.color, 'dark') }}>{leaderParty.name}</span>
          </span>{' '}
          {viewMode === 'base' ? `at ${(leader.percentage * 100).toFixed(1)}%` : leaderProb !== undefined ? `wins ${(leaderProb * 100).toFixed(1)}% of simulations` : '— simulating…'}
        </p>
      )}

      {viewMode === 'base' ? (
        <BaseCalcView config={config} pollData={pollData} baseCalc={baseCalc} scene={scene} />
      ) : (
        <ProbCalcView config={config} baseCalc={baseCalc} scene={scene} onRan={() => setSnapshotCount(getHistory(config.id).length)} />
      )}

      <div className="mt-6 bg-panel border border-hairline rounded-lg p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-700 text-lg">Tracker</h2>
          <p className="text-ink-dim text-sm">
            Log the current numbers as a snapshot to build a trend line on the{' '}
            <Link to="/tracker" className="text-cyan hover:underline">Tracker</Link>{' '}
            page. {snapshotCount} snapshot{snapshotCount !== 1 ? 's' : ''} logged for this race so far.
          </p>
        </div>
        <button onClick={handleLogSnapshot} className="px-4 py-2 bg-panel-raised border border-hairline-bright rounded font-display font-700 hover:bg-panel transition shrink-0">
          {justLogged ? '✓ Logged' : '📌 Log snapshot'}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/night" className="px-4 py-2 border border-hairline-bright text-ink rounded font-display font-700 hover:bg-panel transition">Election night →</Link>
        <Link to="/scenarios" className={`px-4 py-2 border rounded font-display font-700 transition ${outcomes ? 'border-hairline-bright text-ink hover:bg-panel' : 'border-hairline text-ink-dim pointer-events-none'}`}>
          Browse scenarios {outcomes ? `(${outcomes.length})` : '— open ProbCalc first'} →
        </Link>
        <Link to="/infobox" className="px-4 py-2 border border-hairline-bright text-ink rounded font-display font-700 hover:bg-panel transition">Generate infobox →</Link>
        <Link to="/tracker" className="px-4 py-2 border border-hairline-bright text-ink rounded font-display font-700 hover:bg-panel transition">View tracker →</Link>
      </div>
    </div>
  );
}
