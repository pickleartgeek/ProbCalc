import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WikiFetchError } from '../src/lib/mediawikiApi';
import { isRetryRun, isTransient, readQueue, writeQueue } from '../scripts/lib/retry-queue';

test('transient Wikipedia failures are queued for retry; permanent ones are not', () => {
  assert.equal(isTransient(new WikiFetchError('rate-limit', 'x', 429)), true);
  assert.equal(isTransient(new WikiFetchError('http', 'x', 503)), true);
  assert.equal(isTransient(new WikiFetchError('timeout', 'x')), true);
  assert.equal(isTransient(new WikiFetchError('network', 'x')), true);
  assert.equal(isTransient(new WikiFetchError('http', 'x', 404)), false);
  assert.equal(isTransient(new WikiFetchError('missing-page', 'x')), false);
  assert.equal(isTransient(new WikiFetchError('api', 'x')), false);
  assert.equal(isTransient(new Error('no usable polling table')), false);
});

test('the queue round-trips, de-duplicates, and a missing file means "nothing queued"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retryq-'));
  process.env.RETRY_DIR = dir;
  try {
    assert.deepEqual(readQueue('polls'), []);
    writeQueue('polls', ['sen-ga', 'gov-me', 'sen-ga']);
    assert.deepEqual(readQueue('polls'), ['sen-ga', 'gov-me']);
    writeQueue('polls', []);
    assert.deepEqual(readQueue('polls'), []);
    fs.writeFileSync(path.join(dir, 'races.json'), '{not json');
    assert.deepEqual(readQueue('races'), []);
  } finally {
    delete process.env.RETRY_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--retry is detected from argv', () => {
  assert.equal(isRetryRun(['node', 'x', '--retry']), true);
  assert.equal(isRetryRun(['node', 'x']), false);
});
