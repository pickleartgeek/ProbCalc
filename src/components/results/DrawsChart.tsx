import { useMemo } from 'react';
import type { Party, SimulationOutcome } from '../../lib/types';
import { onDark } from '../../lib/partyColors';

/** The Monte Carlo draws themselves: per-party histogram of simulated vote share, with the BaseCalc value marked. */
export function DrawsChart({ parties, outcomes, base }: { parties: Party[]; outcomes: SimulationOutcome[]; base: Record<string, number> }) {
  const rows = useMemo(() => {
    const top = [...parties].sort((a, b) => (base[b.id] ?? 0) - (base[a.id] ?? 0)).slice(0, 4);
    return top.map((p) => {
      const vals = outcomes.map((o) => o.values[p.id] ?? 0);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const bins = 24;
      const step = (hi - lo) / bins || 1;
      const counts = new Array(bins).fill(0);
      for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - lo) / step))]++;
      const sorted = [...vals].sort((a, b) => a - b);
      const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
      return { p, lo, hi, counts, max: Math.max(...counts), p10: q(0.1), p90: q(0.9) };
    });
  }, [parties, outcomes, base]);

  return (
    <div className="space-y-3">
      {rows.map(({ p, lo, hi, counts, max, p10, p90 }) => {
        const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
        const b = base[p.id] ?? 0;
        return (
          <div key={p.id}>
            <div className="flex items-baseline justify-between text-xs mb-0.5">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: onDark(p.color) }} />{p.shortName}</span>
              <span className="font-data text-ink-dim">80% of draws: {(p10 * 100).toFixed(1)}–{(p90 * 100).toFixed(1)}%</span>
            </div>
            <div className="relative h-12 flex items-end gap-px">
              {counts.map((c, i) => (
                <div key={i} className="flex-1 rounded-t-[1px]" style={{ height: `${(c / max) * 100}%`, background: onDark(p.color), opacity: 0.75 }} />
              ))}
              <div className="absolute top-0 bottom-0 w-px bg-gold" style={{ left: `${pos(b)}%` }} title={`BaseCalc ${(b * 100).toFixed(1)}%`} />
            </div>
            <div className="flex justify-between text-[10px] font-data text-ink-dim"><span>{(lo * 100).toFixed(0)}%</span><span>{(hi * 100).toFixed(0)}%</span></div>
          </div>
        );
      })}
      <p className="text-ink-dim text-[11px]">{outcomes.length.toLocaleString()} simulated elections. Gold line = BaseCalc.</p>
    </div>
  );
}
