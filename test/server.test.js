const { after, before, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const testDataDir = mkdtempSync(path.join(tmpdir(), 'master-list-test-'));
process.env.MASTER_LIST_DATA_DIR = testDataDir;
process.env.MASTER_LIST_SKIP_ENV = 'true';
process.env.SESSION_COOKIE_SECURE = 'false';
delete process.env.AUDD_API_TOKEN;

const { server, database, paths, testables } = require('../server');

let baseUrl;
let sessionCookie;
let gig;
let primaryVideo;
let fallbackVideo;

async function api(pathname, { cookie = sessionCookie, headers = {}, ...options } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers }
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body };
}

async function jsonApi(pathname, method, body, options = {}) {
  return api(pathname, {
    ...options,
    method,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body)
  });
}

describe('The Master List API regressions', { concurrency: false }, () => {
  before(async () => {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const setup = await jsonApi('/api/auth/setup', 'POST', { name: 'Test Owner', password: 'correct-horse-battery-staple' }, { cookie: '' });
    assert.equal(setup.response.status, 201);
    sessionCookie = setup.response.headers.getSetCookie().find((value) => value.startsWith('master_list_session_'))?.split(';')[0];
    assert.ok(sessionCookie, 'setup should issue an instance-specific session cookie');

    const created = await jsonApi('/api/gigs', 'POST', {
      artist: 'Test Artist', venue: 'Test Venue', city: 'Brisbane', date: '2026-07-17',
      songs: [
        { title: 'Opening Track', artist: 'Test Artist', album: 'First Album', startSeconds: 5, endSeconds: 65 },
        { title: 'Final Track', artist: 'Test Artist', album: 'Second Album', startSeconds: 65, endSeconds: 130 }
      ]
    });
    assert.equal(created.response.status, 201);
    gig = created.body;

    const firstMedia = await jsonApi(`/api/gigs/${gig.id}/media`, 'POST', { externalUrl: 'https://www.youtube.com/watch?v=primary123', caption: 'Primary source' });
    const secondMedia = await jsonApi(`/api/gigs/${gig.id}/media`, 'POST', { externalUrl: 'https://youtu.be/fallback456', caption: 'Fallback source' });
    assert.equal(firstMedia.response.status, 201);
    assert.equal(secondMedia.response.status, 201);
    primaryVideo = firstMedia.body;
    fallbackVideo = secondMedia.body;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    database.close();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  test('authentication persists through the session cookie and protects the archive', async () => {
    const authenticated = await api('/api/auth/status');
    assert.equal(authenticated.response.status, 200);
    assert.equal(authenticated.body.account.name, 'Test Owner');

    const anonymous = await api('/api/gigs', { cookie: '' });
    assert.equal(anonymous.response.status, 401);
    assert.match(anonymous.body.error, /sign in/i);
  });

  test('editing show fields preserves attached media and omitted album metadata', async () => {
    const updated = await jsonApi(`/api/gigs/${gig.id}`, 'PATCH', {
      artist: 'Test Artist Updated',
      songs: [
        { title: 'Opening Track', artist: 'Test Artist Updated', startSeconds: 5, endSeconds: 65 },
        { title: 'Final Track', artist: 'Test Artist Updated', startSeconds: 65, endSeconds: 130 }
      ]
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.songs[0].album, 'First Album');
    assert.equal(updated.body.songs[1].album, 'Second Album');

    const media = await api(`/api/gigs/${gig.id}/media`);
    assert.equal(media.response.status, 200);
    assert.deepEqual(new Set(media.body.map((item) => item.id)), new Set([primaryVideo.id, fallbackVideo.id]));
  });

  test('playback plans preserve timings and normalize primary/fallback priorities', async () => {
    const saved = await jsonApi(`/api/gigs/${gig.id}/playback-plan`, 'PUT', {
      clips: [
        { mediaId: primaryVideo.id, songIndex: 0, startSeconds: 5, endSeconds: 65, priority: 9 },
        { mediaId: fallbackVideo.id, songIndex: 0, startSeconds: 10, endSeconds: 70, priority: 2 },
        { mediaId: primaryVideo.id, songIndex: 1, startSeconds: 65, endSeconds: 130, priority: 0 }
      ]
    });
    assert.equal(saved.response.status, 200);

    const refreshed = await api(`/api/gigs/${gig.id}/media`);
    const primary = refreshed.body.find((item) => item.id === primaryVideo.id);
    const fallback = refreshed.body.find((item) => item.id === fallbackVideo.id);
    assert.deepEqual(primary.playbackClips, [
      { songIndex: 0, startSeconds: 5, endSeconds: 65, priority: 1 },
      { songIndex: 1, startSeconds: 65, endSeconds: 130, priority: 0 }
    ]);
    assert.deepEqual(fallback.playbackClips, [
      { songIndex: 0, startSeconds: 10, endSeconds: 70, priority: 0 }
    ]);
  });

  test('invalid duplicate playback sources are rejected without replacing the saved plan', async () => {
    const rejected = await jsonApi(`/api/gigs/${gig.id}/playback-plan`, 'PUT', {
      clips: [
        { mediaId: primaryVideo.id, songIndex: 0, startSeconds: 5, endSeconds: 65, priority: 0 },
        { mediaId: primaryVideo.id, songIndex: 0, startSeconds: 5, endSeconds: 65, priority: 1 }
      ]
    });
    assert.equal(rejected.response.status, 400);
    assert.match(rejected.body.error, /same playback source/i);

    const refreshed = await api(`/api/gigs/${gig.id}/media`);
    assert.equal(refreshed.body.flatMap((item) => item.playbackClips).length, 3);
  });

  test('identical uploaded files are deduplicated without creating a second database row', async () => {
    const image = Buffer.from('not-a-real-png-but-valid-upload-bytes');
    const upload = () => api(`/api/gigs/${gig.id}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'Content-Length': String(image.length), 'X-Media-Filename': 'ticket.png' },
      body: image
    });
    const first = await upload();
    const second = await upload();
    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 200);
    assert.equal(second.body.duplicate, true);
    assert.equal(second.body.media.id, first.body.id);

    const media = await api(`/api/gigs/${gig.id}/media`);
    assert.equal(media.body.filter((item) => item.mimeType === 'image/png').length, 1);
    assert.equal(paths.data, testDataDir);
  });

  test('multi-song YouTube chapters generate bounded playback suggestions', () => {
    const chapters = testables.parsePlaybackChapters('0:00 Opening Track\n1:05 Final Track\n2:10 Encore');
    assert.deepEqual(chapters, [
      { seconds: 0, title: 'Opening Track' },
      { seconds: 65, title: 'Final Track' },
      { seconds: 130, title: 'Encore' }
    ]);

    const suggestions = testables.suggestPlaybackPlan({
      artist: 'Test Artist', venue: 'Test Venue', songs: [{ title: 'Opening Track' }, { title: 'Final Track' }]
    }, [{
      id: 'youtube-source', mimeType: 'video/youtube', category: 'other', caption: 'Test Artist full show',
      sourceDescription: '0:00 Opening Track\n1:05 Final Track\n2:10 Encore', sourceDuration: 180,
      playbackClips: [], songIndex: null, recognitionTitle: ''
    }]);
    assert.deepEqual(suggestions.map(({ songIndex, startSeconds, endSeconds }) => ({ songIndex, startSeconds, endSeconds })), [
      { songIndex: 0, startSeconds: 0, endSeconds: 65 },
      { songIndex: 1, startSeconds: 65, endSeconds: 130 }
    ]);
    assert.equal(testables.youtubeVideoId('https://youtu.be/abc123?t=4'), 'abc123');
  });

  test('full-show videos without chapters receive editable whole-set timing estimates', () => {
    const suggestions = testables.suggestPlaybackPlan({
      artist: 'Test Artist', venue: 'Test Venue',
      songs: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }, { title: 'Four' }]
    }, [{
      id: 'full-show', mimeType: 'video/youtube', category: 'other', caption: 'Test Artist — Full Concert',
      sourceDescription: '', sourceDuration: 1200, playbackClips: [], songIndex: null, recognitionTitle: ''
    }]);
    assert.deepEqual(suggestions.map(({ songIndex, startSeconds, endSeconds }) => ({ songIndex, startSeconds, endSeconds })), [
      { songIndex: 0, startSeconds: 0, endSeconds: 300 },
      { songIndex: 1, startSeconds: 300, endSeconds: 600 },
      { songIndex: 2, startSeconds: 600, endSeconds: 900 },
      { songIndex: 3, startSeconds: 900, endSeconds: 1200 }
    ]);
    assert.ok(suggestions.every((suggestion) => suggestion.confidence === .48));
    assert.ok(suggestions.every((suggestion) => /review timing/i.test(suggestion.reason)));
  });

  test('detected chapter anchors interpolate missing tracks without overlaps', () => {
    const estimates = testables.estimateFullShowTimings(3, 900, [
      { songIndex: 0, seconds: 0, weight: 2 },
      { songIndex: 2, seconds: 600, weight: 2 }
    ]);
    assert.deepEqual(estimates.map(({ songIndex, startSeconds, endSeconds }) => ({ songIndex, startSeconds, endSeconds })), [
      { songIndex: 0, startSeconds: 0, endSeconds: 300 },
      { songIndex: 1, startSeconds: 300, endSeconds: 600 },
      { songIndex: 2, startSeconds: 600, endSeconds: 900 }
    ]);
    estimates.forEach((estimate, index) => { if (index) assert.equal(estimates[index - 1].endSeconds, estimate.startSeconds); });
  });
});
