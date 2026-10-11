import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useEngine } from '../state/store';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/build', label: 'Build' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/world', label: 'World' },
  { to: '/tracker', label: 'Tracker' },
  { to: '/night', label: 'Election Night' },
  { to: '/midterms', label: 'Split Ticket' },
  { to: '/precinct-lab', label: 'Precinct Lab' },
];

type Item = { to: string; label: string; end?: boolean; title?: string };

export function NavBar() {
  const { config } = useEngine();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // the loaded race gets its own tab, right after the places you start one from
  const items: Item[] = config ? [...links.slice(0, 3), { to: '/results', label: 'Results', title: `Current race: ${config.title}` }, ...links.slice(3)] : links;

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const linkClass = (isActive: boolean, block: boolean) =>
    `${block ? 'block px-3 py-2.5' : 'px-3 py-1.5'} rounded text-sm font-medium whitespace-nowrap transition-colors ${
      isActive ? 'bg-panel-raised text-gold' : 'text-ink-muted hover:text-ink hover:bg-panel'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-void/95 backdrop-blur border-b border-hairline">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
          <span className="relative flex items-center justify-center w-6 h-6 rounded-[4px] border border-gold/50 bg-gold/5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-call pulse-live" />
          </span>
          <span className="font-wordmark font-semibold text-xl tracking-tight text-ink">
            PROB<span className="text-gold">CALC</span>
          </span>
          <span className="font-data text-[9px] text-ink-dim tracking-widest border border-hairline-bright rounded px-1.5 py-0.5 hidden sm:inline">
            ENGINE
          </span>
        </NavLink>

        {/* wide screens: every link inline */}
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
          {items.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} title={l.title} className={({ isActive }) => linkClass(isActive, false)}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        {/* narrower screens: one menu button instead of a sideways-scrolling strip nobody knows to scroll */}
        <button
          type="button"
          className="lg:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded border border-hairline-bright text-sm text-ink-muted hover:text-ink hover:bg-panel"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden className="flex flex-col gap-[3px]">
            <span className={`block w-4 h-0.5 bg-current transition-transform ${open ? 'translate-y-[5px] rotate-45' : ''}`} />
            <span className={`block w-4 h-0.5 bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block w-4 h-0.5 bg-current transition-transform ${open ? '-translate-y-[5px] -rotate-45' : ''}`} />
          </span>
          Menu
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="lg:hidden border-t border-hairline bg-void">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
            {items.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} title={l.title} className={({ isActive }) => linkClass(isActive, true)}>
                {l.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
