import { useMemo, useState } from 'react';
import { RatingBadge } from './RatingBadge';
import { RATING_ORDER, type Rating } from '../../lib/midterms/ratings';
import { getRaceMarginHistory } from '../../lib/midterms/gcbHistory';
import type { SenateRace, GovernorRace } from '../../lib/midterms/types';
import { RaceCardActions } from '../races/RaceTrend';
import { midtermRaceDef } from '../../lib/races/registry';

type Race = SenateRace | GovernorRace;

const FILTERS: { key: 'all' | 'competitive' | 'D' | 'R'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'competitive', label: 'Competitive' },
  { key: 'D', label: 'D-held' },
  { key: 'R', label: 'R-held' },
];

function pviLabel(margin: number): string {
  if (Math.abs(margin) < 0.05) return 'EVEN';
  return margin > 0 ? `R+${margin.toFixed(1)}` : `D+${Math.abs(margin).toFixed(1)}`;
}

/** Faint background trace of this race's margin as you've moved the GCB slider this session (see gcbHistory.ts) — not historical polling, just this session's own exploration. Renders nothing until there are at least two recorded readings. */
function MarginSparkline({ raceId }: { raceId: string }) {
  const points = useMemo(() => getRaceMarginHistory(raceId), [raceId]);
  if (points.length < 2) return null;
  const margins = points.map((p) => p.margin);
  const min = Math.min(...margins, -1);
  const max = Math.max(...margins, 1);
  const range = Math.max(0.5, max - min);
  const w = 100;
  const h = 100;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.margin - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = margins[margins.length - 1];
  const stroke = last >= 0 ? '#ea4b4b' : '#3b82f6';
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full opacity-[0.14] pointer-events-none"
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function RaceList({
  races,
  selected,
  onSelect,
  pvi,
}: {
  races: Race[];
  selected?: string | null;
  onSelect?: (abbr: string) => void;
  /** stateAbbr -> real 2024 presidential margin (points, +R), from precinctAnchor.ts. */
  pvi?: Record<string, number>;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  const filtered = useMemo(() => {
    let list = [...races];
    if (filter === 'competitive') {
      const comp: Rating[] = ['TiltD', 'Tossup', 'TiltR', 'LeanD', 'LeanR'];
      list = list.filter((r) => comp.includes(r.rating));
    } else if (filter === 'D' || filter === 'R') {
      list = list.filter((r) => r.incumbentParty === filter);
    }
    return list.sort((a, b) => RATING_ORDER.indexOf(a.rating) - RATING_ORDER.indexOf(b.rating));
  }, [races, filter]);

  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-panel-raised text-gold' : 'text-ink-muted hover:text-ink hover:bg-panel'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-ink-dim text-xs self-center font-data">{filtered.length} races</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        {filtered.map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(r.stateAbbr); } }}
            onClick={() => onSelect?.(r.stateAbbr)}
            className={`relative overflow-hidden text-left cursor-pointer bg-panel border rounded-lg px-4 py-3 transition-colors hover:border-hairline-bright ${
              selected === r.stateAbbr ? 'border-gold' : 'border-hairline'
            }`}
          >
            <MarginSparkline raceId={r.id} />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-display font-700 text-base">{r.stateName}</span>
                <RatingBadge rating={r.rating} />
              </div>
              <div className="text-ink-muted text-xs">
                {r.open ? (
                  <span>Open seat &middot; {r.incumbentParty}-held</span>
                ) : (
                  <span>{r.incumbentName} ({r.incumbentParty})</span>
                )}
                {'special' in r && r.special && <span className="text-cyan"> &middot; special</span>}
              </div>
              {pvi && pvi[r.stateAbbr] != null && (
                <div className="text-ink-dim text-[11px] font-data mt-1">
                  2024 pres. margin: <span className="text-ink-muted">{pviLabel(pvi[r.stateAbbr])}</span>
                </div>
              )}
              {r.computedMargin !== undefined && (
                <div className="text-ink-dim text-[11px] font-data mt-0.5">
                  Model margin: <span className="text-ink-muted">{pviLabel(r.computedMargin)}</span>
                </div>
              )}
              {midtermRaceDef(r.id) && <RaceCardActions def={midtermRaceDef(r.id)!} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
