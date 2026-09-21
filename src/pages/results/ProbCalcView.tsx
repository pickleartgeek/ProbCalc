import { useEffect, useRef, useState } from 'react';
import type { ElectionConfig } from '../../lib/types';
import type { BaseCalcBundle } from '../../state/store';
import { useEngine } from '../../state/store';
import { runProbCalc } from '../../lib/probCalc';
import { readableOn, onDark } from '../../lib/partyColors';
import { attachProbToLatest } from '../../lib/history';
import { ResultsDonut } from '../../components/ResultsDonut';
import { PlaceholderMap } from '../../components/PlaceholderMap';
import { USPrecinctMap } from '../../components/USPrecinctMap';
import { DrawsChart } from '../../components/results/DrawsChart';

/** ProbCalc view: win probabilities, Monte Carlo draws, and the district/state mosaic. Runs itself the first time it is opened. */
export function ProbCalcView({ config, baseCalc, onRan }: { config: ElectionConfig; baseCalc: BaseCalcBundle; onRan?: () => void }) {
  const { probCalcResults, outcomes, setProbCalcResults } = useEngine();
  const [simulations, setSimulations] = useState(1000);
  const [beta, setBeta] = useState(1);
  const [running, setRunning] = useState(false);
  const [shiftEnabled, setShiftEnabled] = useState(false);
  const [shiftWeight, setShiftWeight] = useState(0.3);
  const defaults = Object.fromEntries(baseCalc.results.map((r) => [r.partyId, +(r.percentage * 100).toFixed(1)]));
  const [prevEnv, setPrevEnv] = useState<Record<string, number>>(defaults);
  const [curEnv, setCurEnv] = useState<Record<string, number>>(defaults);

  const run = (n = simulations) => {
    setRunning(true);
    setTimeout(() => {
      const { results, outcomes } = runProbCalc(config.parties, baseCalc.results, {
        simulations: n,
        beta,
        dateWeighting: { enabled: true, divisor: 100 },
        environmentShift: shiftEnabled ? { enabled: true, previousEnvironment: prevEnv, currentEnvironment: curEnv, weight: shiftWeight } : undefined,
      });
      setProbCalcResults(results, outcomes);
      attachProbToLatest(config.id, Object.fromEntries(results.map((r) => [r.partyId, r.winProbability])));
      setRunning(false);
      onRan?.();
    }, 30);
  };

  // first open with no simulation yet -> run one, so the toggle "just works"
  const auto = useRef(false);
  useEffect(() => {
    if (!probCalcResults && !auto.current) {
      auto.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const partyById = Object.fromEntries(config.parties.map((p) => [p.id, p]));
  const probs = probCalcResults ? [...probCalcResults].sort((a, b) => b.winProbability - a.winProbability) : [];
  const lead = probs[0];
  const leadParty = lead ? partyById[lead.partyId] : undefined;
  const baseShares = Object.fromEntries(baseCalc.results.map((r) => [r.partyId, r.percentage]));
  const mapShares = Object.fromEntries((probCalcResults ?? []).map((r) => [r.partyId, r.winProbability]));

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-panel border border-hairline rounded-lg p-5">
          <h2 className="font-display font-700 text-lg mb-3">
            {config.region === 'United States' ? 'Simulated precinct-level ProbCalc' : 'Win probability by district'}
          </h2>
          {!probCalcResults ? (
            <div className="h-64 flex items-center justify-center text-ink-dim text-sm font-data">{running ? 'Running Monte Carlo…' : 'No simulation yet'}</div>
          ) : config.region === 'United States' ? (
            <USPrecinctMap mode="prob" />
          ) : (
            <PlaceholderMap parties={config.parties} shares={mapShares} mode="prob" />
          )}
        </div>

        <div className="bg-panel border border-hairline rounded-lg p-5 flex flex-col items-center">
          {probCalcResults && lead ? (
            <>
              <ResultsDonut parties={config.parties} slices={probCalcResults.map((r) => ({ partyId: r.partyId, value: r.winProbability }))}
                centerLabel={`${(lead.winProbability * 100).toFixed(0)}%`} centerSubLabel={leadParty?.shortName ?? ''} />
              <div className="w-full mt-4 space-y-1.5">
                {probs.map((r) => {
                  const p = partyById[r.partyId];
                  return (
                    <div key={r.partyId} className="flex items-center justify-between text-sm" title={p?.name}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: onDark(p?.color) }} />
                        <span className="truncate" style={{ color: p ? readableOn(p.color, 'dark') : undefined }}>{p?.name}</span>
                      </div>
                      <span className="font-data text-ink-muted shrink-0">{(r.winProbability * 100).toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-ink-dim text-sm font-data py-10">{running ? 'Simulating…' : '—'}</p>
          )}
        </div>
      </div>

      {outcomes && (
        <div className="bg-panel border border-hairline rounded-lg p-5">
          <h2 className="font-display font-700 text-lg mb-3">Monte Carlo draws</h2>
          <DrawsChart parties={config.parties} outcomes={outcomes} base={baseShares} />
        </div>
      )}

      <div className="bg-panel border border-hairline rounded-lg p-5">
        <h2 className="font-display font-700 text-lg mb-4">ProbCalc simulation</h2>
        <div className="grid sm:grid-cols-3 gap-6 items-end">
          <div>
            <label className="block text-xs text-ink-dim font-data uppercase mb-1">Simulations</label>
            <input type="range" min={100} max={10000} step={100} value={simulations} onChange={(e) => setSimulations(parseInt(e.target.value, 10))} className="w-full accent-gold" />
            <span className="font-data text-sm text-ink-muted">{simulations.toLocaleString()} runs</span>
          </div>
          <div>
            <label className="block text-xs text-ink-dim font-data uppercase mb-1">Gamma β (scale)</label>
            <input type="range" min={0.1} max={2} step={0.1} value={beta} onChange={(e) => setBeta(parseFloat(e.target.value))} className="w-full accent-gold" />
            <span className="font-data text-sm text-ink-muted">β = {beta.toFixed(1)}</span>
          </div>
          <button onClick={() => run()} disabled={running} className="px-5 py-3 bg-gold text-void font-display font-800 text-lg rounded hover:brightness-110 disabled:opacity-50">
            {running ? 'Simulating…' : probCalcResults ? 'Re-run ProbCalc' : 'Run ProbCalc'}
          </button>
        </div>
      </div>

      <div className="bg-panel border border-hairline rounded-lg p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-700 text-lg">Environment shift</h2>
          <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
            <input type="checkbox" checked={shiftEnabled} onChange={(e) => setShiftEnabled(e.target.checked)} className="accent-gold" />
            Enabled
          </label>
        </div>
        <p className="text-ink-dim text-xs mb-4 max-w-2xl">
          Re-centers each party's alpha around how much the broader environment has moved since your BaseCalc baseline, before sampling. Weight 0 trusts BaseCalc as-is; weight 1 is a full uniform swing.
        </p>
        {shiftEnabled && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-ink-dim font-data uppercase mb-1">Shift weight</label>
              <input type="range" min={0} max={1} step={0.05} value={shiftWeight} onChange={(e) => setShiftWeight(parseFloat(e.target.value))} className="w-full max-w-xs accent-gold" />
              <span className="font-data text-sm text-ink-muted">{(shiftWeight * 100).toFixed(0)}%{shiftWeight < 0.2 ? ' — trust own polling' : shiftWeight > 0.8 ? ' — full swing' : ' — blended'}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {([['Previous environment (%)', prevEnv, setPrevEnv], ['Current environment (%)', curEnv, setCurEnv]] as const).map(([label, env, set]) => (
                <div key={label}>
                  <label className="block text-xs text-ink-dim font-data uppercase mb-1.5">{label}</label>
                  {config.parties.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 mb-1.5">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: onDark(p.color) }} />
                      <span className="text-sm text-ink-muted w-24 truncate">{p.shortName}</span>
                      <input type="number" step={0.1} value={env[p.id] ?? 0} onChange={(e) => set({ ...env, [p.id]: parseFloat(e.target.value) || 0 })}
                        className="w-20 bg-panel-raised border border-hairline rounded px-2 py-1 text-sm font-data" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
