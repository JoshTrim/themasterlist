const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createBackgroundJobs } = require('../lib/background-jobs');
const { createMediaRecognition } = require('../lib/media-recognition');
const { recognitionKey } = require('../lib/playback');

function fixture({ providerResult, recognitionOverride = 0, songIndex = null } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'master-list-recognition-'));
  const sourcePath = path.join(directory, 'clip.mp4');
  fs.writeFileSync(sourcePath, 'video');
  const database = new Database(':memory:');
  migrateSchema(database);
  database.prepare("INSERT INTO gigs (id, artist, venue, city, date, songs, attendees, created_at) VALUES ('gig', 'Artist', 'Venue', 'City', '2026-07-18', ?, '[]', 'now')").run(JSON.stringify([{ title: 'Known Song' }, { title: 'Other Song' }]));
  database.prepare("INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, size, recognition_override, song_index, created_at) VALUES ('media', 'gig', 'clip.mp4', 'video/mp4', 'Clip', 5, ?, ?, 'now')").run(recognitionOverride, songIndex);
  const jobs = createBackgroundJobs({ database });
  const appended = [];
  const recognition = createMediaRecognition({
    database, fs: fsp, token: () => 'secret', jobs,
    processor: {
      probeDuration: async () => 42,
      extractRecognitionSample: async (_input, output) => fsp.writeFile(output, 'audio')
    },
    providerResponse: async () => providerResult,
    findGig: () => ({ songs: [{ title: 'Known Song' }, { title: 'Other Song' }] }),
    recognitionKey, randomUUID: () => 'recognition-job',
    createForm: () => ({ append: (...values) => appended.push(values) }),
    createBlob: () => ({ blob: true })
  });
  return { database, directory, sourcePath, jobs, recognition, appended };
}

test('AudD recognition matches a setlist track and stores provider metadata', async () => {
  const { database, sourcePath, recognition, appended } = fixture({ providerResult: { status: 'success', result: { title: 'Known Song', artist: 'Artist', album: 'Album' } } });
  const job = await recognition.recognize('gig', 'media', sourcePath, 'Clip');
  const media = database.prepare('SELECT recognition_status, recognition_title, recognition_artist, recognition_album, song_index FROM gig_media WHERE id = ?').get('media');
  assert.equal(job.status, 'complete');
  assert.deepEqual(media, { recognition_status: 'matched', recognition_title: 'Known Song', recognition_artist: 'Artist', recognition_album: 'Album', song_index: 0 });
  assert.deepEqual(appended.slice(0, 2).map((entry) => entry[0]), ['api_token', 'return']);
  database.close();
});

test('AudD failures are persisted and manual track overrides are never replaced', async () => {
  const manual = fixture({ providerResult: { status: 'success', result: { title: 'Known Song' } }, recognitionOverride: 1, songIndex: 1 });
  await manual.recognition.recognize('gig', 'media', manual.sourcePath, 'Clip');
  assert.equal(manual.database.prepare('SELECT song_index FROM gig_media WHERE id = ?').get('media').song_index, 1);
  manual.database.close();

  const failed = fixture({ providerResult: { status: 'error', error: { error_message: 'quota exhausted' } } });
  const job = await failed.recognition.recognize('gig', 'media', failed.sourcePath, 'Clip');
  assert.equal(job.status, 'error');
  assert.match(failed.database.prepare('SELECT recognition_error FROM gig_media WHERE id = ?').get('media').recognition_error, /quota exhausted/);
  assert.equal(fs.existsSync(`${failed.sourcePath}.media.recognition.mp3`), false);
  failed.database.close();
});
