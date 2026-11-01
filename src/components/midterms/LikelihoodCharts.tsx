import { useMemo } from 'react';
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { DEM, REP } from '../../lib/midterms/ratings';
import { fmtMargin } from '../../lib/midterms/mapViews';
import { tippingIndex, type ControlCurvePoint } from '../../lib/midterms/envCurve';
import type { ChamberBaseline, ChamberSimResult } from '../../lib/midterms/simulate';

const TIP_STYLE = { background: '#12172a', border: '1px solid #2a3348', fontSize: 11, fontFamily: 'monospace', borderRadius: 6 };
const TIE = '#8b8fa3';
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

/** Who controls the chamber when the Republicans hold `r` of `total` seats. */
const controller = (r: number, b: ChamberBaseline): 'R' | 'D' | 'tie' => (r >= b.majority ? 'R' : b.totalSeats - r >= b.majority ? 'D' : 'tie');

/**
 * How many seats each party ends up with across the simulations: one bar per seat count, blue where the Democrats
 * control, red where the Republicans do, grey where neither has a majority. The shape is the honest picture behind the
 * single "% chance" number — how wide the plausible range is, and how close the majority line sits to the middle of it.
 */
export function SeatDistribution({ title, sim, baseline }: { title: string; sim: ChamberSimResult; baseline: ChamberBaseline }) {
  const data = useMemo(() => {
    const n = sim.iterations;
    const hist = sim.seatHistogram;
    let lo = hist.findIndex((c) => c / n >= 0.0005);
    let hi = hist.length - 1 - [...hist].reverse().findIndex((c) => c / n >= 0.0005);
    if (lo < 0) { lo = 0; hi = hist.length - 1; }
    // always show the majority line, even when the whole distribution sits well to one side of it
    lo = Math.max(0, Math.min(lo, baseline.majority) - 1);
    hi = Math.min(hist.length - 1, Math.max(hi, baseline.majority) + 1);
    const data = [];
    for (let k = lo; k <= hi; k++) data.push({ r: k, d: baseline.totalSeats - k, p: hist[k] / n, who: controller(k, baseline) });
    return data;
  }, [sim, baseline]);
  const color = (w: 'R' | 'D' | 'tie') => (w === 'R' ? REP : w === 'D' ? DEM : TIE);

  return (
    <div className="bg-panel border border-hairline rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-display font-700 text-base">{title}</h3>
        <span className="font-data text-[11px] text-ink-dim">seats won, {sim.iterations.toLocaleString()} sims</span>
      </div>
      <div className="font-data text-[11px] text-ink-muted mb-2">
        most likely <span style={{ color: DEM }}>D {baseline.totalSeats - sim.seatsR.median}</span>–<span style={{ color: REP }}>R {sim.seatsR.median}</span>
        {' · '}80% of sims: R {sim.seatsR.p10}–{sim.seatsR.p90}
        {sim.pTie > 0.005 && <> · {pct(sim.pTie, 1)} tied</>}
      </div>
      <div role="img" aria-label={`Distribution of Republican seats won in ${title}`} style={{ width: '100%', height: 170 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap={data.length > 60 ? 0 : '12%'}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3348" opacity={0.3} vertical={false} />
            <XAxis dataKey="r" tick={{ fontSize: 10, fill: '#8994ac' }} interval="preserveStartEnd" minTickGap={14} />
            <YAxis tickFormatter={(v) => pct(v)} tick={{ fontSize: 10, fill: '#8994ac' }} width={40} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              contentStyle={TIP_STYLE}
              labelStyle={{ color: '#eef0f6' }}
              labelFormatter={(r) => `Republicans ${r} · Democrats ${baseline.totalSeats - Number(r)}`}
              formatter={(v, _n, item) => [pct(Number(v), 1), controller((item.payload as { r: number }).r, baseline) === 'tie' ? 'no majority' : `${controller((item.payload as { r: number }).r, baseline) === 'R' ? 'Republican' : 'Democratic'} control`]}
            />
            <ReferenceLine x={baseline.majority} stroke="#eef0f6" strokeDasharray="4 3" strokeOpacity={0.7} label={{ value: `${baseline.majority} = R majority`, position: 'insideTopRight', fontSize: 9, fill: '#eef0f6' }} ifOverflow="hidden" />
            <Bar dataKey="p" isAnimationActive={false}>
              {data.map((d) => <Cell key={d.r} fill={color(d.who)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between font-data text-[10px] text-ink-dim mt-1">
        <span>← more Democratic seats</span><span>Republican seats won →</span>
      </div>
    </div>
  );
}

export interface LadderRace { key: string; label: string; detail: string; pR: number }

/**
 * Every competitive race as one bar, ordered from the most Democratic-leaning to the most Republican-leaning, each bar
 * split by the share of simulations each side won. The tipping-point race — the one that hands the Republicans their
 * majority if every race goes the way it leans — is marked, which is the "where does this chamber actually get decided"
 * read that a single control percentage hides.
 */
export function RaceLadder({ races, baseline }: { races: LadderRace[]; baseline: ChamberBaseline }) {
  const rows = useMemo(() => {
    const { order, at } = tippingIndex(races.map((r) => r.pR), baseline.holdoverR, baseline.majority);
    const tipKey = at >= 0 ? races[order[at]].key : null;
    const shown = [...races].filter((r) => (r.pR > 0.03 && r.pR < 0.97) || r.key === tipKey).sort((a, b) => a.pR - b.pR);
    return { shown, tipKey };
  }, [races, baseline]);

  return (
    <div className="bg-panel border border-hairline rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-display font-700 text-base">Race ladder</h3>
        <span className="font-data text-[11px] text-ink-dim">{rows.shown.length} competitive races</span>
      </div>
      <p className="text-ink-dim text-[11px] mb-3">Share of simulations each side wins. Most Democratic-leaning at the top; the marked race is the one that tips the chamber.</p>
      <div className="space-y-1.5">
        {rows.shown.map((r) => {
          const tip = r.key === rows.tipKey;
          return (
            <div key={r.key} className="flex items-center gap-2" title={`${r.label}: Republican ${pct(r.pR, 1)}, Democrat ${pct(1 - r.pR, 1)}`}>
              <div className="w-28 shrink-0 truncate text-[11px] text-ink-muted" title={r.detail}>{r.label}</div>
              <div className="relative flex-1 h-4 rounded-sm overflow-hidden bg-panel-raised flex" style={tip ? { outline: '1.5px solid var(--color-gold)', outlineOffset: 1 } : undefined}>
                <div style={{ width: `${(1 - r.pR) * 100}%`, background: DEM }} />
                <div style={{ width: `${r.pR * 100}%`, background: REP }} />
                <div className="absolute inset-y-0 left-1/2 w-px bg-void/70" />
                <span className="absolute left-1.5 top-0 text-[9px] leading-4 font-data text-white/90">{r.pR < 0.5 ? pct(1 - r.pR) : ''}</span>
                <span className="absolute right-1.5 top-0 text-[9px] leading-4 font-data text-white/90">{r.pR >= 0.5 ? pct(r.pR) : ''}</span>
              </div>
              <div className="w-14 shrink-0 text-[10px] font-data text-gold">{tip ? 'tipping' : ''}</div>
            </div>
          );
        })}
        {rows.shown.length === 0 && <div className="text-ink-dim text-xs">No competitive races in this chamber at the current environment.</div>}
      </div>
    </div>
  );
}

const SERIES = [
  { key: 'senate', label: 'Senate', color: '#f5c542' },
  { key: 'governors', label: 'Governors', color: '#38bdf8' },
  { key: 'house', label: 'House', color: '#a78bfa' },
] as const;

/** P(Democratic control) of each chamber as the national generic ballot moves — the "what if the mood shifts" estimate. */
export function ControlCurve({ points, currentGcb }: { points: ControlCurvePoint[]; currentGcb: number }) {
  return (
    <div className="bg-panel border border-hairline rounded-lg p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <h3 className="font-display font-700 text-lg">Odds vs the national environment</h3>
        <div className="flex gap-3">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-ink-muted font-data"><span className="w-3 h-0.5 rounded" style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      </div>
      <p className="text-ink-dim text-xs mb-3">Chance the Democrats control each chamber if the generic ballot ended up at each point on the axis. The dashed line is where the slider sits now.</p>
      {points.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center font-data text-sm text-ink-dim">running the simulations…</div>
      ) : (
      <div role="img" aria-label="Probability of Democratic control of each chamber by generic ballot margin" style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3348" opacity={0.3} />
            <XAxis dataKey="gcb" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmtMargin(v)} tick={{ fontSize: 10, fill: '#8994ac' }} />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v) => pct(v)} tick={{ fontSize: 10, fill: '#8994ac' }} width={42} />
            <Tooltip contentStyle={TIP_STYLE} labelStyle={{ color: '#eef0f6' }} labelFormatter={(v) => `Generic ballot ${fmtMargin(Number(v))}`} formatter={(v, name) => [pct(Number(v), 0), `${name} — P(D control)`]} />
            <ReferenceLine y={0.5} stroke="#8994ac" strokeOpacity={0.5} />
            <ReferenceLine x={Math.max(points[0]?.gcb ?? 0, Math.min(points[points.length - 1]?.gcb ?? 0, currentGcb))} stroke="#f2b705" strokeDasharray="4 3" label={{ value: `now ${fmtMargin(currentGcb)}`, position: 'insideTopLeft', fontSize: 10, fill: '#f2b705' }} />
            {SERIES.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
      <p className="text-ink-dim text-[10px] font-data mt-1">left = Democratic-leaning environment, right = Republican-leaning</p>
    </div>
  );
}
