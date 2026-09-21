import { useState } from 'react';
import type { PollWeight } from '../../lib/baseCalc';

/** Per-poll weights: why the average is what it is. weight = sample / (days-to-election × divisor). */
export function PollWeightsTable({ weights }: { weights: PollWeight[] }) {
  const [all, setAll] = useState(false);
  const rows = all ? weights : weights.slice(0, 12);
  const maxShare = Math.max(0.0001, ...weights.map((w) => w.share));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-dim text-xs font-data uppercase">
              <th className="py-1.5 pr-3 font-normal">Poll</th>
              <th className="py-1.5 pr-3 font-normal">Fieldwork end</th>
              <th className="py-1.5 pr-3 font-normal text-right">Sample</th>
              <th className="py-1.5 pr-3 font-normal text-right">Days out</th>
              <th className="py-1.5 font-normal w-48">Weight share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.rowId} className={`border-t border-hairline ${w.included ? '' : 'opacity-45'}`}>
                <td className="py-1.5 pr-3 truncate max-w-[14rem]">{w.firm}</td>
                <td className="py-1.5 pr-3 font-data text-ink-muted">{w.fieldworkEnd || '—'}</td>
                <td className="py-1.5 pr-3 font-data text-right">{w.sampleSize?.toLocaleString() ?? '—'}</td>
                <td className="py-1.5 pr-3 font-data text-right">{w.daysTillElection ?? '—'}</td>
                <td className="py-1.5">
                  {w.included ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 rounded-sm bg-cyan/70" style={{ width: `${(w.share / maxShare) * 100}%`, minWidth: 2 }} />
                      <span className="font-data text-xs text-ink-muted">{(w.share * 100).toFixed(1)}%</span>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-dim">excluded — {w.reason}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {weights.length > 12 && (
        <button onClick={() => setAll(!all)} className="mt-2 text-xs text-cyan hover:underline">
          {all ? 'Show fewer' : `Show all ${weights.length} polls`}
        </button>
      )}
    </div>
  );
}
