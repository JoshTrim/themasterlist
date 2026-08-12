const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { eventNeedles, playableInRegion, transientPlaylistWrite, createYouTubeProvider } = require('../lib/providers/youtube');

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
      if (url.includes('/playlists?')) {
        const body = JSON.parse(options.body);
        assert.equal(body.snippet.title, 'Show');
        assert.equal(body.status.privacyStatus, 'private');
        return { id: 'playlist-1' };
      }
      inserted.push(JSON.parse(options.body).snippet.resourceId.videoId); return {};
    } });
    const result = await provider.exportPlaylist({ gig: { artist: 'Artist', songs: [{ title: 'Found' }, { title: 'Missing' }] }, accessToken: 'token', details: { name: 'Show' } });
    assert.deepEqual({ url: result.url, matched: result.matched, unmatched: result.unmatched }, { url: 'https://www.youtube.com/playlist?list=playlist-1', matched: 1, unmatched: ['Artist — Missing'] });
    assert.deepEqual(inserted, ['video-1']);
  });

  test('retries aborted playlist writes and continues after a persistently unavailable item', async () => {
    let searches = 0;
    const insertAttempts = new Map();
    const delays = [];
    const provider = createYouTubeProvider({ insertAttempts: 3, sleep: async (milliseconds) => delays.push(milliseconds), requestJson: async (url, options) => {
      if (url.includes('/search?')) return { items: [{ id: { videoId: `video-${++searches}` } }] };
      if (url.includes('/playlists?')) return { id: 'playlist-1' };
      if (!options.method) return { items: [] };
      const videoId = JSON.parse(options.body).snippet.resourceId.videoId;
      insertAttempts.set(videoId, (insertAttempts.get(videoId) || 0) + 1);
      if (videoId === 'video-1') throw new Error('YouTube playlist: The operation was aborted.');
      if (videoId === 'video-2' && insertAttempts.get(videoId) === 1) throw new Error('YouTube playlist: The operation was aborted.');
      return {};
    } });
    const result = await provider.exportPlaylist({
      gig: { artist: 'Artist', songs: [{ title: 'Never added' }, { title: 'Eventually added' }] },
      accessToken: 'token', details: { name: 'Show' }
    });
    assert.deepEqual({ url: result.url, matched: result.matched, unmatched: result.unmatched }, {
      url: 'https://www.youtube.com/playlist?list=playlist-1',
      matched: 1,
      unmatched: ['Artist — Never added']
    });
    assert.deepEqual(Object.fromEntries(insertAttempts), { 'video-1': 3, 'video-2': 2 });
    assert.deepEqual(delays, [300, 600, 300]);
  });

  test('resumes an existing playlist and does not duplicate an item committed before interruption', async () => {
    const inserted = [];
    const progress = [];
    const provider = createYouTubeProvider({ requestJson: async (url, options) => {
      if (!options.method && url.includes('/playlistItems?')) return { items: [{ snippet: { resourceId: { videoId: 'video-1' } } }] };
      inserted.push(JSON.parse(options.body).snippet.resourceId.videoId);
      return {};
    } });
    const result = await provider.exportPlaylist({
      gig: { artist: 'Artist', songs: [{ title: 'One' }, { title: 'Two' }] }, accessToken: 'token', details: { name: 'Show' },
      resumeState: {
        searchIndex: 2,
        videos: [{ id: 'video-1', label: 'Artist — One' }, { id: 'video-2', label: 'Artist — Two' }],
        unmatched: [], playlistId: 'playlist-1', insertIndex: 0, matched: 0
      },
      onProgress: async (update) => progress.push(update)
    });
    assert.deepEqual(inserted, ['video-2']);
    assert.equal(result.matched, 2);
    assert.equal(result.state.insertIndex, 2);
    assert.equal(progress.at(-1).current, 2);
  });

  test('only treats transient YouTube write failures as retryable', () => {
    assert.equal(transientPlaylistWrite(new Error('YouTube playlist: The operation was aborted.')), true);
    assert.equal(transientPlaylistWrite(Object.assign(new Error('conflict'), { status: 409 })), true);
    assert.equal(transientPlaylistWrite(new Error('YouTube playlist: quota exceeded')), false);
  });

  test('retrieves metadata for a bounded set of video IDs', async () => {
    let requestedUrl = '';
    const provider = createYouTubeProvider({ requestJson: async (url) => { requestedUrl = url; return { items: [{ id: 'one' }] }; } });
    assert.deepEqual(await provider.videoMetadata({ videoIds: ['one', 'two'], accessToken: 'token' }), [{ id: 'one' }]);
    assert.match(requestedUrl, /id=one%2Ctwo/);
  });
});
