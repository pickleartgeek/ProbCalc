import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import type { Party } from '../lib/types';
import { readableOn } from '../lib/partyColors';

interface Snapshot {
  t: string;
  base: Record<string, number>;
  prob?: Record<string, number>;
}

interface Props {
  title: string;
  region: string;
  parties: Party[];
  history: Snapshot[];
  isDemo?: boolean;
}

export function TrendCard({ title, region, parties, history, isDemo }: Props) {
  const [mode, setMode] = useState<'base' | 'prob'>('base');

  const hasProb = history.some((h) => h.prob);

  const chartData = useMemo(() => {
    return history
      .filter((h) => mode === 'base' || h.prob)
      .map((h, i) => {
        const row: Record<string, number | string> = {
          idx: i,
          date: new Date(h.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        };
        const source = mode === 'base' ? h.base : h.prob!;
        parties.forEach((p) => {
          row[p.id] = Math.round((source[p.id] ?? 0) * 1000) / 10;
        });
        return row;
      });
  }, [history, mode, parties]);

  const latest = history.at(-1);
  const latestSource = latest ? (mode === 'base' ? latest.base : latest.prob) : undefined;
  const rankedLatest = latestSource
    ? parties.map((p) => ({ p, v: latestSource[p.id] ?? 0 })).sort((a, b) => b.v - a.v)
    : [];

  return (
    <div className="bg-panel border border-hairline rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-ink-dim text-xs font-data uppercase tracking-wide">{region}</p>
          <h3 className="font-display font-700 text-lg leading-tight">{title}</h3>
        </div>
        <div className="flex items-center gap-1 bg-panel-raised border border-hairline rounded-full p-0.5 shrink-0">
          <button
            onClick={() => setMode('base')}
            className={`px-2.5 py-1 rounded-full text-xs font-display font-700 transition ${
              mode === 'base' ? 'bg-cyan/90 text-void' : 'text-ink-muted'
            }`}
          >
            BaseCalc
          </button>
          <button
            onClick={() => setMode('prob')}
            disabled={!hasProb}
            className={`px-2.5 py-1 rounded-full text-xs font-display font-700 transition disabled:opacity-30 ${
              mode === 'prob' ? 'bg-gold text-void' : 'text-ink-muted'
            }`}
          >
            ProbCalc
          </button>
        </div>
      </div>
      {isDemo && <p className="text-ink-dim text-[10px] font-data mb-2">illustrative example trend, not live data</p>}

      {chartData.length <= 1 ? (
        <div className="h-40 flex items-center justify-center text-ink-dim text-sm text-center px-6">
          {mode === 'prob'
            ? 'Run ProbCalc and log a snapshot to start a win-probability trend.'
            : 'Log another snapshot from the Results page to start a trend line.'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#262f45" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#5c6580', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#262f45' }} />
            <YAxis
              tick={{ fill: '#5c6580', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              formatter={(v, n) => [`${(v as number).toFixed(1)}%`, parties.find((p) => p.id === n)?.shortName ?? String(n)]}
              contentStyle={{ background: '#121826', border: '1px solid #262f45', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: '#8994ac' }}
            />
            {parties.map((p) => (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.id}
                stroke={p.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {rankedLatest.slice(0, 6).map(({ p, v }) => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-ink-muted">{p.shortName}</span>
            <span className="font-data" style={{ color: readableOn(p.color, 'dark') }}>
              {(v * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
