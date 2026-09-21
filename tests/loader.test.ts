import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRace, describeFailure, type FallbackFile } from '../src/lib/races/loader';
import { rankPollingSections, fetchWikipediaPolling, WikiFetchError, type WikiSection } from '../src/lib/mediawikiApi';
import { GALLERY_RACES, allRaceDefs, senateRaceDefs, governorRaceDefs } from '../src/lib/races/registry';
import type { RaceDef } from '../src/lib/races/registry';

const table = `{| class="wikitable"
|-
! Poll source
! Date(s)<br />administered
! Sample<br />size
! Bob Casey<br />Democratic
! Dave McCormick<br />Republican
${[['Sep 2–5, 2024', 1000, 48, 45], ['Sep 20–24, 2024', 1200, 49, 44], ['Oct 10–14, 2024', 900, 47, 46]].map(([d, n, a, b]) => `|-\n| Emerson\n| ${d}\n| ${n}\n| ${a}%\n| ${b}%`).join('\n')}
|}`;
const primary = `{| class="wikitable"\n|-\n! Poll source\n! Date(s) administered\n! Sample size\n! X<br />Republican\n|-\n| Y | Jan 1–3, 2024 | 500 | 30%\n|}`;

const SECTIONS: WikiSection[] = [
  { index: '1', line: 'Background', level: '2', number: '1' },
  { index: '2', line: 'Republican primary', level: '2', number: '2' },
  { index: '3', line: 'Polling', level: '3', number: '2.1' },
  { index: '4', line: 'General election', level: '2', number: '3' },
  { index: '5', line: 'Polling', level: '3', number: '3.1' },
];
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

/** A tiny in-memory MediaWiki: sections, section wikitext, search. */
function mockWiki(log: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    const p = u.searchParams;
    log.push(`${p.get('action')}:${p.get('prop') ?? p.get('list')}:${p.get('section') ?? ''}`);
    if (p.get('list') === 'search') return json({ query: { search: [{ title: p.get('srsearch')!.includes('next') ? 'Opinion polling for the next Slovak parliamentary election' : 'X' }] } });
    if (p.get('page') === 'No such page') return json({ error: { code: 'missingtitle', info: 'The page you specified doesn\'t exist.' } });
    if (p.get('prop') === 'sections') return json({ parse: { title: p.get('page'), sections: SECTIONS.map((s) => ({ ...s, line: s.line })) } });
    if (p.get('prop') === 'wikitext') return json({ parse: { title: p.get('page'), wikitext: p.get('section') === '5' ? table : primary } });
    throw new Error('unexpected request ' + u);
  }) as typeof fetch;
}
const def: RaceDef = { ...GALLERY_RACES.find((r) => r.id === 'us-pa-sen-2024')! };
const memStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
const noSleep = { sleep: async () => {} };
const seedFile = (over: Partial<FallbackFile> = {}): FallbackFile => ({
  raceId: def.id, fetchedAt: '2026-09-01T06:00:00Z', pageTitle: 'p', sectionTitle: 's',
  parsed: { parties: [{ id: 'a', name: 'A', shortName: 'A', color: '#f00' }], rows: [{ id: 'r', firm: 'F', fieldworkStart: '2024-09-01', fieldworkEnd: '2024-09-02', fieldworkRaw: '', sampleSize: 800, values: { a: 50 } }] },
  ...over,
});

test('section ranking prefers General election → Polling over the primary polling section', () => {
  const ranked = rankPollingSections(SECTIONS);
  assert.equal(ranked[0].index, '5');
  assert.ok(!ranked.some((s) => s.index === '1'), 'non-polling headings are dropped');
  assert.equal(ranked[1].index, '3');
});

test('live path: fetches the right section, parses it, stores it, and the next call comes from the browser cache', async () => {
  const log: string[] = [];
  const storage = memStore();
  const a = await loadRace(def, { fetchImpl: mockWiki(log), storage, fetchJson: async () => { throw new Error('should not be needed'); } });
  assert.equal(a.source, 'live');
  assert.equal(a.parsed.rows.length, 3);
  assert.equal(a.parsed.parties.find((p) => p.affiliation === 'D')?.shortName, 'Casey');
  assert.deepEqual(log, ['parse:sections:', 'parse:wikitext:5']);
  const before = log.length;
  const b = await loadRace(def, { fetchImpl: mockWiki(log), storage });
  assert.equal(b.source, 'browser-cache');
  assert.equal(log.length, before, 'no network on a cache hit');
  const c = await loadRace(def, { fetchImpl: mockWiki(log), storage, force: true });
  assert.equal(c.source, 'live', 'Retry (force) bypasses the cache');
});

const failing: Record<string, () => typeof fetch> = {
  network: () => (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch,
  timeout: () => ((_u: unknown, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as typeof fetch,
  'rate-limit': () => (async () => new Response('slow down', { status: 429, headers: { 'retry-after': '1' } })) as typeof fetch,
  http: () => (async () => new Response('boom', { status: 503 })) as typeof fetch,
};
for (const [kind, make] of Object.entries(failing)) {
  test(`failure "${kind}": the race still loads, from the bundled copy, with the reason attached`, async () => {
    const r = await loadRace(def, { fetchImpl: make(), storage: null, fetchJson: async () => seedFile(), wiki: { ...noSleep, timeoutMs: 30, retries: 1 } });
    assert.equal(r.source, 'fallback');
    assert.equal(r.error?.kind, kind);
    assert.ok(r.parsed.rows.length > 0);
    assert.ok(describeFailure(r.error).length > 5);
  });
}

test('synthetic fallback files are labelled "seed", never passed off as fetched data', async () => {
  const r = await loadRace(def, { fetchImpl: failing.network(), storage: null, fetchJson: async () => seedFile({ synthetic: true }), wiki: noSleep });
  assert.equal(r.source, 'seed');
});

test('no live data and no fallback file -> source "none" with a reason (card shows Retry, not a crash)', async () => {
  const r = await loadRace(def, { fetchImpl: failing.network(), storage: null, fetchJson: async () => { throw new Error('404'); }, wiki: noSleep });
  assert.equal(r.source, 'none');
  assert.equal(r.error?.kind, 'network');
});

test('a page with no usable table is a "no-table" failure, not a silent empty chart', async () => {
  const empty = (async (input: RequestInfo | URL) => {
    const p = new URL(String(input)).searchParams;
    if (p.get('prop') === 'sections') return json({ parse: { title: 't', sections: [{ index: '1', line: 'Polling', level: '2', number: '1' }] } });
    return json({ parse: { title: 't', wikitext: 'No polls yet.' } });
  }) as typeof fetch;
  const r = await loadRace(def, { fetchImpl: empty, storage: null, fetchJson: async () => seedFile(), wiki: noSleep });
  assert.equal(r.source, 'fallback');
  assert.equal(r.error?.kind, 'no-table');
});

test('rate limits are retried with backoff before giving up; a later success wins', async () => {
  let calls = 0;
  const flaky = (async (u: RequestInfo | URL, init?: RequestInit) => (++calls <= 2 ? new Response('', { status: 429 }) : mockWiki()(u, init))) as typeof fetch;
  const r = await loadRace(def, { fetchImpl: flaky, storage: null, wiki: { ...noSleep, retries: 3 } });
  assert.equal(r.source, 'live');
  assert.ok(calls >= 4);
});

test('a missing page is rescued through Wikipedia search when the race has a searchQuery', async () => {
  const res = await fetchWikipediaPolling('No such page', 'en.wikipedia.org', undefined, { fetchImpl: mockWiki(), searchQuery: 'next Slovak poll' });
  assert.equal(res.resolvedFrom, 'No such page');
  await assert.rejects(() => fetchWikipediaPolling('No such page', 'en.wikipedia.org', undefined, { fetchImpl: mockWiki() }), (e: unknown) => e instanceof WikiFetchError && e.kind === 'missing-page');
});

test('registry: every 2026 Senate and governor race gets a page title and a state binding', () => {
  const s = senateRaceDefs(), g = governorRaceDefs();
  assert.equal(s.length, 35);
  assert.equal(g.length, 36);
  assert.ok(s.every((d) => /^2026 United States Senate (special )?election in [A-Z]/.test(d.wikiPage)));
  assert.ok(g.every((d) => /^2026 [A-Z][A-Za-z ]+ gubernatorial election$/.test(d.wikiPage)));
  // every race maps onto a geography, except the ones explicitly waiting for their boundary data
  const AWAITING_GEOGRAPHY = ['uk-next'];
  assert.deepEqual(allRaceDefs().filter((d) => !d.regionBinding).map((d) => d.id), AWAITING_GEOGRAPHY);
  assert.equal(new Set(allRaceDefs().map((d) => d.id)).size, allRaceDefs().length, 'ids are unique');
});
