const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createBackgroundJobs } = require('../lib/background-jobs');
const { createPlaylistExportService } = require('../lib/playlist-exports');

function fixture(provider) {
  const database = new Database(':memory:');
  migrateSchema(database);
  database.prepare(`INSERT INTO gigs (id, artist, venue, city, date, songs, created_at)
    VALUES ('gig', 'Artist', 'Venue', 'City', '2026-01-01', '[]', 'now')`).run();
  const jobs = createBackgroundJobs({ database, now: () => '2026-08-12T00:00:00.000Z' });
  const pending = [];
  const service = createPlaylistExportService({
    database, jobs, providers: { youtube: provider }, getAccessToken: async () => 'token',
    randomUUID: () => 'export-1', schedule: (work) => pending.push(work), now: () => '2026-08-12T00:00:00.000Z'
  });
  const gig = { id: 'gig', artist: 'Artist', songs: [{ title: 'One' }, { title: 'Two' }] };
  return { database, jobs, pending, service, gig };
}

test('playlist exports run as persistent background jobs with progress and results', async () => {
  const app = fixture({ exportPlaylist: async ({ onProgress }) => {
    await onProgress({ phase: 'searching', current: 1, total: 2, progress: 25, state: { searchIndex: 1 } });
    await onProgress({ phase: 'adding', current: 2, total: 2, progress: 99, playlistId: 'playlist', url: 'https://youtube.test/playlist', matched: 2, unmatched: [] });
    return { playlistId: 'playlist', url: 'https://youtube.test/playlist', matched: 2, unmatched: [], state: { searchIndex: 2, insertIndex: 2 } };
  } });
  const started = app.service.start({ gig: app.gig, provider: 'youtube', details: { name: 'Show' } });
  assert.equal(started.status, 'queued');
  assert.equal(app.jobs.get(started.id).status, 'queued');
  await app.pending.shift()();
  const complete = app.service.publicStatus(started.id);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.progress, 100);
  assert.equal(complete.url, 'https://youtube.test/playlist');
  assert.equal(complete.matched, 2);
  assert.equal(app.jobs.get(started.id).status, 'complete');
  assert.equal('state' in complete, false);
  app.database.close();
});

test('failed YouTube exports resume the same playlist and persisted provider cursor', async () => {
  const seenStates = [];
  let attempt = 0;
  const app = fixture({ exportPlaylist: async ({ resumeState, onProgress }) => {
    seenStates.push(resumeState);
    attempt += 1;
    if (attempt === 1) {
      await onProgress({ phase: 'adding', current: 1, total: 2, progress: 77, playlistId: 'playlist', url: 'https://youtube.test/playlist', matched: 1, unmatched: [], state: { playlistId: 'playlist', searchIndex: 2, insertIndex: 1, matched: 1 } });
      throw new Error('connection dropped');
    }
    return { playlistId: 'playlist', url: 'https://youtube.test/playlist', matched: 2, unmatched: [], state: { playlistId: 'playlist', searchIndex: 2, insertIndex: 2, matched: 2 } };
  } });
  const first = app.service.start({ gig: app.gig, provider: 'youtube', details: { name: 'Show' } });
  await app.pending.shift()();
  assert.equal(app.service.get(first.id).status, 'error');
  const resumed = app.service.start({ gig: app.gig, provider: 'youtube', details: { name: 'Show' } });
  assert.equal(resumed.id, first.id);
  await app.pending.shift()();
  assert.deepEqual(seenStates[1], { playlistId: 'playlist', searchIndex: 2, insertIndex: 1, matched: 1 });
  assert.equal(app.service.get(first.id).status, 'complete');
  assert.equal(app.service.get(first.id).url, 'https://youtube.test/playlist');
  app.database.close();
});

test('a cancelled export cannot become complete after an in-flight provider request returns', async () => {
  const app = fixture({ exportPlaylist: async () => ({ playlistId: 'playlist', url: 'https://youtube.test/playlist', matched: 2, unmatched: [] }) });
  const started = app.service.start({ gig: app.gig, provider: 'youtube', details: { name: 'Show' } });
  app.jobs.cancel(started.id);
  await app.pending.shift()();
  assert.equal(app.service.get(started.id).status, 'cancelled');
  assert.equal(app.jobs.get(started.id).status, 'cancelled');
  app.database.close();
});
