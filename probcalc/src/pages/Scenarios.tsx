import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useEngine } from '../state/store';
import type { SimulationOutcome } from '../lib/types';

const MARGIN_TYPES: SimulationOutcome['marginType'][] = ['Plurality', 'Majority', 'Supermajority'];
const PAGE_SIZE = 30;

export function Scenarios() {
  const { config, outcomes, baseCalcResults } = useEngine();
  const [winnerFilter, setWinnerFilter] = useState<string | 'all'>('all');
  const [marginFilter, setMarginFilter] = useState<Set<string>>(new Set(MARGIN_TYPES));
  const [upsetsOnly, setUpsetsOnly] = useState(false);
  const [page, setPage] = useState(0);

  if (!config || !outcomes || !baseCalcResults) {
    return <Navigate to="/results" replace />;
  }

  const favoriteId = [...baseCalcResults].sort((a, b) => b.percentage - a.percentage)[0]?.partyId;
  const partyById = Object.fromEntries(config.parties.map((p) => [p.id, p]));

  const filtered = useMemo(() => {
    return outcomes.filter((o) => {
      if (winnerFilter !== 'all' && o.winnerId !== winnerFilter) return false;
      if (!marginFilter.has(o.marginType)) return false;
      if (upsetsOnly && o.winnerId === favoriteId) return false;
      return true;
    });
  }, [outcomes, winnerFilter, marginFilter, upsetsOnly, favoriteId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function toggleMargin(m: string) {
    setPage(0);
    setMarginFilter((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Scenario browser</h1>
      <p className="text-ink-muted mb-8">
        {outcomes.length.toLocaleString()} simulated outcomes for {config.title}. Sift through individual runs.
      </p>

      <div className="bg-panel border border-hairline rounded-lg p-5 mb-6">
        <div className="grid sm:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs text-ink-dim font-data uppercase mb-2">Winner</label>
            <select
              value={winnerFilter}
              onChange={(e) => {
                setPage(0);
                setWinnerFilter(e.target.value);
              }}
              className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm outline-none"
            >
              <option value="all">Any party</option>
              {config.parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-dim font-data uppercase mb-2">Margin type</label>
            <div className="flex flex-wrap gap-2">
              {MARGIN_TYPES.map((m) => (
                <button
                  key={m}
                  onClick={() => toggleMargin(m)}
                  className={`px-2.5 py-1 rounded text-xs font-data border transition ${
                    marginFilter.has(m)
                      ? 'bg-cyan/20 border-cyan text-cyan'
                      : 'border-hairline text-ink-dim'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={upsetsOnly}
                onChange={(e) => {
                  setPage(0);
                  setUpsetsOnly(e.target.checked);
                }}
                className="accent-gold"
              />
              Upsets only (favorite doesn't win)
            </label>
          </div>
        </div>
        <p className="text-ink-dim text-xs font-data mt-3">
          {filtered.length.toLocaleString()} scenarios match these filters
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {pageItems.map((o) => {
          const winner = partyById[o.winnerId];
          const isUpset = o.winnerId !== favoriteId;
          return (
            <div
              key={o.index}
              className="bg-panel border rounded-lg p-4 relative overflow-hidden"
              style={{ borderColor: isUpset ? '#8A6C1F' : '#262f45' }}
            >
              {isUpset && (
                <span className="absolute top-2 right-2 text-[10px] font-data text-gold uppercase tracking-wide">
                  upset
                </span>
              )}
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-sm" style={{ background: winner?.color }} />
                <span className="font-display font-700">{winner?.name}</span>
                <span className="text-ink-dim text-xs font-data">— {o.marginType}</span>
              </div>
              <div className="space-y-1">
                {config.parties
                  .map((p) => ({ p, v: o.values[p.id] ?? 0 }))
                  .sort((a, b) => b.v - a.v)
                  .slice(0, 4)
                  .map(({ p, v }) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted">{p.shortName}</span>
                      <span className="font-data">{(v * 100).toFixed(1)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-ink-dim text-center py-12">No scenarios match these filters.</p>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 border border-hairline rounded text-sm disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="font-data text-sm text-ink-muted">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 border border-hairline rounded text-sm disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
