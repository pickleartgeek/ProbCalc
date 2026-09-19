import { RATING_COLOR, RATING_LABEL, type Rating } from '../../lib/midterms/ratings';

export function RatingBadge({ rating, size = 'sm' }: { rating: Rating; size?: 'sm' | 'md' }) {
  const color = RATING_COLOR[rating];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-data font-medium ${
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      }`}
      style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {RATING_LABEL[rating]}
    </span>
  );
}
