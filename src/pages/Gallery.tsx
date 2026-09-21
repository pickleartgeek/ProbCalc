import { useMemo, useState } from 'react';
import { CardMosaic } from '../components/CardMosaic';
import { RaceCard } from '../components/races/RaceCard';
import { GALLERY_COUNTRIES } from '../lib/seedData';
import { GALLERY_RACES, type RaceGroup } from '../lib/races/registry';

const GROUP_OF: Record<string, RaceGroup> = { de: 'Germany', us: 'United States', bg: 'Bulgaria', sk: 'Slovakia', uk: 'United Kingdom' };

export function Gallery() {
  const [country, setCountry] = useState<string>(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('country') ?? 'all');
  const counts = useMemo(() => Object.fromEntries(GALLERY_COUNTRIES.map((c) => [c.id, GALLERY_RACES.filter((r) => r.group === GROUP_OF[c.id]).length])), []);
  const shown = GALLERY_RACES.filter((r) => country === 'all' || r.group === GROUP_OF[country]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Pre-made races</h1>
      <p className="text-ink-muted mb-6 max-w-3xl">
        Each race pulls its polling live from Wikipedia and draws its day-by-day BaseCalc right on the card. If Wikipedia can't be reached, the card falls back to a cached copy and offers a retry.
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

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shown.map((r) => <RaceCard key={r.id} def={r} />)}
      </div>
    </div>
  );
}
