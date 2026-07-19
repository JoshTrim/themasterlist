const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { eventNeedles, playableInRegion, createYouTubeProvider } = require('../lib/providers/youtube');

describe('YouTube provider', () => {
  test('builds stable venue and date matching terms', () => {
    assert.deepEqual(eventNeedles({ venue: 'The Tivoli', date: '2026-07-18' }), { venue: 'the tivoli', dates: ['2026', 'july', 'jul'] });
  });

  test('filters live searches to the event and reliably playable embeds', async () => {
    let call = 0;
    let searchUrl = '';
    const provider = createYouTubeProvider({ regionCode: 'AU', requestJson: async (url) => ++call === 1 ? (searchUrl = url, { items: [
      { id: { videoId: 'venue' }, snippet: { title: 'Song at The Tivoli', description: '', channelTitle: 'Fan', thumbnails: { default: { url: 'one.jpg' } } } },
      { id: { videoId: 'date' }, snippet: { title: 'Artist live July 2026', description: '', channelTitle: 'Fan' } },
      { id: { videoId: 'blocked' }, snippet: { title: 'Artist at The Tivoli', description: '', channelTitle: 'Fan' } },
      { id: { videoId: 'wrong' }, snippet: { title: 'Another concert', description: '' } }
    ] }) : { items: [
      { id: 'venue', status: { embeddable: true, privacyStatus: 'public' }, contentDetails: {}, player: { embedHtml: '<iframe></iframe>' } },
      { id: 'date', status: { embeddable: true }, contentDetails: {}, player: {} },
      { id: 'blocked', status: { embeddable: true }, contentDetails: { regionRestriction: { blocked: ['AU'] } }, player: { embedHtml: '<iframe></iframe>' } }
    ] } });
    const results = await provider.searchLiveVideos({ gig: { artist: 'Artist', venue: 'The Tivoli', city: 'Brisbane', date: '2026-07-18' }, song: { title: 'Song' }, accessToken: 'token' });
    assert.deepEqual(results, [{ id: 'venue', title: 'Song at The Tivoli', description: '', channel: 'Fan', thumbnail: 'one.jpg' }]);
    assert.match(searchUrl, /videoEmbeddable=true/);
    assert.match(searchUrl, /videoSyndicated=true/);
    assert.match(searchUrl, /regionCode=AU/);
  });

  test('rejects videos without a usable player, in blocked regions or behind age restrictions', () => {
    const video = (extra = {}) => ({ status: { embeddable: true, privacyStatus: 'public' }, contentDetails: {}, player: { embedHtml: '<iframe></iframe>' }, ...extra });
    assert.equal(playableInRegion(video(), 'AU'), true);
    assert.equal(playableInRegion(video({ player: {} }), 'AU'), false);
    assert.equal(playableInRegion(video({ contentDetails: { regionRestriction: { allowed: ['US'] } } }), 'AU'), false);
    assert.equal(playableInRegion(video({ contentDetails: { regionRestriction: { blocked: ['AU'] } } }), 'AU'), false);
    assert.equal(playableInRegion(video({ contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } }), 'AU'), false);
  });

  test('creates a private playlist and reports unmatched songs', async () => {
    const inserted = [];
    let searches = 0;
    const provider = createYouTubeProvider({ requestJson: async (url, options) => {
      if (url.includes('/search?')) return ++searches === 1 ? { items: [{ id: { videoId: 'video-1' } }] } : { items: [] };
      if (url.includes('/playlists?')) { assert.equal(JSON.parse(options.body).status.privacyStatus, 'private'); return { id: 'playlist-1' }; }
      inserted.push(JSON.parse(options.body).snippet.resourceId.videoId); return {};
    } });
    const result = await provider.exportPlaylist({ gig: { artist: 'Artist', songs: [{ title: 'Found' }, { title: 'Missing' }] }, accessToken: 'token', details: { title: 'Show' } });
    assert.deepEqual(result, { url: 'https://www.youtube.com/playlist?list=playlist-1', matched: 1, unmatched: ['Artist — Missing'] });
    assert.deepEqual(inserted, ['video-1']);
  });

  test('retrieves metadata for a bounded set of video IDs', async () => {
    let requestedUrl = '';
    const provider = createYouTubeProvider({ requestJson: async (url) => { requestedUrl = url; return { items: [{ id: 'one' }] }; } });
    assert.deepEqual(await provider.videoMetadata({ videoIds: ['one', 'two'], accessToken: 'token' }), [{ id: 'one' }]);
    assert.match(requestedUrl, /id=one%2Ctwo/);
  });
});
