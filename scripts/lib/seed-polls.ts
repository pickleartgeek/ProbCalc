import { mulberry32, seedFrom } from '../../src/lib/mosaicUtil';
import { slugify } from '../../src/lib/partyColors';
import { applyPartyColors, US_DEM, US_REP } from '../../src/lib/partyRegistry';
import { GROUP_COUNTRY } from '../../src/lib/races/registry';
import type { Party, PollRow } from '../../src/lib/types';
import type { FallbackFile } from '../../src/lib/races/loader';
import type { RaceDef } from '../../src/lib/races/registry';
import { SENATE_RACES } from '../../src/lib/midterms/senateData';

// ILLUSTRATIVE placeholders shipped so a card is never empty before the first scheduled refresh has run.
// Every file produced here carries `synthetic: true`, every poll is named "Synthetic poll #n", and the UI labels
// the card "Illustrative seed" — none of this is presented as real polling. It is replaced by real Wikipedia data
// the first time scripts/refresh-races.mts succeeds.

interface Spec { parties: { name: string; share: number; affiliation?: 'D' | 'R' }[]; from: string; to: string; n: number }
const DAY = 86_400_000;

function specFor(def: RaceDef): Spec | null {
  switch (def.id) {
    case 'us-pa-sen-2024':
      return { from: '2024-06-15', to: '2024-11-02', n: 22, parties: [{ name: 'Bob Casey (D)', share: 47.5, affiliation: 'D' }, { name: 'Dave McCormick (R)', share: 46, affiliation: 'R' }, { name: 'Others', share: 6.5 }] };
    case 'de-2025':
      return { from: '2024-11-15', to: '2025-02-21', n: 40, parties: [{ name: 'Union', share: 28.5 }, { name: 'AfD', share: 20.8 }, { name: 'SPD', share: 16.4 }, { name: 'Grüne', share: 11.6 }, { name: 'Linke', share: 8.8 }, { name: 'BSW', share: 5.0 }, { name: 'FDP', share: 4.3 }, { name: 'Others', share: 4.6 }] };
    case 'de-next':
      return { from: '2025-04-01', to: '2026-09-15', n: 45, parties: [{ name: 'Union', share: 26 }, { name: 'AfD', share: 25 }, { name: 'SPD', share: 14 }, { name: 'Grüne', share: 11 }, { name: 'Linke', share: 10.5 }, { name: 'BSW', share: 3.5 }, { name: 'FDP', share: 3.5 }, { name: 'Others', share: 6.5 }] };
    case 'bg-2026': // rough illustrative shares
      return { from: '2025-06-01', to: '2026-04-15', n: 28, parties: [{ name: 'GERB–SDS', share: 26 }, { name: 'PP–DB', share: 15 }, { name: 'Vaz.', share: 12 }, { name: 'DPS', share: 12 }, { name: 'BSP–OL', share: 6 }, { name: 'MECh', share: 5 }, { name: 'Veli.', share: 4 }, { name: 'ITN', share: 3 }, { name: 'Others', share: 17 }] };
    case 'uk-next': // anchored on the actual 2024 general-election vote shares, NOT on invented current polling
      return { from: '2025-01-01', to: '2026-09-10', n: 45, parties: [{ name: 'Labour', share: 33.7 }, { name: 'Conservative', share: 23.7 }, { name: 'Reform UK', share: 14.3 }, { name: 'Liberal Democrats', share: 12.2 }, { name: 'Green', share: 6.7 }, { name: 'SNP', share: 2.5 }, { name: 'Plaid Cymru', share: 0.7 }, { name: 'Others', share: 6.2 }] };
    case 'sk-next':
      return { from: '2024-01-01', to: '2026-09-10', n: 45, parties: [{ name: 'Smer–SD', share: 21 }, { name: 'PS', share: 20 }, { name: 'Hlas–SD', share: 12 }, { name: 'KDH', share: 8 }, { name: 'Republika', share: 7 }, { name: 'SaS', share: 6 }, { name: 'OĽaNO', share: 5 }, { name: 'Demokrati', share: 4 }, { name: 'SNS', share: 4 }, { name: 'Others', share: 13 }] };
    default: {
      const r = SENATE_RACES.find((s) => s.id === def.id);
      if (!r) return null;
      const m = r.pollMargin ?? 0; // R-positive margin in points
      return {
        from: '2026-02-01', to: '2026-09-15', n: 16,
        parties: [
          { name: `${r.demCandidate ?? 'Democrat'} (D)`, share: 46 - m / 2, affiliation: 'D' },
          { name: `${r.repCandidate ?? 'Republican'} (R)`, share: 46 + m / 2, affiliation: 'R' },
          { name: 'Others', share: 8 },
        ],
      };
    }
  }
}

export function seedFor(def: RaceDef): FallbackFile | null {
  const spec = specFor(def);
  if (!spec) return null;
  const rng = mulberry32(seedFrom(`seed-${def.id}`));
  const parties: Party[] = spec.parties.map((p, i) => ({
    id: slugify(p.name), name: p.name, shortName: p.name.replace(/ \([DR]\)$/, '').split(' ').pop()!.slice(0, 10), color: '#888888',
    ...(p.affiliation ? { affiliation: p.affiliation } : {}),
  }));
  // real party colours + standard short names, via the same registry the parser uses (US D/R first, then the country's table)
  const coloured = applyPartyColors(parties.map((p) => (p.affiliation ? { ...p, color: p.affiliation === 'D' ? US_DEM : US_REP } : p)), GROUP_COUNTRY[def.group]);
  const t0 = Date.parse(spec.from), t1 = Date.parse(spec.to);
  const rows: PollRow[] = Array.from({ length: spec.n }, (_, i) => {
    const t = t0 + ((t1 - t0) * (i + rng() * 0.6)) / spec.n;
    const end = new Date(Math.min(t1, t)).toISOString().slice(0, 10);
    const start = new Date(Date.parse(end) - 2 * DAY).toISOString().slice(0, 10);
    const raw = spec.parties.map((p) => Math.max(0.5, p.share * (1 + (rng() - 0.5) * 0.14)));
    const sum = raw.reduce((a, b) => a + b, 0);
    return {
      id: `seed-${i}`, firm: `Synthetic poll #${i + 1}`, fieldworkStart: start, fieldworkEnd: end, fieldworkRaw: end,
      sampleSize: [600, 800, 1000, 1200, 1500][Math.floor(rng() * 5)],
      values: Object.fromEntries(parties.map((p, j) => [p.id, +((raw[j] / sum) * 100).toFixed(1)])),
    };
  });
  return {
    raceId: def.id, fetchedAt: new Date().toISOString(), synthetic: true,
    note: 'Illustrative placeholder polls generated offline. Replaced by real Wikipedia data on the next scheduled refresh.',
    parsed: { parties: coloured, rows, warnings: [], format: 'wikitext' },
  };
}
