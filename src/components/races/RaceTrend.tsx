import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BaseTimelineChart } from '../BaseTimelineChart';
import { SourceBadge } from './SourceBadge';
import { useRacePolling } from '../../hooks/useRacePolling';
import { useEngine } from '../../state/store';
import { readableOn, onDark } from '../../lib/partyColors';
import { configForRace, type RaceDef } from '../../lib/races/registry';
import { describeFailure, hasUsablePolls } from '../../lib/races/loader';

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

/**
 * The trend chart plus the same BaseCalc / ProbCalc / Election night buttons Gallery's RaceCard has — self-contained
 * (one useRacePolling call owns both), so any Split Ticket list can drop this in and get the exact same one-click
 * entry into the rest of the app that a Gallery card gives.
 */
export function RaceCardActions({ def, onNavigate }: { def: RaceDef; onNavigate?: () => void }) {
  const nav = useNavigate();
  const { setRace } = useEngine();
  const state = useRacePolling(def);
  const ready = !!state.load && hasUsablePolls(state.load.parsed, def.cutoffDate);

  const open = (view: 'base' | 'prob', to: string) => {
    if (!state.load || !ready) return;
    setRace(configForRace(def, state.load.parsed), state.load.parsed, view);
    onNavigate?.();
    nav(to);
  };
  const btn = 'px-2.5 py-1 rounded text-xs font-display font-700 border disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <>
      <RaceTrend def={def} state={state} />
      <div className="flex flex-wrap gap-1.5 mt-3" onClick={(e) => e.stopPropagation()}>
        <button disabled={!ready} onClick={() => open('base', '/results')} className={`${btn} border-cyan/50 text-cyan hover:bg-cyan/10`}>BaseCalc</button>
        <button disabled={!ready} onClick={() => open('prob', '/results')} className={`${btn} border-gold/50 text-gold hover:bg-gold/10`}>ProbCalc</button>
        <button disabled={!ready} onClick={() => open('base', '/night')} className={`${btn} border-hairline-bright text-ink-muted hover:text-ink`}>Election night</button>
      </div>
    </>
  );
}
