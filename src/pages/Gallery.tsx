import { useMemo, useState } from 'react';
import { CardMosaic } from '../components/CardMosaic';
import { RaceCard } from '../components/races/RaceCard';
import { GALLERY_COUNTRIES } from '../lib/seedData';
import { allRaceDefs, type RaceDef, type RaceGroup } from '../lib/races/registry';

const GROUP_OF: Record<string, RaceGroup> = { de: 'Germany', us: 'United States', bg: 'Bulgaria', sk: 'Slovakia', uk: 'United Kingdom' };

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

export function Gallery() {
  const [country, setCountry] = useState<string>(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('country') ?? 'all');
  const [usKind, setUsKind] = useState<UsKind>('all');
  const counts = useMemo(() => Object.fromEntries(GALLERY_COUNTRIES.map((c) => [c.id, ALL_RACES.filter((r) => r.group === GROUP_OF[c.id]).length])), []);
  const inCountry = ALL_RACES.filter((r) => country === 'all' || r.group === GROUP_OF[country]);
  const kindMatch = US_KINDS.find((k) => k.id === usKind)!.match;
  const shown = country === 'us' ? inCountry.filter(kindMatch) : inCountry;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Pre-made races</h1>
      <p className="text-ink-muted mb-6 max-w-3xl">
        Every 2026 Senate and governor race from Split Ticket sits here alongside the international elections. Each race pulls its polling live from Wikipedia and draws its day-by-day BaseCalc right on the card. If Wikipedia can't be reached, the card falls back to a cached copy and offers a retry.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
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

      {country === 'us' && (
        <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Filter US races">
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

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shown.map((r) => <RaceCard key={r.id} def={r} />)}
      </div>
    </div>
  );
}
