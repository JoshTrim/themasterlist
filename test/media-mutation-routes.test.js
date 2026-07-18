const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createBackgroundJobs } = require('../lib/background-jobs');
const { createMediaRepository } = require('../lib/media-repository');
const { createMediaMutationRoutes } = require('../lib/routes/media-mutations');
const { sendJson, sendError } = require('../lib/http');
const { hashFile } = require('../lib/media-utils');

function response() {
  return { status: null, body: '', writeHead(status) { this.status = status; }, end(body = '') { this.body = body; } };
}

function fixture() {
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-list-mutations-'));
  const database = new Database(':memory:');
  migrateSchema(database);
  database.prepare("INSERT INTO gigs (id, artist, venue, city, date, songs, attendees, created_at) VALUES ('gig', 'Artist', 'Venue', 'City', '2026', '[{\"title\":\"Song\"}]', '[]', 'now')").run();
  database.prepare("INSERT INTO gig_media (id, gig_id, filename, playback_filename, mime_type, caption, size, song_index, playback_start, playback_end, created_at) VALUES ('video', 'gig', 'video.mp4', 'proxy.mp4', 'video/mp4', 'Original', 5, 0, 2, 8, 'now')").run();
  for (const name of ['video.mp4', 'proxy.mp4']) fs.writeFileSync(path.join(mediaDir, name), 'video');
  const repository = createMediaRepository({ database, mediaDir, path, existsSync: fs.existsSync, statSync: fs.statSync });
  const jobs = createBackgroundJobs({ database });
  const pending = [];
  const encodeCalls = [];
  const recognitionCalls = [];
  let id = 0;
  const handle = createMediaMutationRoutes({
    database, fs: fsp, existsSync: fs.existsSync, path, mediaDir, randomUUID: () => `job-${++id}`,
    schedule: (callback) => pending.push(Promise.resolve().then(callback)), requireAccount: () => ({ id: 'owner' }),
    readBody: async (request) => request.body, sendJson, sendError, mediaRows: repository.list, hashFile,
    encoding: { start: (...args) => { encodeCalls.push(args); return 'encode-job'; } },
    recognition: { configured: () => true, queue: (...args) => recognitionCalls.push(args) },
    processor: {
      probeDuration: async () => 10,
      rotateVideo: async (_input, output, _direction, options) => { options.onProgress(5_000_000); await fsp.writeFile(output, 'rotated'); },
      trimVideo: async (_input, output, _start, _duration, options) => { options.onProgress(2_000_000); await fsp.writeFile(output, 'trimmed'); },
      removeImageBackground: async (_input, output) => fsp.writeFile(output, 'cutout')
    }, jobs
  });
  return { database, mediaDir, handle, jobs, pending, encodeCalls, recognitionCalls };
}

test('media mutation routes validate timing edits and preserve omitted fields', async () => {
  const app = fixture();
  const invalid = response();
  await app.handle({ method: 'PATCH', headers: {}, body: { playbackStart: 9 } }, invalid, new URL('http://localhost/api/media/video'));
  assert.equal(invalid.status, 400);
  const updated = response();
  await app.handle({ method: 'PATCH', headers: {}, body: { caption: 'Renamed', playbackStart: 3 } }, updated, new URL('http://localhost/api/media/video'));
  assert.equal(updated.status, 200);
  assert.deepEqual(app.database.prepare('SELECT caption, song_index, playback_start, playback_end FROM gig_media WHERE id = ?').get('video'), { caption: 'Renamed', song_index: 0, playback_start: 3, playback_end: 8 });
  app.database.close();
});

test('retry routes delegate to encoding and recognition services', async () => {
  const app = fixture();
  app.database.prepare("UPDATE gig_media SET playback_status = 'ready', recognition_status = 'not_started'").run();
  const encode = response();
  await app.handle({ method: 'POST', headers: {} }, encode, new URL('http://localhost/api/media/video/retry-encode'));
  assert.equal(encode.status, 202);
  assert.equal(app.encodeCalls.length, 1);
  const recognition = response();
  await app.handle({ method: 'POST', headers: {} }, recognition, new URL('http://localhost/api/media/video/retry-recognition'));
  assert.equal(recognition.status, 202);
  assert.equal(app.recognitionCalls.length, 1);
  app.database.close();
});

test('rotation and trimming complete through background jobs', async () => {
  const app = fixture();
  const rotate = response();
  await app.handle({ method: 'POST', headers: {} }, rotate, new URL('http://localhost/api/media/video/rotate?direction=counterclockwise'));
  await Promise.all(app.pending.splice(0));
  assert.equal(app.jobs.get(JSON.parse(rotate.body).jobId).status, 'complete');
  const trim = response();
  await app.handle({ method: 'POST', headers: {} }, trim, new URL('http://localhost/api/media/video/trim?start=1&end=5'));
  await Promise.all(app.pending.splice(0));
  assert.equal(app.jobs.get(JSON.parse(trim.body).jobId).status, 'complete');
  assert.equal(app.database.prepare('SELECT playback_filename FROM gig_media WHERE id = ?').get('video').playback_filename, null);
  app.database.close();
});

test('artifact background removal publishes the cutout only after processing completes', async () => {
  const app = fixture();
  app.database.prepare("INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, category, size, created_at) VALUES ('artifact', 'gig', 'shirt.jpg', 'image/jpeg', 'Shirt', 'artifact', 5, 'now')").run();
  fs.writeFileSync(path.join(app.mediaDir, 'shirt.jpg'), 'photo');
  const result = response();
  await app.handle({ method: 'POST', headers: {} }, result, new URL('http://localhost/api/media/artifact/remove-background'));
  assert.equal(result.status, 202);
  await Promise.all(app.pending.splice(0));
  const media = app.database.prepare('SELECT background_status, background_filename, use_background_removed FROM gig_media WHERE id = ?').get('artifact');
  assert.deepEqual(media, { background_status: 'complete', background_filename: 'shirt.cutout.png', use_background_removed: 1 });
  assert.equal(fs.existsSync(path.join(app.mediaDir, 'shirt.cutout.png')), true);
  app.database.close();
});

test('deleting media removes every associated file and database record', async () => {
  const app = fixture();
  app.database.prepare("UPDATE gig_media SET background_filename = 'cutout.png' WHERE id = 'video'").run();
  fs.writeFileSync(path.join(app.mediaDir, 'cutout.png'), 'cutout');
  const deleted = response();
  await app.handle({ method: 'DELETE', headers: {} }, deleted, new URL('http://localhost/api/media/video'));
  assert.equal(deleted.status, 200);
  assert.equal(app.database.prepare('SELECT COUNT(*) AS count FROM gig_media').get().count, 0);
  assert.deepEqual(fs.readdirSync(app.mediaDir), []);
  app.database.close();
});
