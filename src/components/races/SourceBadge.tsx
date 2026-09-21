import type { RaceLoad } from '../../lib/races/loader';
import { describeFailure } from '../../lib/races/loader';

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 2) return 'just now';
  if (m < 90) return `${m} min ago`;
  if (m < 60 * 36) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Where this card's data came from, and — when Wikipedia could not be reached — why, with a Retry button. */
export function SourceBadge({ load, loading, onRetry }: { load: RaceLoad | null; loading: boolean; onRetry: () => void }) {
  if (!load) return <span className="text-[10px] font-data text-ink-dim">{loading ? 'Loading…' : 'Waiting…'}</span>;
  const failed = load.source === 'fallback' || load.source === 'seed' || load.source === 'none';
  const tone = load.source === 'live' || load.source === 'browser-cache' ? 'bg-cyan/15 text-cyan' : load.source === 'seed' ? 'bg-gold/15 text-gold' : 'bg-panel-raised text-ink-muted';
  const label =
    load.source === 'live' ? 'Live · Wikipedia'
    : load.source === 'browser-cache' ? `Wikipedia · ${ago(load.fetchedAt)}`
    : load.source === 'fallback' ? `Cached copy · ${ago(load.fetchedAt)}`
    : load.source === 'seed' ? 'Illustrative seed'
    : 'No data';
  const title = [
    load.pageTitle && `${load.pageTitle}${load.sectionTitle ? ' › ' + load.sectionTitle : ''}`,
    load.note,
    load.source === 'seed' && 'Placeholder numbers shipped with the app; replaced by real Wikipedia data on the next scheduled refresh.',
    failed && `Live fetch failed: ${describeFailure(load.error)}`,
  ].filter(Boolean).join('\n');
  return (
    <span className="inline-flex items-center gap-1.5">
      <span title={title} className={`text-[10px] font-data uppercase px-1.5 py-0.5 rounded ${tone}`}>{label}</span>
      {failed && (
        <button onClick={(e) => { e.stopPropagation(); onRetry(); }} disabled={loading} className="text-[10px] font-data text-cyan hover:underline disabled:opacity-40">
          {loading ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </span>
  );
}
