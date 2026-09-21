import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadGeometry, isParticipant } from '../src/lib/geo/loadGeo';
import { loadBaseline, parseBaselineCsv, usHouseBaseline } from '../src/lib/geo/baselines';
import { matchPartiesToBaseline } from '../src/lib/geo/partyMatch';
import { buildReturnsPlan, snapshotAt, unitsFromBaseline, regionalExpectations, swingRows, isTwoPartyBaseline, shiftDisplay } from '../src/lib/geo/returns';
import { inferPreset, resolveScene } from '../src/lib/geo/presets';
import { STATE_PVI_2024_FALLBACK, HOUSE_APPORTIONMENT } from '../src/lib/midterms/stateGrid';
import type { Party } from '../src/lib/types';

const fetchJson = async (url: string) => JSON.parse(fs.readFileSync(path.join('public', url.replace(/^\/+/, '')), 'utf8'));
const party = (id: string, name = id, extra: Partial<Party> = {}): Party => ({ id, name, shortName: name, color: '#888', ...extra });

test('every preset loads with normalised { id, name } features and the right unit counts', async () => {
  const expected: Record<string, number> = { 'de-wahlkreise': 299, 'sk-obce': 2927, 'us-house': 435, 'bg-provinces': 28 };
  for (const [id, n] of Object.entries(expected)) {
    const g = await loadGeometry(id, fetchJson);
    assert.equal(g.features.length, n, id);
    assert.ok(g.features.every((f) => f.properties.id && f.properties.name), `${id}: id+name`);
  }
  const us = await loadGeometry('us-states', fetchJson);
  assert.ok(us.features.length >= 51);
  assert.ok(us.features.find((f) => f.properties.id === 'PA' && f.properties.name === 'Pennsylvania'));
});

test('US House ids line up with the apportionment used by the House forecast', async () => {
  const g = await loadGeometry('us-house', fetchJson);
  for (const [st, seats] of Object.entries(HOUSE_APPORTIONMENT)) {
    const ids = g.features.filter((f) => f.properties.group === st).map((f) => f.properties.id);
    assert.equal(ids.length, seats, `${st} has ${ids.length} shapes, apportionment says ${seats}`);
  }
  assert.ok(g.features.find((f) => f.properties.id === 'AK-0'), 'at-large is district 0');
});

test('Germany baseline reproduces the official 2025 national Zweitstimmen result', async () => {
  const b = await loadBaseline('de-wahlkreise', fetchJson);
  assert.equal(b.kind, 'measured');
  assert.equal(Object.keys(b.regions).length, 299);
  const pct = (k: string) => b.national[k] * 100;
  assert.ok(Math.abs(pct('union') - 28.5) < 0.1);
  assert.ok(Math.abs(pct('afd') - 20.8) < 0.1);
  assert.ok(Math.abs(pct('spd') - 16.4) < 0.1);
  assert.ok(Math.abs(pct('bsw') - 5.0) < 0.1);
  for (const r of Object.values(b.regions)) assert.ok(Math.abs(Object.values(r.shares).reduce((a, x) => a + x, 0) - 1) < 1e-6);
});

test('Slovakia baseline covers every obec and has Smer/PS/Hlas on top', async () => {
  const b = await loadBaseline('sk-obce', fetchJson);
  assert.equal(Object.keys(b.regions).length, 2926);
  const top = Object.entries(b.national).sort((a, c) => c[1] - a[1]).slice(0, 3).map((x) => x[0]);
  assert.deepEqual(top, ['smersd', 'ps', 'hlassd']);
  const g = await loadGeometry('sk-obce', fetchJson);
  const withData = g.features.filter((f) => b.regions[f.properties.id]).length;
  assert.ok(withData >= 2926, `only ${withData} shapes joined`);
});

test('party matching: German, Slovak and US headers find their baseline key', async () => {
  const de = await loadBaseline('de-wahlkreise', fetchJson);
  const m = matchPartiesToBaseline(['Union', 'AfD', 'SPD', 'Grüne', 'Linke', 'BSW', 'FDP', 'FW', 'Others'].map((n) => party(n.toLowerCase().replace('ü', 'u'), n)), de.keys);
  assert.deepEqual(m, { union: 'union', afd: 'afd', spd: 'spd', grune: 'gruene', linke: 'linke', bsw: 'bsw', fdp: 'fdp', fw: 'fw', others: 'others' });
  const sk = await loadBaseline('sk-obce', fetchJson);
  const m2 = matchPartiesToBaseline(['Smer–SD', 'PS', 'Hlas–SD', 'KDH', 'SaS', 'OĽaNO', 'Republika', 'Aliancia', 'Slovensko'].map((n) => party(n.toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''), n)), sk.keys);
  assert.equal(m2.smersd, 'smersd'); assert.equal(m2.ps, 'ps'); assert.equal(m2.hlassd, 'hlassd');
  assert.equal(m2.kdh, 'kdh'); assert.equal(m2.sas, 'sas'); assert.equal(m2.olano, 'olano'); assert.equal(m2.aliancia, 'aliancia');
  assert.equal(m2.slovensko, null, '"Slovensko" must not steal OĽaNO once OĽaNO already matched');
  const us = matchPartiesToBaseline([party('jonossoffdemocratic', 'Jon Ossoff (D)', { affiliation: 'D' }), party('mikecollinsrepublican', 'Mike Collins (R)', { affiliation: 'R' })], [{ key: 'D', label: 'Democratic' }, { key: 'R', label: 'Republican' }]);
  assert.deepEqual(us, { jonossoffdemocratic: 'D', mikecollinsrepublican: 'R' });
});

test('regional expectations: vote-weighted mean lands back on the aggregate (guide III.II, recentred)', () => {
  const ids = ['a', 'b', 'c'];
  const base = { a: 0.45, b: 0.4, c: 0.15 };
  const units = Array.from({ length: 50 }, (_, i) => ({ votes: 100 + i * 37, prev: { a: 0.2 + (i % 10) * 0.06, b: 0.6 - (i % 10) * 0.05, c: 0.2 - (i % 10) * 0.01 } }));
  const prevNat = { a: 0.38, b: 0.4, c: 0.12 };
  const exp = regionalExpectations(ids, base, units, prevNat);
  const w = units.reduce((a, u) => a + u.votes, 0);
  for (const id of ids) {
    const mean = exp.reduce((a, e, i) => a + e[id as 'a'] * units[i].votes, 0) / w;
    assert.ok(Math.abs(mean - base[id as 'a']) < 0.002, `${id}: ${mean}`);
  }
  assert.ok(exp[0].a < exp[9].a, 'regional lean is preserved');
});

test('Germany end-to-end: 299 Wahlkreise, national tally ≈ aggregate, deterministic, playback monotone', async () => {
  const b = await loadBaseline('de-wahlkreise', fetchJson);
  const g = await loadGeometry('de-wahlkreise', fetchJson);
  const parties = ['Union', 'AfD', 'SPD', 'Grüne', 'Linke', 'BSW', 'FDP', 'FW', 'Others'].map((n) => party(n.toLowerCase().replace('ü', 'u'), n));
  const mapping = matchPartiesToBaseline(parties, b.keys);
  // a hypothetical poll average, deliberately different from the 2025 result
  const base = { union: 0.26, afd: 0.26, spd: 0.14, grune: 0.11, linke: 0.11, bsw: 0.04, fdp: 0.04, fw: 0.01, others: 0.03 };
  const { units, prevNational } = unitsFromBaseline(g.features.map((f) => f.properties), b, mapping);
  const ids = parties.map((p) => p.id);
  const plan = buildReturnsPlan(ids, base, units, prevNational, { seed: 'de-test' });
  const again = buildReturnsPlan(ids, base, units, prevNational, { seed: 'de-test' });
  assert.deepEqual(plan.units[7].final, again.units[7].final, 'seeded => reproducible');

  const end = snapshotAt(plan, 1);
  assert.equal(end.regionsComplete, 299);
  for (const id of ids) {
    const got = end.totals[id] / end.reportedVotes;
    assert.ok(Math.abs(got - (base as Record<string, number>)[id]) < 0.012, `${id}: got ${got.toFixed(3)} want ${(base as Record<string, number>)[id]}`);
  }
  assert.equal(snapshotAt(plan, 0).reportedVotes, 0);
  assert.equal(Object.values(end.leads).reduce((a, b) => a + b, 0), 299, 'every Wahlkreis is led by exactly one party');
  assert.ok(end.leads.afd > 40 && end.leads.union > 40, 'lead counts follow the regional pattern');
  let prev = -1, prevDone = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const s = snapshotAt(plan, Math.min(1, t));
    assert.ok(s.reportedVotes >= prev - 1e-6 && s.regionsComplete >= prevDone, 'never un-reports');
    prev = s.reportedVotes; prevDone = s.regionsComplete;
  }
  // regional lean survived: a Saxon Wahlkreis should lean AfD far more than a Hamburg one
  const share = (name: RegExp) => { const u = plan.units.find((x) => name.test(x.name))!; return u.expected.afd; };
  assert.ok(share(/Bautzen/i) > share(/Hamburg-Altona/i) + 0.1);
});

test('Slovakia end-to-end at obec level: 2,926 units play back and total to the aggregate', async () => {
  const b = await loadBaseline('sk-obce', fetchJson);
  const g = await loadGeometry('sk-obce', fetchJson);
  const parties = ['Smer–SD', 'PS', 'Hlas–SD', 'KDH', 'SaS', 'OĽaNO', 'Republika', 'SNS'].map((n) => party(n.toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''), n));
  const mapping = matchPartiesToBaseline(parties, b.keys);
  const base = { smersd: 0.21, ps: 0.2, hlassd: 0.14, kdh: 0.08, sas: 0.06, olano: 0.07, republika: 0.06, sns: 0.05 };
  const norm = Object.values(base).reduce((a, x) => a + x, 0);
  const nb = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v / norm]));
  const feats = g.features.filter((f) => b.regions[f.properties.id]);
  const { units, prevNational } = unitsFromBaseline(feats.map((f) => f.properties), b, mapping);
  const plan = buildReturnsPlan(parties.map((p) => p.id), nb, units, prevNational, { seed: 'sk-test' });
  const t0 = Date.now();
  const end = snapshotAt(plan, 1);
  assert.ok(Date.now() - t0 < 500, 'snapshot of ~2.9k units must be fast enough for animation');
  assert.equal(end.regionsComplete, 2926);
  for (const p of parties) assert.ok(Math.abs(end.totals[p.id] / end.reportedVotes - nb[p.id as keyof typeof nb]) < 0.01, p.id);
});

test('scene resolution: a single-state US race drills into that state\'s House districts', async () => {
  const s = resolveScene({ presetId: 'us-states', participants: ['GA'] });
  assert.equal(s.presetId, 'us-house');
  assert.equal(s.drilled, true);
  const g = await loadGeometry(s.presetId, fetchJson);
  assert.equal(g.features.filter((f) => isParticipant(f, s.participants)).length, 14);
  assert.equal(resolveScene({ presetId: 'us-states', participants: 'all' }).drilled, false);
  assert.equal(resolveScene({ presetId: 'de-wahlkreise', participants: ['Bayern'] }).presetId, 'de-wahlkreise');
  const ge = await loadGeometry('de-wahlkreise', fetchJson);
  assert.ok(ge.features.filter((f) => isParticipant(f, ['Bayern'])).length === 47);
});

test('preset inference and pasted-CSV baselines', async () => {
  assert.equal(inferPreset('Germany'), 'de-wahlkreise');
  assert.equal(inferPreset('Slovakia'), 'sk-obce');
  assert.equal(inferPreset('Bulgaria'), 'bg-provinces');
  assert.equal(inferPreset('United States'), 'us-states');
  assert.equal(inferPreset('Narnia'), null);
  const g = await loadGeometry('bg-provinces', fetchJson);
  const { baseline, unmatched } = parseBaselineCsv('Province,GERB,PP-DB,votes\nVarna,30,20,250000\nsofia (city),25,35,400000\nAtlantis,1,1,5', g.features, 'bg-provinces');
  assert.deepEqual(unmatched, ['Atlantis']);
  assert.equal(baseline.regions['BG-VAR'].votes, 250000);
  assert.ok(Math.abs(baseline.regions['BG-VAR'].shares.gerb - 0.6) < 1e-9);
  assert.ok(baseline.regions['BG-SOF']);
});

test('modelled House baseline is deterministic and anchored on the state margin', () => {
  const a = usHouseBaseline(STATE_PVI_2024_FALLBACK, false);
  const b = usHouseBaseline(STATE_PVI_2024_FALLBACK, false);
  assert.deepEqual(a.regions['PA-8'], b.regions['PA-8']);
  assert.equal(Object.keys(a.regions).length, 435);
  assert.equal(a.kind, 'modelled');
});

test('baseline shifts are COMPLETE: every region\'s previous shares sum to 1 across the race parties, Others included', async () => {
  const sk = await loadBaseline('sk-obce', fetchJson);
  const skGeo = await loadGeometry('sk-obce', fetchJson);
  const skParties = ['Smer–SD', 'PS', 'Hlas–SD', 'KDH', 'SaS', 'OĽaNO', 'Republika', 'SNS', 'Others'].map((n) => party(n.toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''), n));
  const skMap = matchPartiesToBaseline(skParties, sk.keys);
  assert.equal(skMap.others, '__rest__', 'Others maps to the residual bucket when the baseline has no such column');
  const { units, prevNational } = unitsFromBaseline(skGeo.features.map((f) => f.properties), sk, skMap);
  for (const u of units.filter((x) => x.prev)) {
    const sum = Object.values(u.prev!).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${u.name}: previous shares sum to ${sum}`);
  }
  // 25 parties in the file, 8 named in the poll table -> a real, non-trivial Others share (about 20% in 2023)
  assert.ok(prevNational.others! > 0.1 && prevNational.others! < 0.35, `Others previous = ${prevNational.others}`);
  const named = skParties.filter((p) => p.id !== 'others').reduce((a, p) => a + prevNational[p.id]!, 0);
  assert.ok(Math.abs(named + prevNational.others! - 1) < 1e-9);

  const de = await loadBaseline('de-wahlkreise', fetchJson);
  const deGeo = await loadGeometry('de-wahlkreise', fetchJson);
  const deParties = ['Union', 'AfD', 'SPD', 'Greens', 'Linke', 'Others'].map((n) => party(n.toLowerCase(), n)); // BSW, FDP, FW not named -> they are Others
  const deMap = matchPartiesToBaseline(deParties, de.keys);
  const d = unitsFromBaseline(deGeo.features.map((f) => f.properties), de, deMap);
  for (const u of d.units) assert.ok(Math.abs(Object.values(u.prev!).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(d.prevNational.others! > 0.12, 'BSW+FDP+FW+minor parties were folded into Others');
});

test('a single-state race leans districts against the STATE, not the country', async () => {
  const b = await loadBaseline('us-house', fetchJson);
  const g = await loadGeometry('us-house', fetchJson);
  const parties = [party('d', 'Ossoff (D)', { affiliation: 'D' }), party('r', 'Collins (R)', { affiliation: 'R' }), party('others', 'Others')];
  const map = matchPartiesToBaseline(parties, b.keys);
  const ga = g.features.filter((f) => f.properties.group === 'GA').map((f) => f.properties);
  const { units, prevNational } = unitsFromBaseline(ga, b, map);
  const mean = units.reduce((a, u) => a + u.prev!.d * u.votes, 0) / units.reduce((a, u) => a + u.votes, 0);
  assert.ok(Math.abs(prevNational.d! - mean) < 1e-9, 'reference = the participating districts\' own weighted mean');
  const usMean = b.national.D;
  assert.ok(Math.abs(prevNational.d! - usMean) > 0.005, 'and it differs from the national figure, which is what would have double-counted Georgia\'s own lean');
});

test('two-party baselines are compared like-for-like: poll undecideds do not show up as a phantom shift', () => {
  // 2024: 49/51 two-party. Poll average: 47/44 with 9% undecided/other -> two-party 51.6/48.4. That is a +2.6 shift for D, not −2 and −7.
  const rows = swingRows(['d', 'r', 'others'], { d: 0.47, r: 0.44, others: 0.09 }, { d: 'D', r: 'R', others: '__rest__' }, { d: 0.49, r: 0.51, others: 0 }, { twoParty: true });
  const d = rows.find((r) => r.partyId === 'd')!, r = rows.find((x) => x.partyId === 'r')!, o = rows.find((x) => x.partyId === 'others')!;
  assert.ok(Math.abs(d.shift! * 100 - 2.6) < 0.1 && Math.abs(r.shift! * 100 + 2.6) < 0.1, `D ${d.shift}, R ${r.shift}`);
  assert.ok(Math.abs(d.now + r.now - 1) < 1e-9 && Math.abs(d.previous! + r.previous! - 1) < 1e-9);
  assert.equal(o.shift, undefined);
  assert.ok(isTwoPartyBaseline([{ key: 'D' }, { key: 'R' }]) && !isTwoPartyBaseline([{ key: 'union' }, { key: 'afd' }]));
});

test('tooltip rows: two-party baselines compare D and R as a share of the pair; Others carries no shift', () => {
  const rows = shiftDisplay(['d', 'r', 'others'], { d: 0.41, r: 0.5, others: 0.09 }, { d: 0.45, r: 0.55, others: 0 }, { d: 'D', r: 'R', others: '__rest__' }, true);
  assert.ok(Math.abs(rows.d.now + rows.r.now - 1) < 1e-9);
  assert.ok(Math.abs(rows.d.delta! - (41 / 91 - 0.45) * 100) < 1e-9);
  assert.equal(rows.others.before, undefined);
  const plain = shiftDisplay(['a', 'b'], { a: 0.3, b: 0.7 }, { a: 0.2, b: 0.8 }, { a: 'x', b: 'y' }, false);
  assert.ok(Math.abs(plain.a.delta! - 10) < 1e-9);
});
