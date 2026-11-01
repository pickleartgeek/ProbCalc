import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPersonName, fetchWikiImage, wikiImageUrl, type FetchLike } from '../src/lib/infobox/wikiImage';

const reply = (pages: unknown): FetchLike => async () => ({ ok: true, json: async () => ({ query: { pages } }) });

test('cleanPersonName strips a trailing party tag only', () => {
  assert.equal(cleanPersonName('Jon Ossoff (D)'), 'Jon Ossoff');
  assert.equal(cleanPersonName('  Mike   Collins (R) '), 'Mike Collins');
  assert.equal(cleanPersonName('Labour (Starmer)'), 'Labour (Starmer)');
});

test('wikiImageUrl asks for CORS, lead images and a thumbnail', () => {
  const u = new URL(wikiImageUrl('Keir Starmer'));
  assert.equal(u.searchParams.get('origin'), '*');
  assert.equal(u.searchParams.get('gsrsearch'), 'Keir Starmer');
  assert.match(u.searchParams.get('prop')!, /pageimages/);
});

test('fetchWikiImage takes the best-ranked hit that has an image, and names the Commons file', async () => {
  const hit = await fetchWikiImage('Keir Starmer', reply({
    1: { title: 'Starmer ministry', index: 1 },
    2: { title: 'Keir Starmer', index: 2, pageimage: 'Keir_Starmer_2024.jpg', thumbnail: { source: 'https://upload.wikimedia.org/x.jpg' }, fullurl: 'https://en.wikipedia.org/wiki/Keir_Starmer' },
    3: { title: 'Other', index: 3, pageimage: 'Other.jpg', thumbnail: { source: 'https://upload.wikimedia.org/o.jpg' } },
  }));
  assert.equal(hit?.title, 'Keir Starmer');
  assert.equal(hit?.file, 'Keir Starmer 2024.jpg');
  assert.equal(hit?.url, 'https://upload.wikimedia.org/x.jpg');
});

test('fetchWikiImage degrades to null: no image, bad status, thrown network error, empty query', async () => {
  assert.equal(await fetchWikiImage('x', reply({ 1: { title: 'No image', index: 1 } })), null);
  assert.equal(await fetchWikiImage('x', async () => ({ ok: false, json: async () => ({}) })), null);
  assert.equal(await fetchWikiImage('x', async () => { throw new Error('offline'); }), null);
  assert.equal(await fetchWikiImage('   ', reply({})), null);
});
