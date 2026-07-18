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

  test('authentication rejects duplicate setup, bad credentials and unsafe account changes', async () => {
    const duplicate = await jsonApi('/api/auth/setup', 'POST', { name: 'Another Owner', password: 'another-password-123' }, { cookie: '' });
    assert.equal(duplicate.response.status, 403);
    const badLogin = await jsonApi('/api/auth/login', 'POST', { name: 'Test Owner', password: 'wrong-password' }, { cookie: '' });
    assert.equal(badLogin.response.status, 401);
    const wrongCurrent = await jsonApi('/api/auth/account', 'PATCH', { name: 'Changed', currentPassword: 'wrong-password', newPassword: 'replacement-password-123' });
    assert.equal(wrongCurrent.response.status, 401);
    const stillAuthenticated = await api('/api/auth/status');
    assert.equal(stillAuthenticated.body.account.name, 'Test Owner');
  });

  test('core pages serve the shared shell with their dedicated sections', async () => {
    for (const [pathname, sectionId] of [
      ['/shows', 'shows-archive'], ['/add', 'add-page'], ['/overview', 'overview-page'], ['/artists', 'artists-page'],
      ['/venues', 'venues-page'], ['/map', 'map-page'], ['/search', 'search-page'], ['/account', 'account-page'],
      ['/playback?id=missing', 'show-page']
    ]) {
      const page = await api(pathname);
      assert.equal(page.response.status, 200, pathname);
      assert.match(page.response.headers.get('content-type'), /text\/html/, pathname);
      assert.match(page.body, new RegExp(`id="${sectionId}"`), pathname);
    }
  });

  test('authenticated API collections consistently reject anonymous requests', async () => {
    for (const pathname of ['/api/gigs', '/api/profiles', '/api/shared/shows', '/api/peers', '/api/jobs', '/api/stats', '/api/health', '/api/limits']) {
      const result = await api(pathname, { cookie: '' });
      assert.equal(result.response.status, 401, pathname);
    }
  });

  test('timeline route serves the archive timeline shell', async () => {
    const timeline = await api('/timeline');
    assert.equal(timeline.response.status, 200);
    assert.match(timeline.response.headers.get('content-type'), /text\/html/);
    assert.match(timeline.body, /id="timeline-page"/);
    assert.match(timeline.body, /href="\/timeline"/);
  });

  test('health page exposes a dedicated missing-album repair action', async () => {
    const health = await api('/health');
    assert.equal(health.response.status, 200);
    assert.match(health.body, /id="repair-all-albums"/);
  });

  test('maintenance page exposes database backups, manifests and integrity checks', async () => {
    const page = await api('/maintenance');
    assert.equal(page.response.status, 200);
    assert.match(page.body, /id="maintenance-page"/);
    assert.match(page.body, /id="restore-database"/);
    assert.match(page.body, /href="\/maintenance"/);
    const status = await api('/api/maintenance/status');
    assert.equal(status.response.status, 200);
    assert.equal(status.body.integrity.summary.database, true);
    assert.deepEqual({ enabled: status.body.backupSchedule.enabled, intervalHours: status.body.backupSchedule.intervalHours, retentionCount: status.body.backupSchedule.retentionCount }, { enabled: true, intervalHours: 24, retentionCount: 14 });
    assert.ok(Array.isArray(status.body.integrity.issues));
    const settings = await jsonApi('/api/maintenance/backup-settings', 'PATCH', { enabled: true, intervalHours: 12, retentionCount: 3 });
    assert.equal(settings.response.status, 200);
    assert.equal(settings.body.intervalHours, 12);
    const scheduled = await api('/api/maintenance/backup-now', { method: 'POST' });
    assert.equal(scheduled.response.status, 201);
    assert.match(scheduled.body.filename, /^scheduled-.*\.sqlite$/);
    const manifest = await api('/api/maintenance/manifest');
    assert.equal(manifest.response.status, 200);
    assert.equal(manifest.body.format, 'the-master-list-media-manifest-v1');
    assert.match(manifest.response.headers.get('content-disposition'), /attachment/);
    const backup = await api('/api/maintenance/database');
    assert.equal(backup.response.status, 200);
    assert.match(backup.response.headers.get('content-type'), /sqlite/);
    const anonymous = await api('/api/maintenance/status', { cookie: '' });
    assert.equal(anonymous.response.status, 401);
  });

  test('backup settings clamp unsafe values and retain owner control', async () => {
    const clamped = await jsonApi('/api/maintenance/backup-settings', 'PATCH', { enabled: false, intervalHours: 0, retentionCount: 9999 });
    assert.equal(clamped.response.status, 200);
    assert.equal(clamped.body.enabled, false);
    assert.equal(clamped.body.intervalHours, 24);
    assert.equal(clamped.body.retentionCount, 365);
    const anonymous = await jsonApi('/api/maintenance/backup-settings', 'PATCH', { enabled: true }, { cookie: '' });
    assert.equal(anonymous.response.status, 401);
    await jsonApi('/api/maintenance/backup-settings', 'PATCH', { enabled: true, intervalHours: 24, retentionCount: 14 });
  });

  test('peer activity page keeps notification history and bulk read controls', async () => {
    const page = await api('/activity');
    assert.equal(page.response.status, 200);
    assert.match(page.body, /id="activity-page"/);
    assert.match(page.body, /id="mark-all-activity-read"/);
    const activity = await api('/api/notifications?scope=all');
    assert.equal(activity.response.status, 200);
    assert.ok(Array.isArray(activity.body));
    const marked = await api('/api/notifications/read-all', { method: 'POST' });
    assert.equal(marked.response.status, 200);
    assert.equal(typeof marked.body.updated, 'number');
  });

  test('sync conflict screen is owner-only and starts empty', async () => {
    const page = await api('/conflicts');
    assert.equal(page.response.status, 200);
    assert.match(page.body, /id="conflicts-page"/);
    const conflicts = await api('/api/sync/conflicts');
    assert.equal(conflicts.response.status, 200);
    assert.deepEqual(conflicts.body, []);
    const anonymous = await api('/api/sync/conflicts', { cookie: '' });
    assert.equal(anonymous.response.status, 401);
  });

  test('container health endpoint does not require a session', async () => {
    const health = await api('/api/healthz', { cookie: '' });
    assert.equal(health.response.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.database, 'ok');
  });

  test('artist and venue directories expose their page shells and cached metadata feed', async () => {
    const [artists, venues, metadata] = await Promise.all([
      api('/artists'),
      api('/venues'),
      api('/api/directory/metadata')
    ]);
    assert.equal(artists.response.status, 200);
    assert.match(artists.body, /id="artists-page"/);
    assert.match(artists.body, /href="\/artists"/);
    assert.match(artists.body, /id="artists-metadata-filter"/);
    assert.match(artists.body, /class="site-nav-group"/);
    assert.equal(venues.response.status, 200);
    assert.match(venues.body, /id="venues-page"/);
    assert.match(venues.body, /href="\/venues"/);
    assert.match(venues.body, /id="venues-metadata-filter"/);
    assert.equal(metadata.response.status, 200);
    assert.ok(Array.isArray(metadata.body.artists));
    assert.ok(Array.isArray(metadata.body.venues));
    assert.ok(Array.isArray(metadata.body.locations));
    const anonymous = await api('/api/directory/metadata', { cookie: '' });
    assert.equal(anonymous.response.status, 401);
  });

  test('artist and venue metadata overrides persist with local profile images and focus positions', async () => {
    const editor = await api('/artist/edit?name=Test%20Artist');
    assert.equal(editor.response.status, 200);
    assert.match(editor.body, /id="artist-edit-page"/);
    const artist = await jsonApi('/api/artists?name=Test%20Artist', 'PATCH', {
      title: 'Test Artist Display', description: 'Edited locally', bio: 'A manual artist biography.', imagePosition: 'top',
      genres: 'Electronic, Experimental',
      imageUpload: { filename: 'portrait.png', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7eQAAAAASUVORK5CYII=' }
    });
    assert.equal(artist.response.status, 200);
    assert.equal(artist.body.imagePosition, 'top');
    assert.deepEqual(artist.body.genres, ['Electronic', 'Experimental']);
    assert.match(artist.body.image, /^\/api\/profile-images\/profile-/);
    const image = await api(artist.body.image);
    assert.equal(image.response.status, 200);
    assert.match(image.response.headers.get('content-type'), /^image\/png/);
    const venue = await jsonApi('/api/venues?name=Test%20Venue&city=Brisbane', 'PATCH', { title: 'Test Venue', description: 'Edited venue', imagePosition: 'bottom', isClosed: true, latitude: -27.4698, longitude: 153.0251 });
    assert.equal(venue.response.status, 200);
    assert.equal(venue.body.imagePosition, 'bottom');
    assert.equal(venue.body.isClosed, true);
    assert.deepEqual(venue.body.coordinates, { lat: -27.4698, lng: 153.0251 });
    const reloadedVenue = await api('/api/venues?name=Test%20Venue&city=Brisbane');
    assert.equal(reloadedVenue.body.description, 'Edited venue');
    assert.equal(reloadedVenue.body.imagePosition, 'bottom');
    assert.equal(reloadedVenue.body.isClosed, true);
    const directoryMetadata = await api('/api/directory/metadata');
    assert.ok(directoryMetadata.body.locations.includes('test venue|brisbane'));
    assert.equal(Boolean(directoryMetadata.body.venues.find((entry) => entry.lookupName === 'test venue|brisbane')?.isClosed), true);
    const reloaded = await api('/api/artists?name=Test%20Artist');
    assert.equal(reloaded.body.title, 'Test Artist Display');
    assert.equal(reloaded.body.imagePosition, 'top');
    const genreStats = await api('/api/stats/genres');
    assert.deepEqual(genreStats.body.genres.map((entry) => [entry.genre, entry.percentage]), [['Electronic', 50], ['Experimental', 50]]);
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
    const refreshedAlbums = await api(`/api/gigs/${gig.id}/album-stats?refresh=1`);
    assert.equal(refreshedAlbums.response.status, 200);
    assert.deepEqual(refreshedAlbums.body.songs.map((song) => song.album), ['First Album', 'Second Album']);

    const media = await api(`/api/gigs/${gig.id}/media`);
    assert.equal(media.response.status, 200);
    assert.deepEqual(new Set(media.body.map((item) => item.id)), new Set([primaryVideo.id, fallbackVideo.id]));
  });

  test('gig validation rejects incomplete records and invalid ratings without altering the archive', async () => {
    const before = await api('/api/gigs');
    const incomplete = await jsonApi('/api/gigs', 'POST', { artist: 'No Venue', city: 'Brisbane', date: '2026-01-01' });
    assert.equal(incomplete.response.status, 400);
    assert.match(incomplete.body.error, /venue/i);
    const invalidRating = await jsonApi(`/api/gigs/${gig.id}`, 'PATCH', { performanceRating: 5.5 });
    assert.equal(invalidRating.response.status, 400);
    const after = await api('/api/gigs');
    assert.equal(after.body.length, before.body.length);
  });

  test('media assignments can be overridden and removed without deleting the show', async () => {
    const updated = await jsonApi(`/api/media/${fallbackVideo.id}`, 'PATCH', { caption: 'Edited fallback', songIndex: 1 });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.caption, 'Edited fallback');
    assert.equal(updated.body.songIndex, 1);
    const removable = await jsonApi(`/api/gigs/${gig.id}/media`, 'POST', { externalUrl: 'https://youtu.be/removable999', caption: 'Temporary source' });
    assert.equal(removable.response.status, 201);
    const removed = await api(`/api/media/${removable.body.id}`, { method: 'DELETE' });
    assert.equal(removed.response.status, 200);
    const showStillExists = await api('/api/gigs');
    assert.ok(showStillExists.body.some((entry) => entry.id === gig.id));
  });

  test('archive export returns portable shows without requiring provider integrations', async () => {
    const exported = await api('/api/archive/export');
    assert.equal(exported.response.status, 200);
    assert.equal(exported.body.format, 'the-master-list-export-v1');
    assert.ok(exported.body.gigs.some((entry) => entry.id === gig.id));
  });

  test('peer conflicts persist, expose both versions and resolve field-by-field', async () => {
    const currentGig = (await api('/api/gigs')).body.find((entry) => entry.id === gig.id);
    const peerId = 'test-peer-instance';
    database.prepare(`INSERT OR IGNORE INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at)
      VALUES (?, ?, ?, '', 'test-key', 'paired', ?)`).run('test-peer-row', peerId, 'Test Peer', new Date().toISOString());
    database.prepare(`INSERT OR REPLACE INTO peer_sync_baselines (shared_gig_id, peer_id, local_hash, remote_hash, synced_at)
      VALUES (?, ?, 'previous-local', 'previous-remote', ?)`).run(currentGig.sharedId, peerId, new Date().toISOString());
    const snapshot = {
      sharedGigId: currentGig.sharedId,
      show: { songs: [{ title: 'Peer Track', artist: currentGig.artist }] },
      contribution: { instanceId: peerId, participantName: 'Test Peer', performanceNotes: 'Peer memory', performanceRating: 4, favorite: true, media: [] }
    };
    const detected = testables.detectSyncConflict(snapshot, { peer_id: peerId }, currentGig);
    assert.equal(detected.conflict, true);
    const conflicts = await api('/api/sync/conflicts');
    const conflict = conflicts.body.find((entry) => entry.peerId === peerId);
    assert.ok(conflict);
    assert.equal(conflict.remote.notes, 'Peer memory');
    const resolved = await jsonApi(`/api/sync/conflicts/${conflict.id}/resolve`, 'POST', { notes: 'merge', ratings: 'remote', setlist: 'local', media: 'local' });
    assert.equal(resolved.response.status, 200);
    assert.match(resolved.body.gig.performanceNotes, /Peer memory/);
    assert.equal(resolved.body.gig.performanceRating, 4);
    assert.equal((await api('/api/sync/conflicts')).body.some((entry) => entry.id === conflict.id), false);
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
