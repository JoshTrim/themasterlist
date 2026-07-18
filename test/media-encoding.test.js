const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createBackgroundJobs } = require('../lib/background-jobs');
const { createMediaEncoding } = require('../lib/media-encoding');

function fixture(processor) {
  const database = new Database(':memory:');
  migrateSchema(database);
  database.prepare("INSERT INTO gigs (id, artist, venue, city, date, songs, attendees, created_at) VALUES ('gig', 'The Artist', 'The Venue', 'City', '2026-07-18', '[]', '[]', 'now')").run();
  database.prepare("INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, size, created_at) VALUES ('media-12345678', 'gig', 'clip.mov', 'video/quicktime', 'Clip', 5, 'now')").run();
  const jobs = createBackgroundJobs({ database });
  let pending;
  const encoding = createMediaEncoding({
    database, fs, path, mediaDir: '/media', jobs, processor,
    safeMediaName: (value) => String(value).toLowerCase().replace(/\W+/g, '-'),
    randomUUID: () => 'encode-job', schedule: (callback) => { pending = Promise.resolve().then(callback); }
  });
  return { database, jobs, encoding, wait: () => pending };
}

test('playback encoding persists progress and the generated playback filename', async () => {
  const app = fixture({
    probeDuration: async () => 10,
    createPlaybackProxy: async (_input, _output, options) => { options.onProgress(5_000_000); return true; }
  });
  assert.equal(app.encoding.start('media-12345678', 'gig', 'clip.mov', 'Clip'), 'encode-job');
  await app.wait();
  const media = app.database.prepare('SELECT playback_status, playback_filename FROM gig_media WHERE id = ?').get('media-12345678');
  assert.equal(media.playback_status, 'ready');
  assert.match(media.playback_filename, /the-artist-the-venue-2026-07-18-media-12-playback\.mp4/);
  assert.equal(app.jobs.get('encode-job').status, 'complete');
  app.database.close();
});

test('encoding cancellation during probing never starts FFmpeg', async () => {
  let encoded = false;
  let app;
  app = fixture({
    probeDuration: async () => { app.jobs.cancel('encode-job'); return 10; },
    createPlaybackProxy: async () => { encoded = true; return true; }
  });
  app.encoding.start('media-12345678', 'gig', 'clip.mov', 'Clip');
  await app.wait();
  assert.equal(encoded, false);
  assert.equal(app.database.prepare('SELECT playback_status FROM gig_media WHERE id = ?').get('media-12345678').playback_status, 'not_started');
  app.database.close();
});
