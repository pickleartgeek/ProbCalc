import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePollData } from '../src/lib/parser';
import { classifyHeader } from '../src/lib/pollHeaderTerms';
import { parseWikiDateRange } from '../src/lib/dateUtils';

const noColumnWarning = (w: string[]) => w.filter((x) => /poll-source and date columns|Could not/i.test(x));

// Shaped like Wikipedia's US general-election polling markup: <br /> inside headers, a <sup> footnote,
// external-link pollsters, {{nowrap}}, bold leading values, "(LV)" sample suffixes.
const usTable = (a: string, b: string) => `{| class="wikitable sortable mw-datatable" style="text-align:center;font-size:90%;line-height:17px"
|- valign=bottom
! ${a}
! ${b}
! Sample<br />size<sup class="reference nowrap">[[#Poll_source|[a]]]</sup>
! Margin<br />of error
! style="width:100px;" | [[Bob Casey Jr.|Bob<br />Casey]]<br /><small>Democratic</small>
! style="width:100px;" | [[Dave McCormick]]<br /><small>Republican</small>
! Other /<br />Undecided
|-
| [https://example.org/poll Emerson College]<ref>foo</ref>
| Sep 2–5, 2024
| 1,000 (LV)
| ± 3.0%
| style="background:#dbe6ff;" | '''48%'''
| 45%
| 7%
|-
| {{nowrap|Quinnipiac University}}
| Aug 30 – Sep 2, 2024
| 1,404 (RV)
| ± 2.6%
| 50%
| 44%
| 6%
|-
| [[Marist College]]
| Oct 30 – Nov 1, 2024
| 1,300 (LV)
| ± 3.4%
| 49%
| 46%
| 5%
|}`;

const variants: [string, string][] = [
  ['Poll source', 'Date(s)<br />administered'],
  ['Pollster', 'Fieldwork'],
  ['Source', 'Dates'],
  ['Pollster', 'Date(s) administered'],
  ['Poll source', 'Dates'],
  ['Source', 'Fieldwork'],
  ['Polling firm', 'Fieldwork date'],
];

for (const [a, b] of variants) {
  test(`wikitext header aliases: "${a}" + "${b}" parse with no missing-column warning`, () => {
    const r = parsePollData(usTable(a, b));
    assert.deepEqual(noColumnWarning(r.warnings), []);
    assert.equal(r.rows.length, 3);
    assert.equal(r.rows[0].firm, 'Emerson College');
    assert.equal(r.rows[1].firm, 'Quinnipiac University');
    assert.equal(r.rows[0].fieldworkEnd, '2024-09-05');
    assert.equal(r.rows[1].fieldworkStart, '2024-08-30');
    assert.equal(r.rows[0].sampleSize, 1000);
    assert.equal(r.rows[1].sampleSize, 1404);
  });
}

test('US candidate columns keep affiliation, short names and the Other/Undecided bucket', () => {
  const r = parsePollData(usTable('Poll source', 'Date(s) administered'));
  const ids = r.parties.map((p) => p.shortName);
  assert.deepEqual(ids, ['Casey', 'McCormick', 'Others']);
  assert.equal(r.parties[0].affiliation, 'D');
  assert.equal(r.parties[1].affiliation, 'R');
  assert.equal(r.rows[0].values[r.parties[0].id], 48);
  assert.equal(r.rows[0].values[r.parties[2].id], 7);
  // margin-of-error must NOT have become a party column
  assert.equal(r.parties.length, 3);
});

test('a section with several tables picks the polling table, not the aggregator or a big primary', () => {
  const aggregator = `{| class="wikitable"
|-
! Source of poll<br />aggregation
! Dates<br />administered
! Dates<br />updated
! Bob Casey<br />Democratic
! Dave McCormick<br />Republican
|-
| RealClearPolitics
| Oct 1 – Nov 3, 2024
| Nov 4, 2024
| 48.0%
| 46.0%
|}`;
  const primary = `{| class="wikitable"
|-
! Poll source
! Date(s) administered
! Sample size
! A<br />Republican
! B<br />Republican
! C<br />Republican
! D<br />Republican
! E<br />Republican
! F<br />Republican
! G<br />Republican
|-
| X | Jan 1–3, 2024 | 500 | 10% | 10% | 10% | 10% | 10% | 10% | 10%
|}`;
  const r = parsePollData(`==Polling==\n${aggregator}\n\n${primary}\n\n${usTable('Poll source', 'Date(s) administered')}`);
  assert.equal(r.meta?.tablesFound, 3);
  assert.equal(r.meta?.tableIndex, 2);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(noColumnWarning(r.warnings), []);
});

test('European wikitext with {{opdrts}} dates still parses', () => {
  const t = `{| class="wikitable"
|-
! Polling firm
! Fieldwork date
! Sample size
! [[Christian Democratic Union of Germany|Union]]
! [[Alternative for Germany|AfD]]
! [[Social Democratic Party of Germany|SPD]]
! Lead
|-
| [[Forsa]]
| {{opdrts|9|10|Jun|2025}}
| 2,500
| 26
| 25
| 15
| 1
|}`;
  const r = parsePollData(t);
  assert.equal(r.parties.length, 3);
  assert.equal(r.rows[0].sampleSize, 2500);
  assert.equal(r.rows[0].fieldworkEnd, '2025-06-10');
  assert.deepEqual(noColumnWarning(r.warnings), []);
});

test('plain paste: Google-Sheets style quoted multi-line header, US dates', () => {
  const tsv = [
    '"Poll source"\t"Date(s)\nadministered"\t"Sample\nsize"\t"Margin of error"\tBob Casey Democratic\tDave McCormick Republican\tOther / Undecided',
    'Emerson College\tSep 2–5, 2024\t1,000 (LV)\t± 3.0%\t48%\t45%\t7%',
    'Quinnipiac University\tAug 30 – Sep 2, 2024\t1,404 (RV)\t± 2.6%\t50%\t44%\t6%',
  ].join('\n');
  const r = parsePollData(tsv);
  assert.deepEqual(noColumnWarning(r.warnings), []);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[1].fieldworkStart, '2024-08-30');
  assert.equal(r.parties.map((p) => p.shortName).join(), 'Casey,McCormick,Others');
});

test('plain paste: a caption line above the table does not hide the header', () => {
  const tsv = ['Opinion polling for the 2024 election', 'Pollster\tDates\tSample size\tAfD\tSPD', 'Forsa\t9–10 Jun 2025\t2,500\t25\t15'].join('\n');
  const r = parsePollData(tsv);
  assert.deepEqual(noColumnWarning(r.warnings), []);
  assert.equal(r.rows.length, 1);
});

test('classifyHeader: metadata columns are never mistaken for date/sample/party columns', () => {
  for (const h of ['Dates<br />updated', 'Margin<br />of error', 'Lead', 'Sample type', 'Refs.']) {
    assert.equal(classifyHeader(h).role, 'ignore', h);
  }
  assert.equal(classifyHeader('Date(s)<br />administered').role, 'date');
  assert.equal(classifyHeader('Sample<sup>[a]</sup> size').role, 'sample');
  assert.equal(classifyHeader('Poll&nbsp;source').role, 'firm');
  assert.equal(classifyHeader('Other / Undecided').role, 'others');
});

test('US and European date formats', () => {
  assert.deepEqual(parseWikiDateRange('Oct 30–Nov 1, 2024'), { start: '2024-10-30', end: '2024-11-01' });
  assert.deepEqual(parseWikiDateRange('Dec 28, 2023 – Jan 3, 2024'), { start: '2023-12-28', end: '2024-01-03' });
  assert.deepEqual(parseWikiDateRange('30 Mar–2 Apr 2025'), { start: '2025-03-30', end: '2025-04-02' });
  assert.deepEqual(parseWikiDateRange('Sep 31, 2024'), { start: null, end: null });
});
