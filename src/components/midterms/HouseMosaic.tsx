import { useMemo } from 'react';
import type { HouseSeat } from '../../lib/midterms/types';
import { STATE_GRID } from '../../lib/midterms/stateGrid';
import { RATING_COLOR } from '../../lib/midterms/ratings';

interface Props {
  seats: HouseSeat[];
}

export function HouseMosaic({ seats }: Props) {
  const grouped = useMemo(() => {
    const byState = new Map<string, HouseSeat[]>();
    for (const s of seats) {
      if (!byState.has(s.stateAbbr)) byState.set(s.stateAbbr, []);
      byState.get(s.stateAbbr)!.push(s);
    }
    // Order states in roughly geographic reading order using the tilegram coords.
    const order = Object.entries(STATE_GRID).sort(([, a], [, b]) => a[0] - b[0] || a[1] - b[1]);
    return order
      .map(([abbr]) => ({ abbr, seats: byState.get(abbr) ?? [] }))
      .filter((g) => g.seats.length > 0);
  }, [seats]);

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2">
      {grouped.map(({ abbr, seats: stateSeats }) => (
        <div key={abbr} className="flex flex-col items-center gap-1">
          <div className="flex flex-wrap gap-[2px] max-w-[110px]">
            {stateSeats.map((s) => (
              <div
                key={s.id}
                title={`${s.stateName} ${s.district === 0 ? 'At-large' : `District ${s.district}`}`}
                className="w-[9px] h-[9px] rounded-[1px]"
                style={{ background: RATING_COLOR[s.rating] }}
              />
            ))}
          </div>
          <span className="font-data text-[8px] text-ink-dim">{abbr}</span>
        </div>
      ))}
    </div>
  );
}
