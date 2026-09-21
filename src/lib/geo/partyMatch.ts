import type { Party } from '../types';
import { slugify } from '../partyColors';

// Poll pages and results files name the same party differently ("Smer–SD" vs "SMER - SD",
// "Grüne" vs "BÜNDNIS 90/DIE GRÜNEN", "Jon Ossoff (D)" vs the baseline's "D"). This maps each
// race party onto at most one baseline key so the previous-election lean can be applied to it.

const ALIASES: Record<string, string[]> = {
  // Germany
  union: ['union', 'cdu', 'csu', 'cducsu', 'cdu/csu'],
  gruene: ['grune', 'gruene', 'grunen', 'bundnis90diegrunen', 'greens', 'bundnis90'],
  linke: ['linke', 'dielinke', 'left', 'thelinke'],
  afd: ['afd', 'alternativefurdeutschland'],
  spd: ['spd'],
  fdp: ['fdp'],
  bsw: ['bsw', 'bundnissahrawagenknecht'],
  fw: ['fw', 'freiewahler', 'freevoters'],
  // Slovakia
  smersd: ['smersd', 'smer', 'smersocialnademokracia', 'smersocialdemocracy'],
  hlassd: ['hlassd', 'hlas', 'voice'],
  ps: ['ps', 'progresivneslovensko', 'progressiveslovakia'],
  olano: ['olano', 'slovensko', 'olanoapriatelia', 'hnutieslovensko'],
  kdh: ['kdh'],
  sas: ['sas'],
  sns: ['sns'],
  republika: ['republika'],
  aliancia: ['aliancia', 'szovetsegaliancia', 'szovetseg', 'alliance'],
  demokrati: ['demokrati', 'democrats'],
  lsns: ['lsns', 'lsnsnasslovensko', 'ludovastranananasslovensko'],
  srdcesnj: ['srdcesnj', 'srdce'],
  spravodlivost: ['spravodlivost'],
  smerodina: ['smerodina', 'smerodina'],
  // Bulgaria (shape only — baselines are user-supplied)
  gerbsds: ['gerbsds', 'gerb'],
  ppdb: ['ppdb'],
  dps: ['dps', 'dpsnovobeginning', 'dpsnb'],
};

/** partyId -> baseline key (or null = no counterpart; that party simply takes the national swing). */
export function matchPartiesToBaseline(parties: Party[], keys: { key: string; label: string }[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const taken = new Set<string>();
  const keySet = new Set(keys.map((k) => k.key));
  const tryKey = (partyId: string, key: string | undefined): boolean => {
    if (!key || !keySet.has(key) || taken.has(key)) return false;
    taken.add(key);
    out[partyId] = key;
    return true;
  };

  // pass 1: US affiliation
  for (const p of parties) if (p.affiliation && keySet.has(p.affiliation)) tryKey(p.id, p.affiliation);

  // pass 2: exact slug, then alias
  for (const p of parties) {
    if (p.id in out) continue;
    const cands = [slugify(p.id), slugify(p.shortName), slugify(p.name)];
    if (tryKey(p.id, keys.find((k) => cands.includes(slugify(k.key)) || cands.includes(slugify(k.label)))?.key)) continue;
    const hit = keys.find((k) => {
      const al = ALIASES[k.key] ?? ALIASES[slugify(k.label)];
      return al ? cands.some((c) => al.includes(c)) : false;
    });
    tryKey(p.id, hit?.key);
  }

  // pass 3: prefix (hlas ~ hlassd) for slugs of at least 3 characters
  for (const p of parties) {
    if (p.id in out) continue;
    const s = slugify(p.shortName);
    const hit = s.length >= 3 ? keys.find((k) => !taken.has(k.key) && (slugify(k.key).startsWith(s) || (slugify(k.key).length >= 3 && s.startsWith(slugify(k.key))))) : undefined;
    tryKey(p.id, hit?.key);
  }

  // "Others" takes the baseline's others bucket
  for (const p of parties) if (!(p.id in out) && slugify(p.id) === 'others') tryKey(p.id, keys.find((k) => k.key === 'others')?.key);

  for (const p of parties) if (!(p.id in out)) out[p.id] = null;
  return out;
}
