const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createAppleMusicProvider } = require('../lib/providers/apple-music');

describe('Apple Music provider', () => {
  test('requires user authorization before making requests', async () => {
    const provider = createAppleMusicProvider({ requestJson: async () => {}, developerToken: 'developer' });
    await assert.rejects(provider.exportPlaylist({ gig: {}, musicUserToken: '', details: {} }), /authorization was not completed/);
  });

  test('matches songs, creates a library playlist and reports misses', async () => {
    const calls = [];
    let searches = 0;
    const provider = createAppleMusicProvider({ developerToken: 'developer', storefront: 'au', requestJson: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/search?')) return ++searches === 1 ? { results: { songs: { data: [{ id: 'song-1' }] } } } : {};
      if (url.endsWith('/playlists')) return { data: [{ id: 'playlist-1' }] };
      return {};
    } });
    const result = await provider.exportPlaylist({ gig: { artist: 'Artist', songs: [{ title: 'Found' }, { title: 'Missing', artist: 'Guest' }] }, musicUserToken: 'user', details: { name: 'Show', description: 'Night' } });
    assert.deepEqual(result, { url: 'https://music.apple.com/library', matched: 1, unmatched: ['Guest — Missing'] });
    assert.equal(calls[0].options.headers.Authorization, 'Bearer developer');
    assert.equal(calls[0].options.headers['Music-User-Token'], 'user');
    assert.deepEqual(JSON.parse(calls.at(-1).options.body).data, [{ id: 'song-1', type: 'songs' }]);
  });

  test('rejects incomplete playlist responses', async () => {
    const provider = createAppleMusicProvider({ developerToken: 'developer', requestJson: async (url) => url.includes('/search?') ? {} : { data: [] } });
    await assert.rejects(provider.exportPlaylist({ gig: { artist: 'Artist', songs: [] }, musicUserToken: 'user', details: {} }), /did not return the new playlist/);
  });
});
