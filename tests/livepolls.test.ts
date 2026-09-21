import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePollData } from '../src/lib/parser';
import { computeBaseCalc } from '../src/lib/baseCalc';
import { marginFromResults, type PollFile } from '../src/lib/midterms/livePollData';

// exactly what scripts/fetch-polls.mts writes for a US race, built from a Wikipedia-shaped table
const wiki = `{| class="wikitable"
|-
! Poll source
! Date(s)<br />administered
! Sample<br />size
! [[Jon Ossoff]]<br /><small>Democratic</small>
! [[Mike Collins]]<br /><small>Republican</small>
! Other /<br />Undecided
|-
| Emerson
| Sep 2–5, 2026
| 1,000 (LV)
| 48%
| 44%
| 8%
|-
| Quinnipiac
| Sep 10–14, 2026
| 1,200 (RV)
| 47%
| 45%
| 8%
|}`;

function fileFrom(text: string): PollFile {
  const parsed = parsePollData(text);
  const { results, includedPolls } = computeBaseCalc(parsed.parties, parsed.rows, '2026-11-03');
  return { raceId: 'sen-ga', asOf: '2026-09-20', includedPolls, sourcePage: 'x', parties: parsed.parties, results };
}

test('the live margin is found on candidate-named columns (this returned null for every US race)', () => {
  const m = marginFromResults(fileFrom(wiki));
  assert.ok(m !== null, 'margin must not be null');
  assert.ok(m! < 0 && m! > -6, `Ossoff (D) leads by a few points in the table above, got R−D = ${m}`);
});

test('files written before affiliation existed still work via the classic ids and "(D)" names', () => {
  const old: PollFile = {
    raceId: 'x', asOf: '', includedPolls: 2, sourcePage: '',
    parties: [{ id: 'democrat', name: 'Democrat' }, { id: 'republican', name: 'Republican' }],
    results: [{ partyId: 'democrat', percentage: 0.45 }, { partyId: 'republican', percentage: 0.5 }],
  };
  assert.ok(Math.abs(marginFromResults(old)! - 5) < 1e-9);
  const named: PollFile = { ...old, parties: [{ id: 'a', name: 'Casey (D)' }, { id: 'b', name: 'McCormick (R)' }], results: [{ partyId: 'a', percentage: 0.46 }, { partyId: 'b', percentage: 0.47 }] };
  assert.ok(Math.abs(marginFromResults(named)! - 1) < 1e-9);
});

test('a non-US table (no D/R) gives null rather than a made-up margin', () => {
  const f: PollFile = { raceId: 'de', asOf: '', includedPolls: 1, sourcePage: '', parties: [{ id: 'afd', name: 'AfD' }, { id: 'spd', name: 'SPD' }], results: [{ partyId: 'afd', percentage: 0.25 }, { partyId: 'spd', percentage: 0.15 }] };
  assert.equal(marginFromResults(f), null);
});
