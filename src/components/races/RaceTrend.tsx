import { useMemo } from 'react';
import { BaseTimelineChart } from '../BaseTimelineChart';
import { SourceBadge } from './SourceBadge';
import { useRacePolling } from '../../hooks/useRacePolling';
import { readableOn, onDark } from '../../lib/partyColors';
import type { RaceDef } from '../../lib/races/registry';
import { describeFailure } from '../../lib/races/loader';

/** The day-by-day BaseCalc line graph + source badge that sits inside every race card (Gallery and Split Ticket). */
export type RacePollingState = ReturnType<typeof useRacePolling>;

export function RaceTrend({ def, state }: { def: RaceDef; state: RacePollingState }) {
  const { ref, load, loading, bundle, retry } = state;

  const top = useMemo(() => {
    if (!bundle || !load) return [];
    const byId = Object.fromEntries(load.parsed.parties.map((p) => [p.id, p]));
    return [...bundle.results].sort((a, b) => b.percentage - a.percentage).slice(0, 3).map((r) => ({ p: byId[r.partyId], v: r.percentage }));
  }, [bundle, load]);

  return (
    <div ref={ref} className="mt-2.5 pt-2.5 border-t border-hairline/70" data-testid={`trend-${def.id}`}>
      {bundle && load ? (
        <>
          <BaseTimelineChart parties={load.parsed.parties} timeline={bundle.timeline} compact />
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] font-data">
            {top.map(({ p, v }) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-sm" style={{ background: onDark(p.color) }} />
                <span style={{ color: readableOn(p.color, 'dark') }}>{p.shortName}</span>
                <span className="text-ink-muted">{(v * 100).toFixed(1)}</span>
              </span>
            ))}
            <span className="text-ink-dim ml-auto">{bundle.includedPolls} polls</span>
          </div>
        </>
      ) : (
        <div className="h-16 flex items-center justify-center text-[11px] font-data text-ink-dim text-center px-2">
          {loading || !load ? 'Loading polls…' : load.source === 'none' ? describeFailure(load.error) : 'No dated polls yet'}
        </div>
      )}
      <div className="mt-1.5"><SourceBadge load={load} loading={loading} onRetry={retry} /></div>
    </div>
  );
}

/** Self-contained variant for lists where the parent does not need the loaded data (Split Ticket cards). */
export function RaceTrendLoader({ def }: { def: RaceDef }) {
  const state = useRacePolling(def);
  return <RaceTrend def={def} state={state} />;
}
