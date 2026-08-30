import { TRACKED_RACES } from '../lib/seedData';

const STATUS_LABEL: Record<string, string> = {
  polling: 'POLLING',
  projected: 'PROJECTED',
  called: 'CALLED',
};

function TickerItem({ race }: { race: (typeof TRACKED_RACES)[number] }) {
  return (
    <div className="flex items-center gap-2 px-6 whitespace-nowrap">
      <span
        className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-sm font-data ${
          race.status === 'called' ? 'bg-red-call/20 text-red-call' : 'bg-gold/15 text-gold'
        }`}
      >
        {STATUS_LABEL[race.status]}
      </span>
      <span className="text-ink font-medium text-sm">{race.title}</span>
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: race.leaderColor }} />
      <span className="text-ink-muted text-sm">{race.leader}</span>
      <span className="font-data text-sm text-cyan">{race.leadPct}</span>
    </div>
  );
}

export function RaceTicker() {
  const doubled = [...TRACKED_RACES, ...TRACKED_RACES];
  return (
    <div className="w-full overflow-hidden border-y border-hairline bg-panel/60 py-2">
      <div className="flex ticker-track w-max">
        {doubled.map((r, i) => (
          <TickerItem key={`${r.id}-${i}`} race={r} />
        ))}
      </div>
    </div>
  );
}
