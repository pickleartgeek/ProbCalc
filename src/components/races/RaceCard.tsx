import { useNavigate } from 'react-router-dom';
import { RaceTrend } from './RaceTrend';
import { useRacePolling } from '../../hooks/useRacePolling';
import { useEngine } from '../../state/store';
import { configForRace, type RaceDef } from '../../lib/races/registry';
import { hasUsablePolls } from '../../lib/races/loader';

/** Gallery card: title, embedded BaseCalc trajectory, and one-click entry into BaseCalc / ProbCalc / Election Night. */
export function RaceCard({ def }: { def: RaceDef }) {
  const nav = useNavigate();
  const { setRace } = useEngine();
  const data = useRacePolling(def);
  const ready = !!data.load && hasUsablePolls(data.load.parsed);

  const open = (view: 'base' | 'prob', to: string) => {
    if (!data.load || !ready) return;
    setRace(configForRace(def, data.load.parsed), data.load.parsed, view);
    nav(to);
  };
  const btn = 'px-2.5 py-1 rounded text-xs font-display font-700 border disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="bg-panel border border-hairline rounded-lg p-4 flex flex-col" data-testid={`race-card-${def.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display font-700 text-base leading-tight">{def.title}</div>
          <div className="text-ink-dim text-[11px] font-data mt-0.5">{def.electionDate}{def.dateAssumed ? ' (assumed)' : ''} · {def.votingSystem}</div>
        </div>
      </div>
      <RaceTrend def={def} state={data} />
      <div className="flex flex-wrap gap-1.5 mt-3">
        <button disabled={!ready} onClick={() => open('base', '/results')} className={`${btn} border-cyan/50 text-cyan hover:bg-cyan/10`}>BaseCalc</button>
        <button disabled={!ready} onClick={() => open('prob', '/results')} className={`${btn} border-gold/50 text-gold hover:bg-gold/10`}>ProbCalc</button>
        <button disabled={!ready} onClick={() => open('base', '/night')} className={`${btn} border-hairline-bright text-ink-muted hover:text-ink`}>Election night</button>
      </div>
    </div>
  );
}
