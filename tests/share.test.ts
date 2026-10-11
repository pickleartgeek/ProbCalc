import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRace, decodeRace } from '../src/lib/share';
import type { ElectionConfig, ParsedPollData } from '../src/lib/types';

const config: ElectionConfig = {
  id: 'x', title: 'Test race', region: 'Slovakia', electionDate: '2027-09-30', votingSystem: 'DHondt',
  parties: [{ id: 'a', name: 'Alpha', shortName: 'A', color: '#ff0000' }, { id: 'b', name: 'Beta', shortName: 'B', color: '#0000ff', affiliation: 'D' }],
  sim: { simulations: 1000, beta: 1, dateWeighting: { enabled: true, divisor: 100, cutoffDate: '2026-01-01', minSampleSize: 500, maxSampleSize: null, dateBasis: 'end', recencyWindowDays: 90 } },
};
const rows = Array.from({ length: 120 }, (_, i) => ({
  id: `r${i}`, firm: `Firm ${i % 7}`, fieldworkStart: '2026-05-01', fieldworkEnd: '2026-05-03', fieldworkRaw: '2026-05-03',
  sampleSize: 1000 + i, values: { a: 30 + (i % 5), b: 25 - (i % 3) },
}));
const pollData: ParsedPollData = { parties: config.parties, rows, warnings: [], format: 'wikitext' };

test('a race survives encode -> decode', async () => {
  const out = await decodeRace(await encodeRace(config, pollData));
  assert.deepEqual(out.config, config);
  assert.equal(out.pollData.rows.length, 120);
  assert.deepEqual(out.pollData.rows[7].values, rows[7].values);
  assert.equal(out.pollData.rows[7].sampleSize, rows[7].sampleSize);
  assert.equal(out.pollData.format, 'wikitext');
});

test('120 polls fit comfortably in a URL', async () => {
  const payload = await encodeRace(config, pollData);
  assert.ok(payload.length < 4000, `payload was ${payload.length} chars`);
});

test('garbage and truncated links are rejected with a friendly error', async () => {
  await assert.rejects(decodeRace('not-a-real-payload'), /damaged|different version/);
  const good = await encodeRace(config, pollData);
  await assert.rejects(decodeRace(good.slice(0, 40)), /damaged|different version/);
});

test('hostile content is sanitised, not trusted', async () => {
  const evil = { ...config, title: 'x'.repeat(5000), parties: [{ id: 'a', name: '<img src=x onerror=alert(1)>', shortName: 'A', color: 'url(javascript:alert(1))' }] } as unknown as ElectionConfig;
  const out = await decodeRace(await encodeRace(evil, { ...pollData, parties: evil.parties }));
  assert.equal(out.config.title.length, 200);
  assert.equal(out.config.parties[0].color, '#8994ac');
});

test('a decompression bomb is refused', async () => {
  // ~6 MB of JSON that deflates to a few KB: tiny link, huge inflated size
  const json = JSON.stringify({ v: 1, c: config, f: 'plain', p: [], r: [], pad: 'A'.repeat(6_000_000) });
  const stream = new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const payload = Buffer.from(bytes).toString('base64url');
  assert.ok(payload.length < 20_000, 'the bomb itself is small');
  await assert.rejects(decodeRace(payload), /too large/);
});
