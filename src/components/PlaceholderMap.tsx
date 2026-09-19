import { useMemo } from 'react';
import type { Party } from '../lib/types';
import { mulberry32, seedFrom } from '../lib/mosaicUtil';

interface Props {
  parties: Party[];
  shares: Record<string, number>; // partyId -> 0-1, sums to ~1
  mode: 'base' | 'prob';
  cols?: number;
  rows?: number;
  compact?: boolean; // hides the caption, for use inside smaller embeds like the infobox
}

export function PlaceholderMap({ parties, shares, mode, cols = 14, rows = 9, compact = false }: Props) {
  const total = cols * rows;

  const tileParties = useMemo(() => {
    const seedKey = mode + JSON.stringify(shares);
    const rand = mulberry32(seedFrom(seedKey));

    // Largest-remainder allocation of tiles proportional to share
    const raw = parties.map((p) => ({ id: p.id, exact: (shares[p.id] ?? 0) * total }));
    const base = raw.map((r) => ({ id: r.id, count: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
    let assigned = base.reduce((a, b) => a + b.count, 0);
    const byRemainder = [...base].sort((a, b) => b.rem - a.rem);
    let i = 0;
    while (assigned < total && byRemainder.length > 0) {
      byRemainder[i % byRemainder.length].count += 1;
      assigned++;
      i++;
    }
    const pool: string[] = [];
    base.forEach((b) => {
      for (let k = 0; k < b.count; k++) pool.push(b.id);
    });
    while (pool.length < total) pool.push(parties[0]?.id ?? 'unassigned');

    // Fisher-Yates shuffle, seeded
    for (let j = pool.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [pool[j], pool[k]] = [pool[k], pool[j]];
    }
    return pool.slice(0, total);
  }, [parties, shares, mode, total]);

  const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));

  return (
    <div>
      <div
        className="grid gap-[3px] w-full aspect-[14/9]"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {tileParties.map((pid, idx) => {
          const p = partyById[pid];
          return (
            <div
              key={idx}
              className="rounded-[2px] transition-colors duration-500"
              style={{ background: p?.color ?? '#333' }}
              title={p?.name}
            />
          );
        })}
      </div>
      {!compact && (
        <p className="text-ink-dim text-[11px] font-data mt-2 text-center">
          abstract district mosaic — placeholder until real geography is wired in · {total} districts
        </p>
      )}
    </div>
  );
}
