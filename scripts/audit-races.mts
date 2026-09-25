// Audits what every pre-built race would show RIGHT NOW, straight from Wikipedia — run it before trusting a deploy:
//
//   npx tsx scripts/audit-races.mts                  all 72 races (~1 request/second, so ~2 minutes)
//   npx tsx scripts/audit-races.mts --only=sen-ak,gov-me
//
// For each race it runs the exact pipeline the site uses (fetch → pick table → shape → refuse placeholders) and prints
// which candidates/parties came out, how many polls count, and the newest poll. Any Senate or governor race whose only
// polling is "Generic Democrat / Generic Republican" is reported as GENERIC-ONLY (the site shows no data for it rather
// than a placeholder). Exits 1 if it finds one, so it can gate CI.

import { fetchWikipediaPolling, WikiFetchError } from '../src/lib/mediawikiApi';
import { parsePollData } from '../src/lib/parser';
import { assertRealCandidates, shapeForRace } from '../src/lib/races/loader';
import { allRaceDefs, parseOptionsFor } from '../src/lib/races/registry';

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
const defs = allRaceDefs().filter((d) => !only || only.includes(d.id));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row { id: string; status: string; parties: string; polls: number; newest: string; detail: string }
const rows: Row[] = [];

for (const def of defs) {
  const row: Row = { id: def.id, status: '', parties: '', polls: 0, newest: '', detail: '' };
  try {
    const res = await fetchWikipediaPolling(def.wikiPage, def.wiki, def.sectionHint, { searchQuery: def.searchQuery, timeoutMs: 20_000 });
    const parsed = shapeForRace(parsePollData(res.wikitext, parseOptionsFor(def)), def);
    row.parties = parsed.parties.map((p) => p.name).join(' / ');
    const counted = parsed.rows.filter((r) => !r.isElectionResult && r.fieldworkEnd && r.sampleSize && (!def.cutoffDate || r.fieldworkEnd >= def.cutoffDate));
    row.polls = counted.length;
    row.newest = counted.reduce((m, r) => (r.fieldworkEnd > m ? r.fieldworkEnd : m), '');
    row.detail = res.sectionTitle;
    assertRealCandidates(parsed, def);
    row.status = row.polls === 0 ? 'NO-POLLS' : row.polls < 3 ? 'THIN' : 'OK';
  } catch (e) {
    if (e instanceof WikiFetchError && /placeholder/i.test(e.message)) { row.status = 'GENERIC-ONLY'; row.detail = e.message; }
    else if (e instanceof WikiFetchError && e.kind === 'no-table') { row.status = 'NO-POLLS'; row.detail = e.message; }
    else { row.status = `FETCH-FAIL${e instanceof WikiFetchError ? ` (${e.kind})` : ''}`; row.detail = e instanceof Error ? e.message : String(e); }
  }
  rows.push(row);
  console.log(`${row.status.padEnd(14)} ${row.id.padEnd(11)} ${String(row.polls).padStart(3)} polls  newest ${row.newest || '—'.padEnd(10)}  ${row.parties || row.detail}`);
  await sleep(1000);
}

const count = (s: string) => rows.filter((r) => r.status.startsWith(s)).length;
console.log(`\n${rows.length} races: ${count('OK')} OK, ${count('THIN')} thin (<3 polls), ${count('NO-POLLS')} no polls, ${count('GENERIC-ONLY')} generic-only, ${count('FETCH-FAIL')} fetch failed`);
for (const r of rows.filter((x) => x.status === 'GENERIC-ONLY')) console.log(`  GENERIC-ONLY  ${r.id}: ${r.detail}`);
for (const r of rows.filter((x) => x.status.startsWith('FETCH-FAIL'))) console.log(`  FETCH-FAIL    ${r.id}: ${r.detail}  (rerun with --only=${r.id})`);
process.exit(count('GENERIC-ONLY') > 0 ? 1 : 0);
