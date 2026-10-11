import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center">
      <div className="font-data text-xs tracking-widest text-gold uppercase mb-3">404 · no returns reporting</div>
      <h1 className="font-display font-900 text-5xl mb-3">Nothing on this desk</h1>
      <p className="text-ink-muted mb-8">That page doesn't exist. Try the gallery of pre-made races or build your own.</p>
      <div className="flex justify-center gap-3">
        <Link to="/gallery" className="px-4 py-2 rounded bg-gold text-void text-sm font-semibold">Browse the gallery</Link>
        <Link to="/build" className="px-4 py-2 rounded border border-hairline-bright text-sm hover:bg-panel">Build a race</Link>
      </div>
    </div>
  );
}
