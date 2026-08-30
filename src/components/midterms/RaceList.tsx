import { useMemo, useState } from 'react';
import { RatingBadge } from './RatingBadge';
import { RATING_ORDER, type Rating } from '../../lib/midterms/ratings';
import type { SenateRace, GovernorRace } from '../../lib/midterms/types';

type Race = SenateRace | GovernorRace;

const FILTERS: { key: 'all' | 'competitive' | 'D' | 'R'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'competitive', label: 'Competitive' },
  { key: 'D', label: 'D-held' },
  { key: 'R', label: 'R-held' },
];

export function RaceList({ races, selected, onSelect }: { races: Race[]; selected?: string | null; onSelect?: (abbr: string) => void }) {
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
          <button
            key={r.id}
            onClick={() => onSelect?.(r.stateAbbr)}
            className={`text-left bg-panel border rounded-lg px-4 py-3 transition-colors hover:border-hairline-bright ${
              selected === r.stateAbbr ? 'border-gold' : 'border-hairline'
            }`}
          >
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
          </button>
        ))}
      </div>
    </div>
  );
}
