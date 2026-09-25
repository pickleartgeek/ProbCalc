import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePollData } from '../src/lib/parser';
import { loadRace, hasUsablePolls, pruneEmptyParties, shapeForRace } from '../src/lib/races/loader';
import { midtermRaceDef, parseOptionsFor } from '../src/lib/races/registry';
import type { WikiFailureKind } from '../src/lib/mediawikiApi';

// Shaped like the real 2026 Senate pages: several polling tables in one "Polling" section — the nominee head-to-head,
// hypothetical matchups with people who dropped out, a "vs. generic Democrat" table, an aggregator, rowspan'd multi-scenario polls.

type Head = string;
const head = (h: Head) => `! style="width:100px;" | ${h.includes('|') ? h : `[[${h.split('|')[0]}]]<br /><small>${h}</small>`}`;
const cand = (name: string, party: 'Democratic' | 'Republican') => `! style="width:100px;" | [[${name}]]<br /><small>${party}</small>`;

function table(cols: string[], rows: string[][], extraHeaders = ['Other', 'Undecided']): string {
  const header = [
    '! Poll source', '! Date(s)<br />administered', '! Sample<br />size<sup class="reference nowrap">[[#Poll_source|[a]]]</sup>', '! Margin<br />of error',
    ...cols, ...extraHeaders.map((h) => `! ${h}`),
  ].join('\n');
  const body = rows.map((r) => `|-\n${r.map((c) => `| ${c}`).join('\n')}`).join('\n');
  return `{| class="wikitable sortable mw-datatable" style="text-align:center;font-size:90%"\n|- valign=bottom\n${header}\n${body}\n|}`;
}
const poll = (firm: string, date: string, n: string, ...vals: string[]) => [firm, date, n, '± 3.0%', ...vals];
void head;

// ---- Maine: general = Collins vs Jackson; Platner / Bellows / generic tables must lose --------------------------------------------
const maineGeneral = table(
  [cand('Susan Collins', 'Republican'), cand('Troy Jackson', 'Democratic')],
  [
    poll('[[Quantus Insights]] (R)', 'September 14–15, 2026', '621 (LV)', '48%', '47%', '2%', '4%'),
    ['rowspan=1 | {{nowrap|Hart Research}} (D)', 'July 27 – August 1, 2026', '802 (LV)', '± 3.5%', '45%', '49%', '—', '6%'],
    ['', 'July 25, 2026', 'Jackson becomes Democratic nominee', '', '', '', '', ''],
    poll('[[University of New Hampshire]]', 'July 15–20, 2026', '1,178 (LV)', '46%', '49%', '2%', '3%'),
    poll('Z to A Research (D)', 'July 7–8, 2026', '988 (LV)', '48%', '47%', '—', '5%'),
    poll('Wedgewood Polls (D)', 'July 4–6, 2026', '405 (LV)', '43%', '48%', '—', '9%'),
  ],
);
const manyDates = ['June 19–26', 'June 11–14', 'June 9–11', 'June 5–8', 'June 2–3', 'June 1–3', 'May 21–25', 'May 8–18', 'April 3–9', 'March 20–31', 'March 21–23', 'March 3–8', 'March 5', 'Feb 12–16', 'January 20–24'];
const maineVsPlatner = table(
  [cand('Susan Collins', 'Republican'), cand('Graham Platner', 'Democratic')],
  manyDates.map((d, i) => poll(`Pollster ${i}`, `${d}, 2026`, '900 (LV)', '45%', '48%', '—', '7%')),
);
const maineVsGeneric = table(
  [cand('Susan Collins', 'Republican'), '! Generic Democrat'],
  [poll('Tavern Research (D)', 'June 5–8, 2026', '1,642 (LV)', '45%', '55%', '—', '—'), poll('Cygnal (R)', 'November 10–11, 2025', '600 (LV)', '41%', '49%', '—', '11%')],
);
const aggregate = `{| class="wikitable"\n|-\n! Source of poll aggregation\n! Dates administered\n! Dates updated\n! Susan Collins (R)\n! Troy Jackson (D)\n! Other/Undecided\n! Margin\n|-\n| 270toWin\n| August 31 – September 15, 2026\n| September 16, 2026\n| 45.3%\n| 46.7%\n| 8.0%\n| Jackson +1.4%\n|}`;
const mainePage = [aggregate, maineGeneral, maineVsPlatner, maineVsGeneric].join('\n\nHypothetical polling\n\n');

// ---- Alaska: general = Sullivan vs Peltola (+ two other Republicans); a bigger "generic" table must not win ------------------------
const alaskaGeneral = table(
  [cand('Dan S. Sullivan', 'Republican'), cand('Mary Peltola', 'Democratic'), cand('Dan J. Sullivan', 'Republican')],
  [
    poll('Alaska Survey Research', 'August 20–23, 2026', '1,495 (LV)', '49%', '51%', '—', '—', '—'),
    poll('Alaska Survey Research', 'August 2–5, 2026', '1,371 (LV)', '49%', '51%', '—', '—', '—'),
    poll('Data for Progress (D)', 'July 28 – August 4, 2026', '605 (LV)', '47%', '53%', '—', '—', '—'),
    ['575 (LV)', '45%', '50%', '4%'], // rowspan continuation row (no firm/date cells)
    poll('New York Times/Siena University', 'June 15–29, 2026', '593 (LV)', '47%', '45%', '—', '2%', '5%'),
    poll('Alaska Survey Research', 'June 4–7, 2026', '1,393 (LV)', '44%', '49%', '—', '3%', '—'),
  ],
  ['Other', 'Undecided'],
);
const alaskaGenericHead = [cand('Generic Republican', 'Republican'), cand('Generic Democrat', 'Democratic')];
const alaskaGeneric = table(
  alaskaGenericHead,
  Array.from({ length: 30 }, (_, i) => poll(`Generic pollster ${i}`, `${['January', 'February', 'March', 'April'][i % 4]} ${(i % 27) + 1}, 2026`, '800 (LV)', '52%', '44%', '—', '4%')),
);
const alaskaPage = [alaskaGeneric, alaskaGeneric.replace(/Generic/g, 'Generic'), alaskaGeneral].join('\n\n');

test('Maine: the Collins–Jackson table wins over Platner / generic / aggregate tables, and Platner never appears', () => {
  const def = midtermRaceDef('sen-me')!;
  assert.equal(def.cutoffDate, undefined, 'no blanket cutoff any more — the table choice handles the candidate swap');
  const parsed = shapeForRace(parsePollData(mainePage, parseOptionsFor(def)), def);
  const names = parsed.parties.map((p) => p.name).join(' | ');
  assert.match(names, /Jackson/);
  assert.match(names, /Collins/);
  assert.doesNotMatch(names, /Platner|Generic/);
  const real = parsed.rows.filter((r) => r.fieldworkEnd && r.sampleSize);
  assert.equal(real.length, 5, "all of Jackson's polls count, including the ones fielded before the convention");
});

test('without knowing the nominees, a generic-ballot table still loses to a table of named candidates', () => {
  // the Platner table has the most polls and would win on volume; the generic table must lose regardless
  const parsed = parsePollData([maineVsGeneric, maineGeneral].join('\n\n'));
  assert.match(parsed.parties.map((p) => p.name).join(' '), /Jackson/);
  assert.doesNotMatch(parsed.parties.map((p) => p.name).join(' '), /Generic/);
});

test('Alaska: a 30-poll generic Republican/Democrat table does not beat the real head-to-head', () => {
  const def = midtermRaceDef('sen-ak')!;
  const parsed = shapeForRace(parsePollData(alaskaPage, parseOptionsFor(def)), def);
  const names = parsed.parties.map((p) => p.name).join(' | ');
  assert.match(names, /Peltola/);
  assert.match(names, /Sullivan/);
  assert.doesNotMatch(names, /Generic/);
  assert.ok(parsed.rows.filter((r) => r.fieldworkEnd && r.sampleSize).length >= 5);
});

test('a page whose ONLY table is generic still returns it (last resort, better than nothing)', () => {
  const parsed = parsePollData(alaskaGeneric, parseOptionsFor(midtermRaceDef('sen-ak')!));
  assert.match(parsed.parties.map((p) => p.name).join(' '), /Generic/);
  assert.ok(hasUsablePolls(parsed));
});

test('pruneEmptyParties drops columns with no counted poll, never below two', () => {
  const base = parsePollData(maineVsPlatner);
  const withGhost = { ...base, parties: [...base.parties, { id: 'ghost', name: 'Ghost (D)', shortName: 'Ghost', color: '#000' }] };
  const pruned = pruneEmptyParties(withGhost).parties.map((p) => p.id);
  assert.ok(!pruned.includes('ghost'), 'a column with no polls is dropped');
  assert.ok(pruned.some((id) => /platner/.test(id)) && pruned.some((id) => /collins/.test(id)), 'columns with polls stay');
  // a cutoff after every poll leaves no column with data → keep everything rather than an empty chart legend
  assert.equal(pruneEmptyParties(base, '2030-01-01').parties.length, base.parties.length);
  assert.equal(hasUsablePolls(base, '2030-01-01'), false);
  assert.equal(hasUsablePolls(base, '2026-01-01'), true);
});

test('loader: a live Maine fetch picks the nominee table (through the real fetchWikipediaPolling path)', async () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const p = new URL(String(input)).searchParams;
    if (p.get('prop') === 'sections') return json({ parse: { title: p.get('page'), sections: [{ index: '1', line: 'Polling', level: '2', number: '1' }] } });
    return json({ parse: { title: p.get('page'), wikitext: mainePage } });
  }) as typeof fetch;
  const def = midtermRaceDef('sen-me')!;
  const r = await loadRace(def, { fetchImpl, storage: null, fetchJson: async () => { throw new Error('no fallback needed'); }, wiki: { sleep: async () => {} } });
  assert.equal(r.source, 'live');
  assert.match(r.parsed.parties.map((p) => p.name).join(' '), /Jackson/);
  assert.doesNotMatch(r.parsed.parties.map((p) => p.name).join(' '), /Platner|Generic/);
  const kind: WikiFailureKind | undefined = r.error?.kind;
  assert.equal(kind, undefined);
});
