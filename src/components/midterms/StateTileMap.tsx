import { STATE_GRID, GRID_ROWS, GRID_COLS } from '../../lib/midterms/stateGrid';
import { RATING_COLOR, type Rating } from '../../lib/midterms/ratings';

interface Props {
  ratings: Record<string, Rating>; // stateAbbr -> rating, only for states with a race
  onSelect?: (abbr: string) => void;
  selected?: string | null;
}

export function StateTileMap({ ratings, onSelect, selected }: Props) {
  return (
    <div
      className="grid gap-[3px] w-full"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
        gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
        aspectRatio: `${GRID_COLS} / ${GRID_ROWS}`,
      }}
    >
      {Object.entries(STATE_GRID).map(([abbr, [row, col]]) => {
        const rating = ratings[abbr];
        const hasRace = !!rating;
        const color = hasRace ? RATING_COLOR[rating] : '#1a2233';
        const isSelected = selected === abbr;
        return (
          <button
            key={abbr}
            onClick={() => hasRace && onSelect?.(abbr)}
            disabled={!hasRace}
            title={abbr}
            className={`relative rounded-[3px] flex items-center justify-center font-data text-[9px] sm:text-[10px] font-semibold transition-all ${
              hasRace ? 'cursor-pointer hover:brightness-110' : 'cursor-default'
            }`}
            style={{
              gridRow: row + 1,
              gridColumn: col + 1,
              background: hasRace ? color : 'transparent',
              border: hasRace
                ? isSelected
                  ? '2px solid var(--color-gold)'
                  : '1px solid rgba(0,0,0,0.25)'
                : '1px dashed var(--color-hairline)',
              color: hasRace ? '#0a0e17' : 'var(--color-ink-dim)',
              opacity: hasRace ? 1 : 0.5,
            }}
          >
            {abbr}
          </button>
        );
      })}
    </div>
  );
}
