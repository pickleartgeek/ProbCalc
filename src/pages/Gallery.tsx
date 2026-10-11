import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CardMosaic } from '../components/CardMosaic';
import { RaceCard } from '../components/races/RaceCard';
import { GALLERY_COUNTRIES } from '../lib/seedData';
import { allRaceDefs, type RaceDef } from '../lib/races/registry';

const GROUP_OF = Object.fromEntries(GALLERY_COUNTRIES.map((c) => [c.id, c.group]));

// Every pre-built race: the hand-picked marquee ones plus every 2026 Senate and governor race Split Ticket tracks.
// (allRaceDefs de-dupes, so the four featured Senate races appear once, first.)
const ALL_RACES = allRaceDefs();

type UsKind = 'all' | 'featured' | 'senate' | 'governor';
const US_KINDS: { id: UsKind; label: string; match: (r: RaceDef) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'featured', label: 'Featured', match: (r) => r.kind === 'gallery' },
  { id: 'senate', label: 'Senate', match: (r) => r.kind === 'senate' || (r.kind === 'gallery' && r.id.startsWith('sen-')) },
  { id: 'governor', label: 'Governor', match: (r) => r.kind === 'governor' },
];

/** How many cards a section shows before it's collapsed behind "Show all N" — past this, a flat grid stops being
 *  scannable and starts being a wall. Featured sections (a handful of marquee races) never hit it. */
const COLLAPSE_AT = 9;

function matchesQuery(r: RaceDef, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return r.title.toLowerCase().includes(needle) || r.region.toLowerCase().includes(needle);
}

/** One labeled group of cards, collapsed to a preview once it's long enough to overwhelm the page. Search results
 *  skip this entirely (see Gallery) — grouping helps browsing, but once someone's typed a query they want the
 *  flat list of matches, not more sections to open. */
function Section({ label, races }: { label: string; races: RaceDef[] }) {
  const [expanded, setExpanded] = useState(false);
  if (races.length === 0) return null;
  const overflow = races.length > COLLAPSE_AT;
  const visible = overflow && !expanded ? races.slice(0, COLLAPSE_AT) : races;
  return (
    <div className="mb-8">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="font-display font-700 text-sm text-ink-dim uppercase tracking-wide">{label}</h2>
        <span className="font-data text-ink-dim text-xs">{races.length}</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((r) => <RaceCard key={r.id} def={r} />)}
      </div>
      {overflow && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs font-display font-700 text-cyan hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${races.length}`}
        </button>
      )}
    </div>
  );
}

export function Gallery() {
  // Filters live in the URL (#/gallery?country=us&kind=senate&q=georgia) so a view can be linked and survives back/forward.
  const [params, setParams] = useSearchParams();
  const country = params.get('country') ?? 'all';
  const urlKind = params.get('kind');
  const usKind: UsKind = US_KINDS.some((k) => k.id === urlKind) ? (urlKind as UsKind) : 'all';
  const urlQuery = params.get('q') ?? '';
  const setParam = (key: string, value: string | null) =>
    setParams((prev) => { const next = new URLSearchParams(prev); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  const setCountry = (id: string) => setParams((prev) => { const next = new URLSearchParams(prev); if (id === 'all') next.delete('country'); else next.set('country', id); next.delete('kind'); return next; }, { replace: true });
  const setUsKind = (k: UsKind) => setParam('kind', k === 'all' ? null : k);

  // Typing is held in local state (round-tripping every keystroke through the router drops characters); the URL is a one-way mirror.
  const [query, setQuery] = useState(urlQuery);
  useEffect(() => { if (query !== urlQuery) setParam('q', query || null); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && t && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const counts = useMemo(() => Object.fromEntries(GALLERY_COUNTRIES.map((c) => [c.id, ALL_RACES.filter((r) => r.group === GROUP_OF[c.id]).length])), []);
  const inCountry = ALL_RACES.filter((r) => country === 'all' || r.group === GROUP_OF[country]);
  const kindMatch = US_KINDS.find((k) => k.id === usKind)!.match;
  const inScope = country === 'us' ? inCountry.filter(kindMatch) : inCountry;
  const searching = query.trim().length > 0;
  const results = useMemo(() => inScope.filter((r) => matchesQuery(r, query)), [inScope, query]);

  // Grouped-by-kind only pays for itself for the US's "All" view (71 cards in one pile otherwise); every other
  // scope is already small enough, or already filtered to one kind, to show as a single grid.
  const grouped = !searching && country === 'us' && usKind === 'all';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Pre-made races</h1>
      <p className="text-ink-muted mb-6 max-w-3xl">
        Every 2026 Senate and governor race from Split Ticket sits here alongside the international elections. Each race pulls its polling live from Wikipedia and draws its day-by-day BaseCalc right on the card. If Wikipedia can't be reached, the card falls back to a cached copy and offers a retry.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {GALLERY_COUNTRIES.map((c) => (
          <button key={c.id} onClick={() => setCountry(country === c.id ? 'all' : c.id)}
            className={`relative text-left p-4 rounded-lg border overflow-hidden transition-colors ${country === c.id ? 'border-gold' : 'border-hairline hover:border-hairline-bright'} bg-panel`}>
            <CardMosaic colors={c.colors} seedKey={c.id} />
            <div className="relative">
              <div className="text-2xl mb-1">{c.flagEmoji}</div>
              <div className="font-display font-700">{c.name}</div>
              <div className="text-ink-dim text-xs font-data mt-0.5">{counts[c.id]} race{counts[c.id] !== 1 ? 's' : ''} · {c.system}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a race or state…  ( / )"
            aria-label="Search races"
            className="w-full bg-panel border border-hairline rounded-lg pl-3 pr-8 py-2 text-sm placeholder:text-ink-dim focus:outline-none focus:border-gold"
          />
          {searching && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink">✕</button>
          )}
        </div>

        {country === 'us' && !searching && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter US races">
            {US_KINDS.map((k) => {
              const n = inCountry.filter(k.match).length;
              return (
                <button key={k.id} onClick={() => setUsKind(k.id)}
                  className={`px-3 py-1 rounded-full text-xs font-display font-700 border transition-colors ${usKind === k.id ? 'border-gold text-gold bg-gold/10' : 'border-hairline text-ink-muted hover:border-hairline-bright'}`}>
                  {k.label} <span className="font-data text-ink-dim">{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {searching ? (
        results.length === 0 ? (
          <p className="text-ink-dim text-sm py-8 text-center">No race matches "{query}" in {country === 'all' ? 'any tracked country' : GALLERY_COUNTRIES.find((c) => c.id === country)?.name}.</p>
        ) : (
          <>
            <p className="text-ink-dim text-xs font-data mb-3">{results.length} match{results.length !== 1 ? 'es' : ''}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((r) => <RaceCard key={r.id} def={r} />)}
            </div>
          </>
        )
      ) : grouped ? (
        <>
          <Section label="Featured" races={inScope.filter(US_KINDS[1].match)} />
          <Section label="Senate" races={inScope.filter((r) => r.kind === 'senate')} />
          <Section label="Governor" races={inScope.filter((r) => r.kind === 'governor')} />
        </>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((r) => <RaceCard key={r.id} def={r} />)}
        </div>
      )}
    </div>
  );
}
