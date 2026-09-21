import { useEffect, useRef, useState } from 'react';
import type { ElectionConfig } from '../../lib/types';
import type { BaseCalcBundle } from '../../state/store';
import { useEngine } from '../../state/store';
import { runProbCalc } from '../../lib/probCalc';
import { readableOn, onDark } from '../../lib/partyColors';
import { attachProbToLatest } from '../../lib/history';
import { ResultsDonut } from '../../components/ResultsDonut';
import { RaceMap } from '../../components/results/RaceMap';
import type { GeoScene } from '../../hooks/useGeoScene';
import { isTwoPartyBaseline } from '../../lib/geo/returns';
import { DrawsChart } from '../../components/results/DrawsChart';

/** ProbCalc view: win probabilities, Monte Carlo draws, and the district/state mosaic. Runs itself the first time it is opened. */
export function ProbCalcView({ config, baseCalc, scene, onRan }: { config: ElectionConfig; baseCalc: BaseCalcBundle; scene: GeoScene; onRan?: () => void }) {
  const { probCalcResults, outcomes, setProbCalcResults } = useEngine();
  const [simulations, setSimulations] = useState(1000);
  const [beta, setBeta] = useState(1);
  const [running, setRunning] = useState(false);
  const [shiftEnabled, setShiftEnabled] = useState(false);
  const [shiftWeight, setShiftWeight] = useState(0.3);
  const defaults = Object.fromEntries(baseCalc.results.map((r) => [r.partyId, +(r.percentage * 100).toFixed(1)]));
  const [drawIdx, setDrawIdx] = useState(0);
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
      setDrawIdx(0);
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
  // the regional map shows ONE simulated night: this draw's national shares distributed over the regions
  const drawShares = outcomes && outcomes[drawIdx % Math.max(1, outcomes.length)] ? outcomes[drawIdx % outcomes.length].values : baseShares;
  const hasBaseline = Object.values(scene.prevNational).some((v) => v !== undefined);
  const useBaselineAsPrevious = () => {
    setShiftEnabled(true);
    // A two-party baseline (US) is scaled to the same D+R mass as the current aggregate, so undecideds and third parties
    // do not read as both sides falling. Everything else compares share for share.
    const pairIds = isTwoPartyBaseline(scene.baseline?.keys ?? []) ? config.parties.filter((p) => scene.mapping[p.id] && scene.mapping[p.id] !== '__rest__').map((p) => p.id) : [];
    const prevSum = pairIds.reduce((a, id) => a + (scene.prevNational[id] ?? 0), 0);
    const curMass = pairIds.reduce((a, id) => a + (baseShares[id] ?? 0), 0);
    setPrevEnv(Object.fromEntries(config.parties.map((p) => {
      const v = pairIds.includes(p.id) && prevSum > 0 ? ((scene.prevNational[p.id] ?? 0) / prevSum) * curMass : scene.prevNational[p.id] ?? baseShares[p.id] ?? 0;
      return [p.id, +(v * 100).toFixed(1)];
    })));
    setCurEnv(defaults);
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-panel border border-hairline rounded-lg p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-display font-700 text-lg">One simulated night, by region</h2>
            {probCalcResults && outcomes && outcomes.length > 1 && (
              <button onClick={() => setDrawIdx(Math.floor(Math.random() * outcomes.length))} className="px-2.5 py-1 rounded text-xs font-data bg-gold text-void font-semibold hover:brightness-95">↻ New draw</button>
            )}
          </div>
          {!probCalcResults ? (
            <div className="h-64 flex items-center justify-center text-ink-dim text-sm font-data">{running ? 'Running Monte Carlo…' : 'No simulation yet'}</div>
          ) : (
            <RaceMap config={config} mode="prob" aggregate={drawShares} scene={scene} drawKey={drawIdx} mosaicShares={mapShares} />
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
        {hasBaseline && (
          <button onClick={useBaselineAsPrevious} className="mb-4 px-3 py-1.5 border border-hairline-bright rounded text-xs font-data text-cyan hover:bg-panel-raised" data-testid="use-baseline">
            Use the previous election as the baseline →
          </button>
        )}
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
