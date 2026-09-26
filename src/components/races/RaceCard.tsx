import { RaceCardActions } from './RaceTrend';
import type { RaceDef } from '../../lib/races/registry';

/** Gallery card: title, embedded BaseCalc trajectory, and one-click entry into BaseCalc / ProbCalc / Election Night. */
export function RaceCard({ def }: { def: RaceDef }) {
  return (
    <div className="bg-panel border border-hairline rounded-lg p-4 flex flex-col" data-testid={`race-card-${def.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display font-700 text-base leading-tight">{def.title}</div>
          <div className="text-ink-dim text-[11px] font-data mt-0.5">{def.electionDate}{def.dateAssumed ? ' (assumed)' : ''} · {def.votingSystem}</div>
        </div>
      </div>
      <RaceCardActions def={def} />
    </div>
  );
}
