import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { decodeRace } from '../lib/share';
import { useEngine } from '../state/store';

/** Landing page for a shared race link: decode, load into the engine, and hand off to Results. */
export function SharedRace() {
  const { payload = '' } = useParams();
  const { setRace } = useEngine();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    decodeRace(payload).then(
      ({ config, pollData }) => {
        if (cancelled) return;
        setRace(config, pollData, 'base');
        nav('/results', { replace: true });
      },
      (e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open this link'); }
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  if (!error) return <div className="max-w-xl mx-auto px-4 py-24 text-center text-ink-muted font-data text-sm" role="status">Opening shared race…</div>;
  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center">
      <div className="font-data text-xs tracking-widest text-red-call uppercase mb-3">Can't open this link</div>
      <h1 className="font-display font-800 text-3xl mb-2">{error}</h1>
      <p className="text-ink-muted text-sm mb-6">Ask whoever sent it to copy the link again — long links sometimes get cut off by chat apps.</p>
      <Link to="/build" className="px-4 py-2 rounded bg-gold text-void text-sm font-semibold">Build a race instead</Link>
    </div>
  );
}
