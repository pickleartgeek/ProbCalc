import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePollData } from '../src/lib/parser';
import { computeBaseCalc, optionsFromWeighting } from '../src/lib/baseCalc';
import { fetchWikipediaPolling, rankPollingSections } from '../src/lib/mediawikiApi';
import { loadRace } from '../src/lib/races/loader';
import { allRaceDefs, configForRace, GALLERY_RACES, raceDefById } from '../src/lib/races/registry';
import { marginFromResults, type PollFile } from '../src/lib/midterms/livePollData';

// Shaped like the real "2026 United States elections" page: an aggregator table, then year-headed poll tables
// (2025–2026, 2024–2025) whose columns are just "Democratic | Republican | Other/Undecided | Lead", with rowspan'd
// multi-version polls. Rows are the real Jul 1 – Aug 30 2026 polls, including four ~24,000–30,000-person Morning Consult trackers.
const WIKITEXT = readFileSync(new URL('./fixtures/gcb-2025-2026.wikitext', import.meta.url), 'utf8');
const def = raceDefById('gcb-2026')!;
const NOW = '2026-09-24';

test('the generic ballot is a first-class race: registered, featured in the Gallery, tracked by fetch-polls', () => {
  assert.ok(def, 'gcb-2026 is registered');
  assert.equal(GALLERY_RACES[0].id, 'gcb-2026');
  assert.ok(allRaceDefs().some((d) => d.id === 'gcb-2026'));
  const tracked = JSON.parse(readFileSync(new URL('../scripts/tracked-races.json', import.meta.url), 'utf8')) as { raceId: string; wikiPage: string; sectionHint?: string }[];
  const t = tracked.find((r) => r.raceId === 'gcb-2026')!;
  assert.ok(t, 'fetch-polls tracks the same id the app looks up');
  assert.equal(t.wikiPage, def.wikiPage);
  assert.equal(t.sectionHint, def.sectionHint);
  // the seed committed for it exists, so the card is never empty before the first refresh
  const seed = JSON.parse(readFileSync(new URL('../public/data/races/gcb-2026.json', import.meta.url), 'utf8'));
  assert.equal(seed.synthetic, true);
});

test('parses the real table shape: Dem/Rep columns, the 2025–2026 table beats the aggregator and the 2024–2025 stub', () => {
  const parsed = parsePollData(WIKITEXT, { country: 'US' });
  assert.deepEqual(parsed.parties.map((p) => p.shortName), ['Dem', 'Rep', 'Others']);
  assert.deepEqual(parsed.parties.slice(0, 2).map((p) => p.affiliation), ['D', 'R']);
  assert.equal(parsed.rows.filter((r) => r.fieldworkEnd && r.sampleSize).length, 46);
  assert.ok(parsed.rows.every((r) => !r.fieldworkEnd || r.fieldworkEnd >= '2026-06-01'), 'no row leaked in from the 2024–2025 table');
});

test('BaseCalc caps huge trackers: without the cap four Morning Consult polls decide the national number', () => {
  const parsed = parsePollData(WIKITEXT, { country: 'US' });
  const dLead = (opts: object) => {
    const r = computeBaseCalc(parsed.parties, parsed.rows, def.electionDate, { nowIso: NOW, ...opts });
    const pct = (id: string) => r.results.find((x) => x.partyId === id)!.percentage * 100;
    return { lead: pct('democratic') - pct('republican'), polls: r.includedPolls };
  };
  const raw = dLead({});
  const capped = dLead(optionsFromWeighting(configForRace(def, parsed).sim.dateWeighting)); // what the app and fetch-polls actually use
  assert.equal(capped.polls, 46);
  assert.ok(capped.lead > raw.lead + 0.5, `cap moves the average towards the field (raw D+${raw.lead.toFixed(1)} → capped D+${capped.lead.toFixed(1)})`);
  assert.ok(capped.lead > 4.8 && capped.lead < 7, `lands in the range the aggregators (D+6.5–7.4) and this table's own polls support: D+${capped.lead.toFixed(1)}`);
});

test("the cap and window travel with the race into the app's ElectionConfig", () => {
  const cfg = configForRace(def, parsePollData(WIKITEXT, { country: 'US' }));
  assert.equal(cfg.sim.dateWeighting.maxSampleSize, 3000);
  assert.equal(cfg.sim.dateWeighting.recencyWindowDays, 90);
  assert.equal(optionsFromWeighting(cfg.sim.dateWeighting).maxSampleSize, 3000);
  assert.equal(configForRace({ ...def, maxSampleSize: undefined }, parsePollData(WIKITEXT)).sim.dateWeighting.maxSampleSize, null);
});

test('a section hint that is not itself a "polling" heading (the year tables) is still found', () => {
  const sections = [
    { index: '1', line: 'Background', level: '2', number: '1' },
    { index: '2', line: 'Generic ballot', level: '2', number: '2' },
    { index: '3', line: '2025–2026', level: '3', number: '2.1' },
    { index: '4', line: '2024–2025', level: '3', number: '2.2' },
    { index: '5', line: 'Senate elections', level: '2', number: '3' },
  ];
  assert.equal(rankPollingSections(sections, '2025–2026')[0].line, '2025–2026');
  // hint-free behaviour is unchanged: a page with no polling headings ranks nothing
  assert.equal(rankPollingSections(sections).filter((s) => s.line === '2025–2026').length, 0);
});

test('loader: a live fetch of the generic ballot returns the 2025–2026 section', async () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const sections = [
    { index: '1', line: 'Generic ballot', level: '2', number: '1' },
    { index: '2', line: '2025–2026', level: '3', number: '1.1' },
    { index: '3', line: '2024–2025', level: '3', number: '1.2' },
  ];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const p = new URL(String(input)).searchParams;
    if (p.get('prop') === 'sections') return json({ parse: { title: p.get('page'), sections } });
    const only2526 = p.get('section') === '2';
    return json({ parse: { title: p.get('page'), wikitext: only2526 ? WIKITEXT : 'no table here' } });
  }) as typeof fetch;
  const r = await loadRace(def, { fetchImpl, storage: null, fetchJson: async () => { throw new Error('no fallback needed'); }, wiki: { sleep: async () => {} } });
  assert.equal(r.source, 'live');
  assert.equal(r.sectionTitle, '2025–2026');
  assert.equal(r.parsed.rows.filter((x) => x.fieldworkEnd && x.sampleSize).length, 46);
});

test('the live margin Split Ticket reads is negative (Democrats ahead) for this table', () => {
  const parsed = parsePollData(WIKITEXT, { country: 'US' });
  const r = computeBaseCalc(parsed.parties, parsed.rows, def.electionDate, { ...optionsFromWeighting(configForRace(def, parsed).sim.dateWeighting), nowIso: NOW });
  const file: PollFile = { raceId: def.id, asOf: NOW, includedPolls: r.includedPolls, sourcePage: def.wikiPage, parties: parsed.parties, results: r.results };
  const margin = marginFromResults(file)!;
  assert.ok(margin < -4.8 && margin > -7, `R−D = ${margin.toFixed(2)}`);
});
