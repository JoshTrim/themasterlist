const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { recoverMediaWork, resumeInterruptedMediaWork } = require('../lib/media-recovery');

test('restart recovery marks orphaned work failed and removes only temporary media files', async () => {
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-list-recovery-'));
  const database = new Database(':memory:');
  migrateSchema(database);
  database.prepare("INSERT INTO gigs (id, artist, venue, city, date, songs, attendees, created_at) VALUES ('gig', 'Artist', 'Venue', 'City', '2026', '[]', '[]', 'now')").run();
  database.prepare("INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, size, playback_status, recognition_status, background_status, created_at) VALUES ('media', 'gig', 'original.mp4', 'video/mp4', 'Clip', 5, 'encoding', 'running', 'running', 'now')").run();
  database.prepare("INSERT INTO background_jobs (id, type, name, status, progress, created_at, updated_at) VALUES ('job', 'Encode', 'Clip', 'running', 52, 'now', 'now')").run();
  for (const name of ['clip.uploading', 'clip.mp4.rotating.mp4', 'shirt.processing.png', 'keep.mp4']) fs.writeFileSync(path.join(mediaDir, name), 'x');

  const result = await recoverMediaWork({ database, fs: fsp, path, mediaDir, now: () => 'later' });
  assert.deepEqual(result, { jobs: 1, encodes: 1, recognition: 1, backgrounds: 1, temporaryFiles: 3 });
  assert.equal(database.prepare('SELECT status FROM background_jobs WHERE id = ?').get('job').status, 'error');
  assert.deepEqual(database.prepare('SELECT playback_status, recognition_status, background_status FROM gig_media WHERE id = ?').get('media'), { playback_status: 'error', recognition_status: 'error', background_status: 'error' });
  assert.deepEqual(fs.readdirSync(mediaDir), ['keep.mp4']);
  database.close();
});

test('restart recovery requeues interrupted work whose source files still exist', async () => {
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-list-resume-'));
  const database = new Database(':memory:'); migrateSchema(database);
  database.prepare("INSERT INTO gigs (id, artist, venue, city, date, songs, attendees, created_at) VALUES ('gig', 'Artist', 'Venue', 'City', '2026', '[]', '[]', 'now')").run();
  database.prepare("INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, size, playback_status, playback_error, recognition_status, recognition_error, created_at) VALUES ('video', 'gig', 'clip.mp4', 'video/mp4', 'Clip', 5, 'error', 'Interrupted when the server restarted.', 'error', 'Interrupted when the server restarted.', 'now')").run();
  database.prepare("INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, category, size, background_status, background_error, created_at) VALUES ('artifact', 'gig', 'shirt.jpg', 'image/jpeg', 'Shirt', 'artifact', 5, 'error', 'Interrupted when the server restarted.', 'now')").run();
  fs.writeFileSync(path.join(mediaDir, 'clip.mp4'), 'clip'); fs.writeFileSync(path.join(mediaDir, 'shirt.jpg'), 'shirt');
  const calls = [];
  const result = resumeInterruptedMediaWork({
    database, existsSync: fs.existsSync, path, mediaDir,
    encoding: { start: (...args) => calls.push(['encode', ...args]) },
    recognition: { queue: (...args) => calls.push(['recognize', ...args]) },
    startBackgroundRemoval: (id) => calls.push(['background', id]), recognitionConfigured: true, logger: {}
  });
  assert.deepEqual(result, { encodes: 1, backgrounds: 1, recognition: 1, missingOriginals: 0 });
  assert.deepEqual(calls.map((entry) => entry[0]), ['encode', 'background', 'recognize']);
  database.close(); fs.rmSync(mediaDir, { recursive: true, force: true });
});
