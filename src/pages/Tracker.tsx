import { useMemo } from 'react';
import { TrendCard } from '../components/TrendCard';
import { listTrackedRaces } from '../lib/history';
import { TRACKED_RACES } from '../lib/seedData';
import { generateSyntheticTrend } from '../lib/demoTrends';

export function Tracker() {
  const yourRaces = useMemo(() => listTrackedRaces(), []);

  const demoRaces = useMemo(
    () =>
      TRACKED_RACES.map((r) => ({
        id: r.id,
        title: r.title,
        region: r.region,
        parties: r.parties,
        history: generateSyntheticTrend(r.id, r.parties),
      })),
    []
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Tracker</h1>
      <p className="text-ink-muted mb-8">
        Poll aggregate and win-probability trends over time. Flip any card between BaseCalc and
        ProbCalc.
      </p>

      {yourRaces.length > 0 && (
        <div className="mb-12">
          <h2 className="font-display font-700 text-xl mb-4">Your tracked races</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {yourRaces.map((r) => (
              <TrendCard key={r.id} title={r.meta.title} region={r.meta.region} parties={r.meta.parties} history={r.history} />
            ))}
          </div>
        </div>
      )}

      {yourRaces.length === 0 && (
        <div className="bg-panel border border-hairline rounded-lg p-6 mb-12 text-center">
          <p className="text-ink-muted">
            Nothing tracked yet. Build a race and hit <span className="text-cyan">📌 Log snapshot</span> on
            the Results page each time you want to add a data point — the trend builds up from there.
          </p>
        </div>
      )}

      <div>
        <h2 className="font-display font-700 text-xl mb-1">Example races</h2>
        <p className="text-ink-dim text-sm mb-4">
          Synthetic trends, seeded for demo purposes only — not real polling movement.
        </p>
        <div className="grid md:grid-cols-2 gap-5">
          {demoRaces.map((r) => (
            <TrendCard key={r.id} title={r.title} region={r.region} parties={r.parties} history={r.history} isDemo />
          ))}
        </div>
      </div>
    </div>
  );
}
