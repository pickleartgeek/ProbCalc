import { DEM, REP } from '../../lib/midterms/ratings';
import type { ChamberSimResult, ChamberBaseline } from '../../lib/midterms/simulate';

interface Props {
  title: string;
  sim: ChamberSimResult;
  baseline: ChamberBaseline;
}

export function ControlGauge({ title, sim, baseline }: Props) {
  const dPct = (sim.seatsD.mean / baseline.totalSeats) * 100;
  const rPct = 100 - dPct;
  const majorityPct = (baseline.majority / baseline.totalSeats) * 100;
  const favored = sim.pRControl > sim.pDControl ? 'R' : 'D';
  const favoredPct = Math.max(sim.pRControl, sim.pDControl);

  return (
    <div className="bg-panel border border-hairline rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display font-700 text-lg">{title}</h3>
        <span className="font-data text-xs text-ink-muted">
          {sim.iterations.toLocaleString()} sims
        </span>
      </div>

      <div className="flex justify-between font-data text-sm mb-1.5">
        <span style={{ color: DEM }}>D {Math.round(sim.seatsD.mean)}</span>
        <span className="text-ink-dim">{baseline.majority} to control</span>
        <span style={{ color: REP }}>R {Math.round(sim.seatsR.mean)}</span>
      </div>

      <div className="relative h-3 rounded-full overflow-hidden bg-panel-raised">
        <div className="absolute inset-y-0 left-0" style={{ width: `${dPct}%`, background: DEM }} />
        <div className="absolute inset-y-0 right-0" style={{ width: `${rPct}%`, background: REP }} />
        <div className="absolute inset-y-0 w-[2px] bg-void" style={{ left: `${majorityPct}%` }} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <div className="font-display font-800 text-2xl" style={{ color: favored === 'R' ? REP : DEM }}>
            {(favoredPct * 100).toFixed(0)}%
          </div>
          <div className="text-ink-dim text-xs">
            probability of <span style={{ color: favored === 'R' ? REP : DEM }}>{favored === 'R' ? 'Republican' : 'Democratic'}</span> control
          </div>
        </div>
        <div className="text-right font-data text-[11px] text-ink-dim leading-relaxed">
          <div>D range: {sim.seatsD.p10}–{sim.seatsD.p90}</div>
          <div>R range: {sim.seatsR.p10}–{sim.seatsR.p90}</div>
        </div>
      </div>
    </div>
  );
}
