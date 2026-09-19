import { useMemo } from 'react';
import { buildTileColors } from '../lib/mosaicUtil';

interface Props {
  colors: string[];
  seedKey: string;
  cols?: number;
  rows?: number;
}

/**
 * A faded decorative mosaic used as a card background — evokes "a projected map"
 * without claiming to be one. Not tied to any real vote share; purely aesthetic.
 */
export function CardMosaic({ colors, seedKey, cols = 8, rows = 5 }: Props) {
  const tiles = useMemo(() => buildTileColors(colors, cols * rows, seedKey), [colors, seedKey, cols, rows]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="grid gap-[2px] w-full h-full opacity-[0.22]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {tiles.map((c, i) => (
          <div key={i} style={{ background: c }} />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/70 to-panel/20" />
    </div>
  );
}
