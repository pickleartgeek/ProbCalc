import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBaseCalc, computeBaseCalcTimeline, computePollWeights } from '../src/lib/baseCalc';
import type { Party, PollRow } from '../src/lib/types';

const parties: Party[] = [
  { id: 'a', name: 'A', shortName: 'A', color: '#f00' },
  { id: 'b', name: 'B', shortName: 'B', color: '#00f' },
  { id: 'o', name: 'Others', shortName: 'Oth', color: '#888' },
];
const row = (id: string, end: string, n: number | null, a: number, b: number, o = 100 - a - b): PollRow => ({
  id, firm: 'F' + id, fieldworkStart: end, fieldworkEnd: end, fieldworkRaw: end, sampleSize: n, values: { a, b, o },
});
const ELECTION = '2024-11-05';
const rows: PollRow[] = [
  row('1', '2024-08-01', 800, 48, 44),
  row('2', '2024-09-10', 1000, 47, 46),
  row('3', '2024-10-05', 1200, 49, 45),
  row('4', '2024-10-30', 900, 50, 44),
  row('x', '2024-10-31', null, 10, 80), // no sample -> excluded
  { ...row('e', '2024-11-05', 1, 1, 99), isElectionResult: true },
];

test('hand-calculated alphas match the guide formula (value*sample / (days*100))', () => {
  const r = computeBaseCalc(parties, rows.slice(0, 1), ELECTION);
  const days = (Date.parse('2024-11-05') - Date.parse('2024-08-01')) / 86400000; // 96
  assert.equal(days, 96);
  assert.ok(Math.abs(r.results[0].alpha - (48 * 800) / (96 * 100)) < 1e-12);
  assert.ok(Math.abs(r.results[1].alpha - (44 * 800) / (96 * 100)) < 1e-12);
  assert.ok(Math.abs(r.results.reduce((s, x) => s + x.percentage, 0) - 1) < 1e-12);
});

test('excludes no-sample rows and the election result row', () => {
  const r = computeBaseCalc(parties, rows, ELECTION);
  assert.equal(r.includedPolls, 4);
  assert.equal(r.excludedPolls, 1);
});

test('timeline: last cumulative day equals the headline BaseCalc exactly', () => {
  const head = computeBaseCalc(parties, rows, ELECTION).results;
  const tl = computeBaseCalcTimeline(parties, rows, ELECTION);
  const last = tl[tl.length - 1];
  assert.equal(last.date, '2024-10-30');
  for (const h of head) assert.ok(Math.abs(last.shares[h.partyId] - h.percentage) < 1e-9, h.partyId);
});

test('timeline: no look-ahead — a day only sees polls whose fieldwork has ended', () => {
  const tl = computeBaseCalcTimeline(parties, rows, ELECTION);
  assert.equal(tl[0].date, '2024-08-01');
  assert.equal(tl[0].polls, 1);
  const beforeSept10 = tl.find((p) => p.date === '2024-09-09')!;
  assert.equal(beforeSept10.polls, 1);
  const onSept10 = tl.find((p) => p.date === '2024-09-10')!;
  assert.equal(onSept10.polls, 2);
  // shares sum to 1 every day, and there is one point per calendar day
  for (const p of tl) assert.ok(Math.abs(Object.values(p.shares).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(tl.length, 91); // Aug 1 .. Oct 30 inclusive
});

test('timeline: extends flat to endDate; trailing window drops old polls', () => {
  const ext = computeBaseCalcTimeline(parties, rows, ELECTION, { endDate: '2024-11-04' });
  assert.equal(ext[ext.length - 1].date, '2024-11-04');
  const w = computeBaseCalcTimeline(parties, rows, ELECTION, { windowDays: 30 });
  const lastW = w[w.length - 1];
  assert.equal(lastW.polls, 2); // Oct 5 and Oct 30 are inside the 30 days ending Oct 30
  const solo = computeBaseCalc(parties, rows.filter((r) => r.id === '3' || r.id === '4'), ELECTION).results;
  for (const s of solo) assert.ok(Math.abs(lastW.shares[s.partyId] - s.percentage) < 1e-9);
});

test('poll weights: shares sum to 1, closer/larger polls weigh more, exclusions carry a reason', () => {
  const w = computePollWeights(parties, rows, ELECTION);
  const inc = w.filter((x) => x.included);
  assert.ok(Math.abs(inc.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
  const byId = Object.fromEntries(inc.map((x) => [x.rowId, x]));
  assert.ok(byId['4'].weight > byId['3'].weight && byId['3'].weight > byId['1'].weight);
  assert.equal(w.find((x) => x.rowId === 'x')?.reason, 'no sample size');
});

test('cutoffDate drops earlier polls from headline, weights and timeline alike', () => {
  const opts = { cutoffDate: '2024-09-10' };
  assert.equal(computeBaseCalc(parties, rows, ELECTION, opts).includedPolls, 3);
  assert.equal(computeBaseCalcTimeline(parties, rows, ELECTION, opts)[0].date, '2024-09-10');
  assert.equal(computePollWeights(parties, rows, ELECTION, opts).find((x) => x.rowId === '1')?.included, false);
});

test('recencyWindowDays gives a rolling recency cutoff on the headline BaseCalc itself, not just the timeline', () => {
  // "now" = Oct 31; a 30-day window keeps only polls 3 and 4 (Oct 5, Oct 30), same as the
  // existing timeline windowDays test above, but exercised against computeBaseCalc directly —
  // this is the number ProbCalc and the donut actually consume. Named distinctly from
  // TimelineOptions.windowDays (relative to each iterated day, not to real "now").
  const opts = { recencyWindowDays: 30, nowIso: '2024-10-31' };
  const r = computeBaseCalc(parties, rows, ELECTION, opts);
  assert.equal(r.includedPolls, 2);
  const solo = computeBaseCalc(parties, rows.filter((row) => row.id === '3' || row.id === '4'), ELECTION).results;
  for (const s of solo) assert.ok(Math.abs(r.results.find((x) => x.partyId === s.partyId)!.percentage - s.percentage) < 1e-9);
});

test('recencyWindowDays leaves other options (cutoffDate, divisor) unaffected when unset', () => {
  const r = computeBaseCalc(parties, rows, ELECTION);
  assert.equal(r.includedPolls, 4); // default fully-cumulative behavior is unchanged
});
