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

const CONFIG_PATH = process.argv[2] ?? path.join(__dirname, 'tracked-races.json');
const OUT_DIR = process.argv[3] ?? path.join(__dirname, '..', 'public', 'data', 'polls');

function log(...args: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

async function main() {
  const races: TrackedRace[] = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const index: { raceId: string; asOf: string; includedPolls: number; ok: boolean }[] = [];

  for (const race of races) {
    log(`${race.raceId}: fetching "${race.wikiPage}"…`);
    try {
      const { wikitext, sectionTitle } = await fetchWikipediaPolling(race.wikiPage, race.wiki, race.sectionHint);
      const parsed = parsePollData(wikitext);

      if (parsed.format === 'unknown' || parsed.parties.length === 0 || parsed.rows.length === 0) {
        log(`  ! could not extract a poll table from "${sectionTitle}" — skipping (leaving any previous data in place)`);
        index.push({ raceId: race.raceId, asOf: '', includedPolls: 0, ok: false });
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
      index.push({ raceId: race.raceId, asOf, includedPolls, ok: true });
      log(`  wrote ${race.raceId}.json — ${includedPolls} polls included, ${excludedPolls} excluded`);
    } catch (err) {
      log(`  ! failed: ${err instanceof Error ? err.message : String(err)}`);
      index.push({ raceId: race.raceId, asOf: '', includedPolls: 0, ok: false });
    }
    // Be a polite API citizen — a handful of races, no need to hammer Wikipedia.
    await new Promise((r) => setTimeout(r, 500));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 1));
  const okCount = index.filter((i) => i.ok).length;
  log(`done: ${okCount}/${races.length} races updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
