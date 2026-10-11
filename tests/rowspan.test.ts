import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWikitext } from '../src/lib/wikitextParser';

// The exact bug a user caught live: a Wikipedia polling table rowspans a pollster's shared cells (pollster name,
// fieldwork dates) across two rows — the normal way Wikipedia groups two versions/waves of one poll — and the
// SECOND row simply omits those cells. Read purely positionally, the second row's remaining cells all shift left
// by however many columns were omitted, so a real party's percentage lands under its NEIGHBOUR's column instead.
// This is shaped after the real "Opinion polling for the next Slovak parliamentary election" page: a coalition
// header ("OľaNO and Friends") sits right before "Republika" and "Demokrati", so a shifted row silently hands
// Demokrati's number to Republika (or vice versa) while the poll otherwise looks completely normal (real firm,
// real date, real sample size) — nothing about it trips the "no usable date/sample" safety net that would
// otherwise catch a garbled row.

function table(headerCols: string[], rows: string[][]): string {
  const header = ['! Poll source', '! Date(s)', '! Sample size', ...headerCols.map((h) => `! ${h}`)].join('\n');
  const body = rows.map((r) => `|-\n${r.map((c) => `| ${c}`).join('\n')}`).join('\n');
  return `{| class="wikitable"\n|- valign=bottom\n${header}\n${body}\n|}`;
}

test('a rowspanned pollster/date cell does not shift later columns onto the wrong party', () => {
  const wikitext = table(
    ['Smer', 'PS', 'OľaNO and Friends', 'Republika', 'Demokrati'],
    [
      // First wave: full row, including the rowspanned leading cells.
      ['rowspan=2 | NMS', 'rowspan=2 | 1–5 October 2026', '1,005', '17.8%', '19.5%', '9.0%', '8.0%', '14.2%'],
      // Second wave: pollster + date OMITTED (that's what rowspan means) — only the remaining columns appear.
      ['1,004', '16.2%', '21.6%', '9.0%', '6.8%', '15.6%'],
      // An unrelated, unspanned poll, to make sure normal rows are unaffected.
      ['Focus', '1–7 September 2026', '1,012', '17.3%', '17.3%', '8.9%', '7.5%', '12.4%'],
    ],
  );
  const parsed = parseWikitext(wikitext);
  const byId = (name: string) => parsed.parties.find((p) => p.shortName.toLowerCase() === name.toLowerCase())?.id;
  const republikaId = byId('Republika')!;
  const demokratiId = byId('Demokrati')!;
  assert.ok(republikaId && demokratiId, 'both parties were recognised');

  assert.equal(parsed.rows.length, 3);
  const [wave1, wave2, focus] = parsed.rows;

  // The carried-forward row must keep the real pollster/date, not read "1,004" as the firm name.
  assert.equal(wave2.firm, 'NMS');
  assert.equal(wave2.fieldworkEnd, wave1.fieldworkEnd);
  assert.equal(wave2.sampleSize, 1004);

  // And — the actual bug — Republika and Demokrati must each keep their own number in every row, never swapped.
  assert.equal(wave1.values[republikaId], 8.0);
  assert.equal(wave1.values[demokratiId], 14.2);
  assert.equal(wave2.values[republikaId], 6.8);
  assert.equal(wave2.values[demokratiId], 15.6);
  assert.equal(focus.values[republikaId], 7.5);
  assert.equal(focus.values[demokratiId], 12.4);
});

test('a colspan header is expanded so later columns still line up (duplicated label, not dropped)', () => {
  const wikitext = table(
    ['Smer', 'colspan=2 | Coalition bloc', 'Republika'],
    [['Focus', '1–7 Sep 2026', '1,012', '17.3%', '9.0%', '4.0%', '7.5%']],
  );
  const parsed = parseWikitext(wikitext);
  // 4 party-ish columns expected (Smer, Coalition bloc x2, Republika) — the point is Republika's cell is read
  // from the right position (last), not shifted left because the colspan header only "looked like" one column.
  const republika = parsed.parties.find((p) => p.shortName.toLowerCase() === 'republika');
  assert.ok(republika, 'Republika survives a preceding colspan header without losing its column');
  const row = parsed.rows[0];
  assert.equal(row.values[republika!.id], 7.5);
});

test('real page: "OĽaNO and Friends" is a colspan=3 group (Slovakia / ZĽ / KÚ named in a second header row), ' +
  'not one column — Republika and Demokrati must keep their own real percentages', () => {
  // Byte-for-byte the live "Opinion polling for the next Slovak parliamentary election" table (NMS, 1–5 Oct 2026
  // wave), captured from the page's own wikitext after this exact bug was caught live: a flattened/rendered copy
  // of this table reads as "Republika 14.2%, Demokrati 9.7–15.6%", a ~7-10pt inflation of a minor party that had
  // no news coverage to match — the real numbers, from the raw wikitext's actual column spans, are the opposite:
  // Republika in the teens, Demokrati in the mid single digits.
  const wikitext = readFileSync(new URL('./fixtures/sk-oct2026-colspan.wikitext', import.meta.url), 'utf8');
  const parsed = parseWikitext(wikitext);
  const byName = (name: string) => parsed.parties.find((p) => p.shortName.toLowerCase() === name.toLowerCase());
  const republika = byName('Republika');
  const demokrati = byName('Demokrati');
  assert.ok(republika, 'Republika is recognised as its own party');
  assert.ok(demokrati, 'Demokrati is recognised as its own party');
  assert.notEqual(republika!.id, demokrati!.id);

  assert.equal(parsed.rows.length, 1);
  const row = parsed.rows[0];
  assert.equal(row.firm, 'NMS');
  assert.equal(row.fieldworkEnd, '2026-10-05');
  assert.equal(row.sampleSize, 1005);
  assert.equal(row.values[republika!.id], 14.2, 'Republika keeps its own real figure, not Demokrati\'s');
  assert.equal(row.values[demokrati!.id], 4.9, 'Demokrati keeps its own real figure — mid single digits, not low teens');
});
