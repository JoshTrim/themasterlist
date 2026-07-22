const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanMusicName, pageMetadata, wikipediaArticle, createMetadataProvider } = require('../lib/providers/metadata');

const response = (body, { ok = true } = {}) => ({ ok, json: async () => body, text: async () => String(body) });

describe('metadata provider', () => {
  test('normalises featured artists and extracts safe page metadata', () => {
    assert.equal(cleanMusicName('Beyoncé feat. Jay-Z'), 'beyonce');
    assert.deepEqual(pageMetadata('<title>The Venue | Home</title><meta name="description" content="Live music"><meta property="og:image" content="photo.jpg">', 'Venue'), { title: 'The Venue', description: 'Live music', image: 'photo.jpg' });
  });

  test('finds artist genres using normalized names', async () => {
    const provider = createMetadataProvider({ fetch: async () => response({ results: [{ artistName: 'Beyoncé', primaryGenreName: 'Pop' }] }) });
    assert.equal(await provider.artistGenre('Beyonce'), 'Pop');
  });

  test('hydrates artist details from Wikipedia search and summary', async () => {
    const calls = [];
    const provider = createMetadataProvider({ fetch: async (url) => {
      calls.push(String(url));
      return calls.length === 1 ? response({ query: { search: [{ title: 'Poppy (singer)' }] } }) : response({ title: 'Poppy', description: 'American singer', extract: 'Biography', thumbnail: { source: 'photo.jpg' }, content_urls: { desktop: { page: 'wiki' } } });
    } });
    assert.deepEqual(await provider.artistInfo('Poppy'), { name: 'Poppy', title: 'Poppy', description: 'American singer', bio: 'Biography', image: 'photo.jpg', source: 'wiki' });
    assert.match(calls[0], /Poppy\+musician/);
  });

  test('refetches an artist from an explicit Wikipedia article without allowing arbitrary hosts', async () => {
    let requested = '';
    const provider = createMetadataProvider({ fetch: async (url) => {
      requested = String(url);
      return response({ title: 'Correct Artist', description: 'Musician', extract: 'Updated biography', thumbnail: { source: 'https://images.example/artist.jpg' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Correct_Artist' } } });
    } });
    const info = await provider.artistInfoFromUrl('Artist', 'https://en.m.wikipedia.org/wiki/Correct_Artist#Music');
    assert.match(requested, /^https:\/\/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/Correct_Artist$/);
    assert.equal(info.bio, 'Updated biography');
    assert.equal(info.source, 'https://en.wikipedia.org/wiki/Correct_Artist');
    assert.throws(() => wikipediaArticle('http://127.0.0.1/wiki/Artist'), /Wikipedia/);
    assert.throws(() => wikipediaArticle('https://example.com/wiki/Artist'), /Wikipedia/);
  });

  test('prefers a full album over a same-track single', async () => {
    const provider = createMetadataProvider({ fetch: async () => response({ results: [
      { trackName: 'Song', artistName: 'Artist', collectionType: 'single', trackCount: 1, collectionName: 'Song - Single' },
      { trackName: 'Song', artistName: 'Artist', collectionType: 'Album', trackCount: 12, collectionName: 'The Album' }
    ] }) });
    assert.equal(await provider.album('Artist', 'Song'), 'The Album');
  });

  test('falls back to official MusicBrainz album releases', async () => {
    let call = 0;
    const provider = createMetadataProvider({ fetch: async () => ++call === 1 ? response({}, { ok: false }) : response({ recordings: [{ title: 'Song', releases: [
      { title: 'Bootleg', status: 'Bootleg', 'release-group': { 'primary-type': 'Album' } },
      { title: 'Official Album', status: 'Official', 'release-group': { 'primary-type': 'Album' } }
    ] }] }) });
    assert.equal(await provider.album('Artist', 'Song'), 'Official Album');
  });
});
