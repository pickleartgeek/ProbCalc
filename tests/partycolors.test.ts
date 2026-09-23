import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePollData } from '../src/lib/parser';
import { PARTY_COLORS } from '../src/data/partyColors';
const conf = (country: string, key: string) => PARTY_COLORS.find((e) => e.country === country && e.key === key)!.confidence;
import { applyPartyColors, detectCountry, registryColor, US_DEM, US_REP, countryFromRegion } from '../src/lib/partyRegistry';
import { onDark, backfillAffiliationFromCandidates } from '../src/lib/partyColors';
import type { Party } from '../src/lib/types';

const mk = (names: string[]): Party[] => names.map((n) => ({ id: n.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, ''), name: n, shortName: n, color: '#123456' }));
const table = (headers: string[], row: string[]) =>
  `{| class="wikitable"\n|-\n! Polling firm\n! Fieldwork date\n! Sample size\n${headers.map((h) => `! ${h}`).join('\n')}\n|-\n| Forsa\n| 1–2 Sep 2026\n| 1,000\n${row.map((v) => `| ${v}`).join('\n')}\n|}`;
const colorOf = (parties: Party[], name: string) => parties.find((p) => p.name === name)!.color;

test('Germany: every party gets its registry colour, and "Greens" is the German Greens', () => {
  const r = parsePollData(table(['Union', 'AfD', 'SPD', 'Greens', 'Linke', 'BSW', 'FDP', 'FW', 'Others'], ['26', '25', '14', '11', '10', '4', '3', '2', '5']));
  assert.equal(detectCountry(r.parties), 'DE');
  assert.equal(colorOf(r.parties, 'Union'), registryColor('DE', 'union'));
  assert.equal(colorOf(r.parties, 'AfD'), '#009EE0');
  assert.equal(colorOf(r.parties, 'SPD'), '#E3000F');
  assert.equal(colorOf(r.parties, 'Greens'), registryColor('DE', 'gruene'));
  assert.equal(colorOf(r.parties, 'Others'), '#A0A0A0');
});

test('Slovakia: real party columns resolve to registry colours, none fall through to the rotating palette', () => {
  const heads = ['Smer–SD', 'PS', 'Hlas–SD', 'KDH', 'SaS', 'OĽaNO', 'Republika', 'SNS', 'Demokrati', 'Aliancia', 'Others'];
  const r = parsePollData(table(heads, heads.map(() => '9')));
  assert.equal(detectCountry(r.parties), 'SK');
  assert.equal(colorOf(r.parties, 'Smer–SD'), registryColor('SK', 'smersd'));
  assert.equal(colorOf(r.parties, 'PS'), '#00BFFF');
  assert.equal(colorOf(r.parties, 'Hlas–SD'), registryColor('SK', 'hlassd'));
  assert.equal(colorOf(r.parties, 'OĽaNO'), registryColor('SK', 'olano'));
  const registryHexes = new Set(PARTY_COLORS.map((e) => e.color.toUpperCase()));
  for (const p of r.parties) assert.ok(registryHexes.has(p.color.toUpperCase()), `${p.name} kept a fallback colour ${p.color}`);
  // "Democrats" beside Slovak parties is Demokrati, not the US Democratic Party
  const d = applyPartyColors(mk(['Smer–SD', 'PS', 'Democrats']));
  assert.equal(colorOf(d, 'Democrats'), registryColor('SK', 'demokrati'));
});

test('Slovak wikitext with Hlas/Slovensko variants and a coalition column still resolves', () => {
  const r = parsePollData(table(['[[Direction – Social Democracy|Smer–SD]]', '[[Progressive Slovakia|PS]]', '[[Voice – Social Democracy|Hlas–SD]]', '[[Slovakia (political party)|Slovensko]]', '[[Christian Democratic Movement|KDH]]'], ['21', '20', '14', '9', '7']));
  assert.equal(colorOf(r.parties, 'Slovensko'), registryColor('SK', 'olano'));
  assert.equal(colorOf(r.parties, 'KDH'), registryColor('SK', 'kdh'));
});

test('United States: D and R use the standard party colours, extra candidates get distinguishable shades', () => {
  const r = parsePollData(`{| class="wikitable"\n|-\n! Poll source\n! Date(s) administered\n! Sample size\n! Jon Ossoff<br />Democratic\n! Mike Collins<br />Republican\n! Someone Else<br />Democratic\n|-\n| X\n| Sep 2–5, 2026\n| 800\n| 48\n| 46\n| 3\n|}`);
  assert.equal(r.parties[0].color, US_DEM);
  assert.equal(r.parties[1].color, US_REP);
  assert.notEqual(r.parties[2].color, US_DEM, 'a second Democrat must not be indistinguishable from the first');
  assert.equal(US_DEM, '#0015BC');
  assert.equal(US_REP, '#E81B23');
});

test('United Kingdom: Client / Area / Lead columns are metadata, parties get their colours, "Greens" is British beside Reform', () => {
  const t = `{| class="wikitable"\n|-\n! Pollster\n! Client\n! Area\n! Dates conducted\n! Sample size\n! Lab\n! Con\n! Reform\n! LD\n! Grn\n! SNP\n! PC\n! Others\n! Lead\n|-\n| YouGov\n| The Times\n| GB\n| 1–2 Sep 2026\n| 2,000\n| 20\n| 17\n| 29\n| 13\n| 12\n| 3\n| 1\n| 5\n| 9\n|}`;
  const r = parsePollData(t);
  assert.deepEqual(r.parties.map((p) => p.name), ['Lab', 'Con', 'Reform', 'LD', 'Grn', 'SNP', 'PC', 'Others']);
  assert.equal(r.rows[0].sampleSize, 2000);
  assert.equal(r.rows[0].fieldworkEnd, '2026-09-02');
  assert.equal(detectCountry(r.parties), 'UK');
  const c = Object.fromEntries(r.parties.map((p) => [p.name, p.color]));
  assert.deepEqual([c.Lab, c.Con, c.Reform, c.LD, c.Grn, c.SNP, c.PC], ['#E4003B', '#0087DC', '#12B6CF', '#FAA61A', '#02A95B', '#FDF38E', '#005B54']);
  const g = applyPartyColors(mk(['Greens', 'Reform UK', 'Labour']));
  assert.equal(colorOf(g, 'Greens'), registryColor('UK', 'green'));
  const de = applyPartyColors(mk(['Greens', 'AfD', 'SPD']));
  assert.equal(colorOf(de, 'Greens'), registryColor('DE', 'gruene'));
});

test('long UK headers get the standard short label instead of a truncated one', () => {
  const r = applyPartyColors([{ id: 'conservative', name: 'Conservative', shortName: 'Conser', color: '#000' }, { id: 'reformuk', name: 'Reform UK', shortName: 'Reform', color: '#000' }, { id: 'liberaldemocrats', name: 'Liberal Democrats', shortName: 'Libera', color: '#000' }] as Party[], 'UK');
  assert.deepEqual(r.map((p) => p.shortName), ['Con', 'Reform', 'LD']);
});

test('an explicit country hint beats detection; ambiguous names with no context are left alone', () => {
  assert.equal(colorOf(applyPartyColors(mk(['Greens']), 'UK'), 'Greens'), registryColor('UK', 'green'));
  assert.equal(colorOf(applyPartyColors(mk(['Greens']), 'US'), 'Greens'), registryColor('US', 'green'));
  assert.equal(colorOf(applyPartyColors(mk(['Greens'])), 'Greens'), '#123456', 'no context -> no guess');
  assert.equal(countryFromRegion('Scotland'), 'UK');
  assert.equal(countryFromRegion('Slovakia'), 'SK');
});

function dist(a: string, b: string) {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
test('within each country the main parties stay distinguishable on the dark UI', () => {
  const sets: Record<string, [string, string[]]> = {
    DE: ['DE', ['union', 'spd', 'afd', 'gruene', 'linke', 'fdp', 'bsw', 'fw']],
    SK: ['SK', ['smersd', 'ps', 'hlassd', 'kdh', 'sas', 'olano', 'republika', 'sns', 'demokrati', 'aliancia']],
    UK: ['UK', ['labour', 'conservative', 'reform', 'libdem', 'green', 'snp', 'plaid']],
    US: ['US', ['democratic', 'republican', 'libertarian', 'green']],
  };
  const bad: string[] = [];
  for (const [country, keys] of Object.values(sets)) {
    const cols = keys.map((k) => ({ k, c: onDark(registryColor(country as 'DE', k)) }));
    for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
      const d = dist(cols[i].c, cols[j].c);
      // two well-established colours may legitimately sit close (Conservative blue vs Reform teal); accuracy wins there
      const floor = conf(country, cols[i].k) === 'high' && conf(country, cols[j].k) === 'high' ? 45 : 55;
      if (d < floor) bad.push(`${country}: ${cols[i].k} ${cols[i].c} ~ ${cols[j].k} ${cols[j].c} (Δ${d.toFixed(0)})`);
    }
  }
  assert.deepEqual(bad, []);
});

test('onDark lifts colours that would vanish on the near-black UI and leaves visible ones alone', () => {
  const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  assert.ok(lum(onDark('#000000')) >= 0.1);
  assert.ok(lum(onDark('#0015BC')) >= 0.1);
  assert.equal(onDark('#FFED00'), '#FFED00');
  assert.equal(onDark('#E81B23'), '#E81B23');
  assert.equal(onDark(undefined), '#888888');
});

test('registry hygiene: keys unique per country, valid hex, and the unverified entries are listed', () => {
  const seen = new Set<string>();
  for (const e of PARTY_COLORS) {
    assert.match(e.color, /^#[0-9A-Fa-f]{6}$/, e.key);
    const id = `${e.country}/${e.key}`;
    assert.ok(!seen.has(id), `duplicate ${id}`);
    seen.add(id);
  }
  const unverified = PARTY_COLORS.filter((e) => e.confidence !== 'high').map((e) => `${e.country}/${e.key} [${e.confidence}] ${e.color}`);
  console.log(`\n  ${unverified.length} of ${PARTY_COLORS.length} registry colours are not marked high-confidence:\n  ` + unverified.join('\n  '));
});

test('backfillAffiliationFromCandidates colors a bare-surname column when the header gives no party word', () => {
  // Simulates the Maine case: Wikipedia's table lists "Jackson" and "Collins" as bare surname
  // columns with no "(D)"/"(R)" in the header, so buildPartyFromHeader falls back to an
  // arbitrary index-based color for both — the actual bug being fixed here.
  const wikitext = table(['Jackson', 'Collins'], ['48', '46']);
  const parsed = parsePollData(wikitext);
  const before = parsed.parties.find((p) => p.name === 'Jackson')!;
  assert.equal(before.affiliation, undefined); // confirms the header-word detector really did miss it

  const backfilled = backfillAffiliationFromCandidates(parsed.parties, { demCandidate: 'Troy Jackson', repCandidate: 'Susan Collins' });
  const jackson = backfilled.find((p) => p.name === 'Jackson')!;
  const collins = backfilled.find((p) => p.name === 'Collins')!;
  assert.equal(jackson.affiliation, 'D');
  assert.equal(jackson.color, US_DEM);
  assert.equal(collins.affiliation, 'R');
  assert.equal(collins.color, US_REP);
});

test('backfillAffiliationFromCandidates leaves already-detected affiliations and non-matching columns alone', () => {
  const wikitext = table(['Jon Ossoff Democratic', 'Someone Else'], ['48', '10']);
  const parsed = parsePollData(wikitext);
  const backfilled = backfillAffiliationFromCandidates(parsed.parties, { demCandidate: 'Jon Ossoff', repCandidate: 'Mystery Candidate' });
  // Ossoff was already correctly colored by header-word detection; backfill must not touch it
  const ossoff = backfilled.find((p) => p.name.includes('Ossoff'))!;
  assert.equal(ossoff.color, US_DEM);
  // "Someone Else" doesn't match "Mystery Candidate"'s surname, so it's left as a generic fallback color, not R
  const other = backfilled.find((p) => p.name === 'Someone Else')!;
  assert.equal(other.affiliation, undefined);
});

test('bundled gallery seeds carry registry colours (DE / SK / US / UK)', () => {
  const read = (id: string) => JSON.parse(fs.readFileSync(`public/data/races/${id}.json`, 'utf8')).parsed.parties as Party[];
  const de = read('de-next'); assert.equal(de.find((p) => p.name === 'Union')!.color, registryColor('DE', 'union'));
  const sk = read('sk-next'); assert.equal(sk.find((p) => p.name === 'PS')!.color, '#00BFFF'); assert.equal(sk.find((p) => p.name === 'Smer–SD')!.color, registryColor('SK', 'smersd'));
  const us = read('sen-ga'); assert.equal(us.find((p) => p.affiliation === 'D')!.color, US_DEM); assert.equal(us.find((p) => p.affiliation === 'R')!.color, US_REP);
  const uk = read('uk-next'); assert.equal(uk.find((p) => p.name === 'Labour')!.color, '#E4003B'); assert.equal(uk.find((p) => p.name === 'Reform UK')!.color, '#12B6CF');
});
