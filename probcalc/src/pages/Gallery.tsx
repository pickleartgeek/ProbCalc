import { useState } from 'react';
import { CardMosaic } from '../components/CardMosaic';
import { GALLERY_COUNTRIES } from '../lib/seedData';

export function Gallery() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Pre-made races</h1>
      <p className="text-ink-muted mb-8">
        Jump into a ready-made country dataset instead of pasting your own polling.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GALLERY_COUNTRIES.map((c) => {
          const isOpen = expanded === c.id;
          return (
            <div
              key={c.id}
              className={`bg-panel border rounded-lg overflow-hidden transition-colors ${
                isOpen ? 'border-hairline-bright' : 'border-hairline'
              }`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : c.id)}
                className="relative w-full text-left p-5 hover:brightness-110 transition overflow-hidden"
              >
                <CardMosaic colors={c.colors} seedKey={c.id} />
                <div className="relative">
                  <div className="text-3xl mb-2">{c.flagEmoji}</div>
                  <div className="font-display font-700 text-lg">{c.name}</div>
                  <div className="text-ink-dim text-xs font-data mt-1">
                    {c.races} race{c.races !== 1 ? 's' : ''} · {c.system}
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-hairline p-4 bg-panel-raised/50 text-sm text-ink-muted">
                  Sample datasets for {c.name} aren't loaded into this build yet — for now, head to{' '}
                  <span className="text-cyan">Build</span> and paste a {c.name} polling table directly from
                  Wikipedia. Pre-baked scenario packs are a good next thing to wire in here.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
