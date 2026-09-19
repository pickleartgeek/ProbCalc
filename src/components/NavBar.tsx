import { NavLink } from 'react-router-dom';

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

export function NavBar() {
  return (
    <header className="sticky top-0 z-40 bg-void/95 backdrop-blur border-b border-hairline">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
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
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive ? 'bg-panel-raised text-gold' : 'text-ink-muted hover:text-ink hover:bg-panel'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
