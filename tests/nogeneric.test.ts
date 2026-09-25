import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePollData } from '../src/lib/parser';
import { assertRealCandidates, isPlaceholderParty, loadRace, shapeForRace } from '../src/lib/races/loader';
import { allRaceDefs, midtermRaceDef, parseOptionsFor, requiresNamedCandidates } from '../src/lib/races/registry';
import { seedFor } from '../scripts/lib/seed-polls';

// The guarantee: no Senate or governor race ever shows "Generic R / Generic D" (or the seed-style "Democrat (D) / Republican (R)").
// Most races have NO nominee named in the repo data, so this has to hold from the table alone.

const cand = (name: string, party: 'Democratic' | 'Republican') => `! [[${name}]]<br /><small>${party}</small>`;
function table(cols: string[], rows: string[][]): string {
  const head = ['! Poll source', '! Date(s)<br />administered', '! Sample<br />size', '! Margin<br />of error', ...cols, '! Undecided'].join('\n');
  return `{| class="wikitable"\n|- valign=bottom\n${head}\n${rows.map((r) => `|-\n${r.map((c) => `| ${c}`).join('\n')}`).join('\n')}\n|}`;
}
const poll = (i: number, date: string, d: string, r: string) => [`Pollster ${i}`, date, '800 (LV)', '± 3.5%', d, r, '5%'];

// a big generic table (100 polls!) and a tiny table of real candidates
const bigGeneric = table([cand('Generic Democrat', 'Democratic'), cand('Generic Republican', 'Republican')],
  Array.from({ length: 100 }, (_, i) => poll(i, `${['January', 'February', 'March', 'April', 'May'][i % 5]} ${(i % 27) + 1}, 2026`, '44%', '51%')));
const smallReal = table([cand('Jane Roe', 'Democratic'), cand('John Doe', 'Republican')], [poll(1, 'September 3–6, 2026', '43%', '50%'), poll(2, 'August 20–22, 2026', '41%', '52%')]);

test('an unnamed race (no nominees in the data) still prefers 2 real polls over 100 generic ones', () => {
  const def = midtermRaceDef('sen-wy')!;
  assert.ok(!def.demCandidate && !def.repCandidate, 'precondition: Wyoming has no nominees on file');
  const parsed = shapeForRace(parsePollData([bigGeneric, smallReal].join('\n\n'), parseOptionsFor(def)), def);
  assert.match(parsed.parties.map((p) => p.name).join(' | '), /Roe.*Doe/);
  assert.equal(parsed.parties.filter(isPlaceholderParty).length, 0, 'no placeholder column survives');
  assert.doesNotThrow(() => assertRealCandidates(parsed, def));
});

test('recency picks the live matchup when nominees are unknown (dropped candidate has MORE polls but stale ones)', () => {
  const def = midtermRaceDef('sen-wy')!;
  const stale = table([cand('Old Nominee', 'Democratic'), cand('John Doe', 'Republican')],
    Array.from({ length: 20 }, (_, i) => poll(i, `${['February', 'March', 'April', 'May'][i % 4]} ${(i % 27) + 1}, 2026`, '45%', '46%')));
  const parsed = parsePollData([stale, smallReal].join('\n\n'), parseOptionsFor(def));
  assert.match(parsed.parties.map((p) => p.name).join(' | '), /Jane Roe/);
  // ...but not for non-US pages, where a year-split table set should still prefer the biggest table
  const de = parsePollData([stale, smallReal].join('\n\n'), { country: 'DE' });
  assert.match(de.parties.map((p) => p.name).join(' | '), /Old Nominee/);
});

test('a page whose ONLY table is generic is refused for a Senate/governor race, and the card gets no data instead', async () => {
  const def = midtermRaceDef('sen-wy')!;
  const parsed = shapeForRace(parsePollData(bigGeneric, parseOptionsFor(def)), def);
  assert.throws(() => assertRealCandidates(parsed, def), /placeholder/i);

  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const p = new URL(String(input)).searchParams;
    if (p.get('prop') === 'sections') return json({ parse: { title: p.get('page'), sections: [{ index: '1', line: 'Polling', level: '2', number: '1' }] } });
    return json({ parse: { title: p.get('page'), wikitext: bigGeneric } });
  }) as typeof fetch;
  const r = await loadRace(def, { fetchImpl, storage: null, fetchJson: async () => { throw new Error('no fallback file'); }, wiki: { sleep: async () => {} } });
  assert.equal(r.source, 'none');
  assert.ok(r.error);
  assert.equal(r.parsed.rows.length, 0);
});

test('a generic fallback file (e.g. one a CI build wrote earlier) is refused too', async () => {
  const def = midtermRaceDef('sen-wy')!;
  const generic = parsePollData(bigGeneric, { country: 'US' });
  const failing = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
  const r = await loadRace(def, {
    fetchImpl: failing, storage: null, wiki: { sleep: async () => {}, retries: 0 },
    fetchJson: async () => ({ raceId: def.id, fetchedAt: '2026-09-01T00:00:00Z', parsed: generic }),
  });
  assert.equal(r.source, 'none');
});

test('a stray generic column beside real candidates is dropped; the generic ballot itself keeps its Democratic/Republican columns', () => {
  const def = midtermRaceDef('sen-wy')!;
  const wide = table([cand('Jane Roe', 'Democratic'), cand('John Doe', 'Republican'), cand('Generic Democrat', 'Democratic')], [poll(1, 'September 3–6, 2026', '43%', '50%')]).replace('| 5%', '| 43% | 5%');
  const parsed = shapeForRace(parsePollData(wide, parseOptionsFor(def)), def);
  assert.ok(parsed.parties.every((p) => !/generic/i.test(p.name)));
  const gcb = allRaceDefs().find((d) => d.id === 'gcb-2026')!;
  assert.equal(requiresNamedCandidates(gcb), false);
  assert.doesNotThrow(() => assertRealCandidates(parsePollData(bigGeneric, { country: 'US' }), gcb));
});

test('no seed is ever generated under a placeholder label, and unnamed races get none', () => {
  for (const def of allRaceDefs()) {
    const seed = seedFor(def);
    if (!seed) continue;
    if (requiresNamedCandidates(def)) {
      assert.ok(def.demCandidate && def.repCandidate, `${def.id}: a seed exists only for a race with named nominees`);
      assert.ok(seed.parsed.parties.filter((p) => p.affiliation).every((p) => !isPlaceholderParty(p)), `${def.id}: seed labels are real candidates`);
    }
  }
  assert.equal(seedFor(midtermRaceDef('sen-wy')!), null);
  assert.ok(seedFor(midtermRaceDef('sen-ga')!));
});

test('placeholder detection', () => {
  const p = (name: string) => isPlaceholderParty({ name, shortName: name });
  for (const n of ['Generic (D)', 'Another (R)', 'Democrat (D)', 'Republican', 'Democratic', 'Unnamed (D)']) assert.equal(p(n), true, n);
  for (const n of ['Jon Ossoff (D)', 'Susan Collins (R)', 'Others', 'Mary Peltola (D)']) assert.equal(p(n), false, n);
});

test('every fallback file committed in public/data/races is free of placeholder labels', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../public/data/races/', import.meta.url);
  const byId = new Map(allRaceDefs().map((d) => [d.id, d]));
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const def = byId.get(f.replace(/\.json$/, ''));
    if (!def) continue; // a retired race's file
    const file = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.doesNotThrow(() => assertRealCandidates(file.parsed, def), f);
  }
});
