#!/usr/bin/env node
// Run via tsx (already a devDependency): `npx tsx scripts/fetch-polls.mts`
//
// This is the automation half of the Build page's "Fetch from Wikipedia"
// button — same MediaWiki Action API client, same wikitext parser, same
// BaseCalc math — just triggered on a schedule instead of a click, for the
// races listed in tracked-races.json. Output lands in public/data/polls/
// and gets picked up by the normal Vite build, so wiring this into the
// deploy workflow's cron trigger is enough to keep it fresh with zero
// manual steps.
//
// Nothing in here is US-specific — fetchWikipediaPolling/parsePollData/
// computeBaseCalc all just operate on whatever Wikipedia page + party
// columns you point them at, so the same script works unchanged for a
// Slovak election page once that's the next thing on the list; only
// tracked-races.json's entries (and the electionDate) need to change.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWikipediaPolling } from '../src/lib/mediawikiApi';
import { parsePollData } from '../src/lib/parser';
import { computeBaseCalc } from '../src/lib/baseCalc';
import { isRetryRun, isTransient, readQueue, writeQueue } from './lib/retry-queue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TrackedRace {
  raceId: string;
  chamber: string;
  stateAbbr: string;
  wikiPage: string;
  electionDate: string;
  wiki?: string;
  sectionHint?: string;
}

// Positional args are [config] [outDir]; flags (--retry) are filtered out so they can't shift them.
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const CONFIG_PATH = positional[0] ?? path.join(__dirname, 'tracked-races.json');
const OUT_DIR = positional[1] ?? path.join(__dirname, '..', 'public', 'data', 'polls');

// `--retry`: only re-fetch the races the previous run queued after a transient error (429, 5xx, timeout…),
// merging the results into the existing index.json. See scripts/lib/retry-queue.ts.
const retryRun = isRetryRun();

type IndexEntry = { raceId: string; asOf: string; includedPolls: number; ok: boolean };

function log(...args: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

async function main() {
  let races: TrackedRace[] = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // In a retry run the index already describes every race from the first run; we only overwrite the entries we retry.
  let prior: IndexEntry[] = [];
  if (retryRun) {
    const queued = new Set(readQueue('polls'));
    races = races.filter((r) => queued.has(r.raceId));
    log(`retry run: ${races.length} queued race(s)${races.length ? ` — ${races.map((r) => r.raceId).join(', ')}` : ''}`);
    try { prior = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'index.json'), 'utf8')); } catch { /* no earlier index */ }
  }
  const index = new Map<string, IndexEntry>(prior.map((e) => [e.raceId, e]));
  const retryLater: string[] = [];
  let updated = 0;

  for (const race of races) {
    log(`${race.raceId}: fetching "${race.wikiPage}"…`);
    try {
      const { wikitext, sectionTitle } = await fetchWikipediaPolling(race.wikiPage, race.wiki, race.sectionHint);
      const parsed = parsePollData(wikitext);

      if (parsed.format === 'unknown' || parsed.parties.length === 0 || parsed.rows.length === 0) {
        log(`  ! could not extract a poll table from "${sectionTitle}" — skipping (leaving any previous data in place)`);
        index.set(race.raceId, { raceId: race.raceId, asOf: '', includedPolls: 0, ok: false });
        continue;
      }

      const { results, includedPolls, excludedPolls } = computeBaseCalc(
        parsed.parties,
        parsed.rows,
        race.electionDate
      );

      const asOf = new Date().toISOString();
      const output = {
        raceId: race.raceId,
        chamber: race.chamber,
        stateAbbr: race.stateAbbr,
        sourcePage: race.wikiPage,
        sourceSection: sectionTitle,
        asOf,
        parties: parsed.parties,
        results,
        includedPolls,
        excludedPolls,
        warnings: parsed.warnings,
      };

      fs.writeFileSync(path.join(OUT_DIR, `${race.raceId}.json`), JSON.stringify(output, null, 1));
      index.set(race.raceId, { raceId: race.raceId, asOf, includedPolls, ok: true });
      updated++;
      log(`  wrote ${race.raceId}.json — ${includedPolls} polls included, ${excludedPolls} excluded`);
    } catch (err) {
      const transient = isTransient(err);
      log(`  ! failed: ${err instanceof Error ? err.message : String(err)}${transient ? ' — will retry later' : ''}`);
      // Keep the earlier (good) entry if a retry fails again; only a first-run failure records ok:false.
      if (!index.get(race.raceId)?.ok) index.set(race.raceId, { raceId: race.raceId, asOf: '', includedPolls: 0, ok: false });
      if (transient) retryLater.push(race.raceId);
    }
    // Be a polite API citizen — a handful of races, no need to hammer Wikipedia.
    await new Promise((r) => setTimeout(r, 500));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify([...index.values()], null, 1));
  writeQueue('polls', retryLater);
  log(`done: ${updated}/${races.length} races updated${retryLater.length ? `, ${retryLater.length} queued for retry (${retryLater.join(', ')})` : ''}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
