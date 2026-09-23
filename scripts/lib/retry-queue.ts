// Shared by scripts/fetch-polls.mts and scripts/refresh-races.mts.
//
// When Wikipedia answers a poll fetch with a transient error (429 / 5xx / timeout / network), the script records
// that race's id in a small queue file instead of just moving on. The deploy workflow then waits an hour and runs
// the same scripts again with `--retry`, which processes ONLY the queued ids (see .github/workflows/deploy.yml).
//
//   .cache/retry/polls.json   { "ids": ["sen-ga", ...], "updatedAt": "..." }   <- fetch-polls.mts
//   .cache/retry/races.json   { "ids": [...], "updatedAt": "..." }             <- refresh-races.mts
//
// Permanent failures (page missing, no poll table on it) are deliberately NOT queued — retrying them is pointless.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WikiFetchError } from '../../src/lib/mediawikiApi';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const retryDir = (): string => process.env.RETRY_DIR ?? path.join(ROOT, '.cache', 'retry');
const queueFile = (name: string) => path.join(retryDir(), `${name}.json`);

/** True for failures that are worth trying again later: rate limits, server errors, timeouts, network blips. */
export function isTransient(e: unknown): boolean {
  if (!(e instanceof WikiFetchError)) return false;
  if (e.kind === 'rate-limit' || e.kind === 'timeout' || e.kind === 'network') return true;
  return e.kind === 'http' && (e.status ?? 0) >= 500;
}

/** Ids queued by an earlier run. A missing or unreadable file means "nothing queued" — never "everything". */
export function readQueue(name: string): string[] {
  try {
    const j = JSON.parse(fs.readFileSync(queueFile(name), 'utf8'));
    return Array.isArray(j?.ids) ? j.ids.map(String) : [];
  } catch {
    return [];
  }
}

/** Replaces the queue (an empty list is written too, so a stale queue can never linger). */
export function writeQueue(name: string, ids: string[]): void {
  fs.mkdirSync(retryDir(), { recursive: true });
  fs.writeFileSync(queueFile(name), JSON.stringify({ ids: [...new Set(ids)], updatedAt: new Date().toISOString() }, null, 1));
}

/** `--retry` = only re-fetch what the previous run queued. */
export const isRetryRun = (argv: string[] = process.argv): boolean => argv.includes('--retry');
