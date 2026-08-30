import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useEngine } from '../state/store';
import { sampleGamma } from '../lib/gamma';

interface Precinct {
  id: number;
  votes: Record<string, number>;
  totalVotes: number;
  reportsAt: number; // order index, lower = reports earlier
}

function buildPrecincts(partyIds: string[], alphas: Record<string, number>, count: number, seedBias: number): Precinct[] {
  const precincts: Precinct[] = [];
  for (let i = 0; i < count; i++) {
    const votes: Record<string, number> = {};
    let total = 0;
    const precinctSize = 500 + Math.random() * 4500; // simulated turnout per precinct
    for (const pid of partyIds) {
      const share = sampleGamma(Math.max(alphas[pid] ?? 0.01, 0.01), 1);
      votes[pid] = share;
      total += share;
    }
    // normalize to precinct size
    for (const pid of partyIds) {
      votes[pid] = total > 0 ? (votes[pid] / total) * precinctSize : 0;
    }
    // Rural-first bias: smaller precincts tend to report earlier, with noise
    const reportsAt = precinctSize * (0.4 + Math.random() * 0.6) + Math.random() * seedBias * 1000;
    precincts.push({ id: i, votes, totalVotes: precinctSize, reportsAt });
  }
  precincts.sort((a, b) => a.reportsAt - b.reportsAt);
  return precincts;
}

export function ElectionNight() {
  const { config, baseCalcResults } = useEngine();
  const [precincts, setPrecincts] = useState<Precinct[] | null>(null);
  const [reported, setReported] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3); // precincts per tick
  const intervalRef = useRef<number | null>(null);

  const partyIds = useMemo(() => config?.parties.map((p) => p.id) ?? [], [config]);

  useEffect(() => {
    if (!config || !baseCalcResults) return;
    const alphas = Object.fromEntries(baseCalcResults.map((r) => [r.partyId, r.alpha]));
    setPrecincts(buildPrecincts(partyIds, alphas, 120, 3));
    setReported(0);
  }, [config, baseCalcResults, partyIds]);

  useEffect(() => {
    if (!playing || !precincts) return;
    intervalRef.current = window.setInterval(() => {
      setReported((r) => {
        const next = Math.min(precincts.length, r + speed);
        if (next >= precincts.length && intervalRef.current) {
          window.clearInterval(intervalRef.current);
          setPlaying(false);
        }
        return next;
      });
    }, 350);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [playing, precincts, speed]);

  if (!config || !baseCalcResults) return <Navigate to="/build" replace />;
  if (!precincts) return null;

  const partyById = Object.fromEntries(config.parties.map((p) => [p.id, p]));
  const revealed = precincts.slice(0, reported);
  const totals: Record<string, number> = Object.fromEntries(partyIds.map((id) => [id, 0]));
  let grandTotal = 0;
  for (const pr of revealed) {
    for (const id of partyIds) totals[id] += pr.votes[id];
    grandTotal += pr.totalVotes;
  }
  const pctReporting = (reported / precincts.length) * 100;
  const ranked = partyIds
    .map((id) => ({ id, votes: totals[id], pct: grandTotal > 0 ? totals[id] / grandTotal : 0 }))
    .sort((a, b) => b.votes - a.votes);
  const leader = ranked[0];
  const runnerUp = ranked[1];
  const margin = leader && runnerUp ? leader.pct - runnerUp.pct : 0;

  // Simple call heuristic: enough reporting + comfortable margin — and always call once
  // every precinct is in, since "fully reported" implies a determined result.
  const called = reported >= precincts.length || (pctReporting > 55 && margin > 0.08 && reported > 20);

  function reset() {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    setPlaying(false);
    const alphas = Object.fromEntries(baseCalcResults!.map((r) => [r.partyId, r.alpha]));
    setPrecincts(buildPrecincts(partyIds, alphas, 120, 3));
    setReported(0);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full bg-red-call ${playing || (reported > 0 && !called) ? 'pulse-live' : ''}`} />
        <span className="font-data text-xs tracking-widest text-red-call uppercase">
          {called ? 'Race called' : reported === 0 ? 'Standing by' : reported >= precincts.length ? 'All precincts in' : 'Live'}
        </span>
      </div>
      <h1 className="font-display font-800 text-3xl mb-1">Election Night — {config.title}</h1>
      <p className="text-ink-muted mb-8">
        A simulated precinct-by-precinct playback, seeded from your BaseCalc weights. Illustrative only — not a
        real precinct dataset.
      </p>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-panel border border-hairline rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-700 text-lg">Precincts reporting</h2>
            <span className="font-data text-sm text-ink-muted">
              {reported} / {precincts.length} · {pctReporting.toFixed(0)}%
            </span>
          </div>
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(15, 1fr)' }}>
            {precincts.map((pr, i) => {
              const isIn = i < reported;
              let color = '#1a2233';
              if (isIn) {
                const winnerId = partyIds.reduce((best, id) => (pr.votes[id] > pr.votes[best] ? id : best), partyIds[0]);
                color = partyById[winnerId]?.color ?? '#333';
              }
              return <div key={pr.id} className="aspect-square rounded-[2px] transition-colors duration-300" style={{ background: color }} />;
            })}
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={() => setPlaying((p) => !p)}
              disabled={reported >= precincts.length}
              className="px-4 py-2 bg-gold text-void font-display font-800 rounded disabled:opacity-30 hover:brightness-110"
            >
              {playing ? '⏸ Pause' : '▶ Play returns'}
            </button>
            <button
              onClick={() => setReported(precincts.length)}
              className="px-3 py-2 border border-hairline-bright rounded text-sm hover:bg-panel-raised"
            >
              Skip to final
            </button>
            <button onClick={reset} className="px-3 py-2 border border-hairline rounded text-sm text-ink-muted hover:bg-panel-raised">
              Reset
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-ink-dim font-data uppercase">Speed</span>
              <input
                type="range"
                min={1}
                max={10}
                value={speed}
                onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
                className="accent-gold w-24"
              />
            </div>
          </div>
        </div>

        <div className="bg-panel border border-hairline rounded-lg p-5">
          <h2 className="font-display font-700 text-lg mb-3">Running tally</h2>
          <div className="space-y-3">
            {ranked.map((r, i) => {
              const p = partyById[r.id];
              return (
                <div key={r.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p?.color }} />
                      <span>{p?.name}</span>
                      {i === 0 && called && (
                        <span className="text-[10px] font-data uppercase text-gold bg-gold/15 px-1.5 py-0.5 rounded">
                          Winner
                        </span>
                      )}
                    </div>
                    <span className="font-data">{(r.pct * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-panel-raised rounded overflow-hidden">
                    <div className="h-full transition-all duration-300" style={{ width: `${r.pct * 100}%`, background: p?.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-ink-dim text-xs font-data mt-4">
            {Math.round(grandTotal).toLocaleString()} votes counted
          </p>
        </div>
      </div>
    </div>
  );
}
