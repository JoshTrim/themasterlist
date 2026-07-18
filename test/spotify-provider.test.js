const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createSpotifyProvider } = require('../lib/providers/spotify');

describe('Spotify provider', () => {
  test('matches tracks, creates a private playlist and reports misses', async () => {
    const calls = [];
    const provider = createSpotifyProvider({ requestJson: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/search?')) return url.includes('Missing') ? { tracks: { items: [] } } : { tracks: { items: [{ uri: 'spotify:track:one' }] } };
      if (url.endsWith('/me/playlists')) return { id: 'playlist-1', external_urls: { spotify: 'https://spotify.test/playlist-1' } };
      return {};
    } });
    const result = await provider.exportPlaylist({
      gig: { artist: 'Artist', songs: [{ title: 'Found' }, { title: 'Missing', artist: 'Guest' }] },
      accessToken: 'token', details: { name: 'Show', description: 'Night' }
    });
    assert.deepEqual(result, { url: 'https://spotify.test/playlist-1', matched: 1, unmatched: ['Guest — Missing'] });
    const create = calls.find((call) => call.url.endsWith('/me/playlists'));
    assert.equal(JSON.parse(create.options.body).public, false);
    assert.equal(calls.at(-1).url, 'https://api.spotify.com/v1/playlists/playlist-1/items');
  });

  test('adds matched tracks in Spotify-sized batches', async () => {
    const batches = [];
    const provider = createSpotifyProvider({ requestJson: async (url, options) => {
      if (url.includes('/search?')) return { tracks: { items: [{ uri: `spotify:track:${Math.random()}` }] } };
      if (url.endsWith('/me/playlists')) return { id: 'many' };
      batches.push(JSON.parse(options.body).uris.length); return {};
    } });
    await provider.exportPlaylist({ gig: { artist: 'Artist', songs: Array.from({ length: 205 }, (_, index) => ({ title: `Song ${index}` })) }, accessToken: 'token', details: { name: 'Many' } });
    assert.deepEqual(batches, [100, 100, 5]);
  });
});
