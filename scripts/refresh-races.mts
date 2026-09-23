#!/usr/bin/env node
// Keeps public/data/races/<id>.json fresh — the bundled fallback the app drops to when a browser cannot reach
// Wikipedia live (see src/lib/races/loader.ts). Run by the deploy workflow on every push and on the daily cron:
//
//   npx tsx scripts/refresh-races.mts              fetch every pre-built race from Wikipedia and write real files
//   npx tsx scripts/refresh-races.mts --retry      re-fetch ONLY the races the previous run queued after a transient error
//                                                  (429 / 5xx / timeout) — see scripts/lib/retry-queue.ts
//   npx tsx scripts/refresh-races.mts --seed-only  offline: write ILLUSTRATIVE seeds (marked synthetic) for gallery
//                                                  races that have no file yet; never overwrites a real file
//
// Rules that keep this safe to run unattended:
//   * a failed fetch never deletes or downgrades an existing file
//   * a real (non-synthetic) file always replaces a synthetic seed
//   * exit code is 0 even if Wikipedia is unreachable — the deploy must not fail because of a poll page

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWikipediaPolling } from '../src/lib/mediawikiApi';
import { parsePollData } from '../src/lib/parser';
import { hasUsablePolls, type FallbackFile } from '../src/lib/races/loader';
import { allRaceDefs, GALLERY_RACES, GROUP_COUNTRY } from '../src/lib/races/registry';
import { seedFor } from './lib/seed-polls';
import { isRetryRun, isTransient, readQueue, writeQueue } from './lib/retry-queue';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'races');
const seedOnly = process.argv.includes('--seed-only');
const retryRun = isRetryRun() && !seedOnly;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const readExisting = (id: string): FallbackFile | null => {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, `${id}.json`), 'utf8')); } catch { return null; }
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let defs = seedOnly ? GALLERY_RACES : allRaceDefs();
  if (retryRun) {
    const queued = new Set(readQueue('races'));
    defs = defs.filter((d) => queued.has(d.id));
    log(`retry run: ${defs.length} queued race(s)${defs.length ? ` — ${defs.map((d) => d.id).join(', ')}` : ''}`);
  }
  const retryLater: string[] = [];
  let live = 0, seeded = 0, kept = 0, failed = 0;
  for (const def of defs) {
    const existing = readExisting(def.id);
    if (!seedOnly) {
      try {
        const res = await fetchWikipediaPolling(def.wikiPage, def.wiki, def.sectionHint, { searchQuery: def.searchQuery, timeoutMs: 20_000 });
        const parsed = parsePollData(res.wikitext, { country: GROUP_COUNTRY[def.group] });
        if (!hasUsablePolls(parsed)) throw new Error(`no usable polling table in "${res.sectionTitle}"`);
        const file: FallbackFile = {
          raceId: def.id, fetchedAt: new Date().toISOString(), pageTitle: res.pageTitle, sectionTitle: res.sectionTitle,
          note: res.resolvedFrom ? `Resolved "${res.resolvedFrom}" to "${res.pageTitle}"` : undefined,
          parsed: { parties: parsed.parties, rows: parsed.rows, warnings: parsed.warnings, format: parsed.format, meta: parsed.meta },
        };
        fs.writeFileSync(path.join(OUT, `${def.id}.json`), JSON.stringify(file));
        live++;
        log(`${def.id}: wrote ${parsed.rows.length} polls from "${res.pageTitle}"`);
        await new Promise((r) => setTimeout(r, 400)); // polite to the API
        continue;
      } catch (e) {
        failed++;
        const transient = isTransient(e);
        if (transient) retryLater.push(def.id);
        log(`${def.id}: live fetch failed (${e instanceof Error ? e.message : e}) — ${existing ? 'keeping existing file' : 'no file yet'}${transient ? ', will retry later' : ''}`);
      }
    }
    if (existing) { kept++; continue; }
    const seed = seedFor(def);
    if (seed) {
      fs.writeFileSync(path.join(OUT, `${def.id}.json`), JSON.stringify(seed));
      seeded++;
      log(`${def.id}: wrote illustrative seed (${seed.parsed.rows.length} synthetic polls)`);
    }
  }
  if (!seedOnly) writeQueue('races', retryLater);
  log(`done — live ${live}, seeded ${seeded}, kept ${kept}, failed fetches ${failed}${retryLater.length ? ` (${retryLater.length} queued for retry: ${retryLater.join(', ')})` : ''}`);
}
main().catch((e) => { console.error(e); process.exit(0); });
