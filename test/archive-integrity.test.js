const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createArchiveIntegrityService } = require('../lib/archive-integrity');

test('archive integrity finds missing, orphaned and duplicate media and builds a manifest', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'master-list-integrity-'));
  const database = new Database(':memory:');
  t.after(async () => { database.close(); await fs.rm(directory, { recursive: true, force: true }); });
  migrateSchema(database);
  database.prepare('INSERT INTO gigs (id, artist, venue, city, date, songs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('gig', 'Artist', 'Venue', 'Brisbane', '2026-01-01', '[]', new Date().toISOString());
  const insert = database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, size, checksum, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insert.run('one', 'gig', 'present.mp4', 'video/mp4', 4, 'same-checksum', new Date().toISOString());
  insert.run('two', 'gig', 'missing.mp4', 'video/mp4', 8, 'same-checksum', new Date().toISOString());
  await fs.writeFile(path.join(directory, 'present.mp4'), 'data');
  await fs.writeFile(path.join(directory, 'orphan.mp4'), 'orphan');
  const service = createArchiveIntegrityService({ database, fs, path, mediaDir: directory, databaseFile: '/data/master-list.sqlite', profileImageFilename: () => '', now: () => '2026-07-18T00:00:00.000Z' });
  const report = await service.report();
  assert.equal(report.healthy, false);
  assert.deepEqual(report.counts, { missing: 1, orphan: 1, duplicate: 1 });
  assert.equal(report.summary.diskBytes, 10);
  assert.equal(report.storage.originals, 4);
  assert.equal(report.storage.orphaned, 6);
  assert.equal(report.storage.largestFiles[0].filename, 'orphan.mp4');
  assert.equal(report.storage.largestShows[0].gigId, 'gig');
  const manifest = await service.manifest();
  assert.equal(manifest.databaseFile, 'master-list.sqlite');
  assert.equal(manifest.files.find((file) => file.filename === 'present.mp4').present, true);
  assert.equal(manifest.files.find((file) => file.filename === 'missing.mp4').present, false);
});

test('playback cleanup removes only derived files and resets their records', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'master-list-playback-cleanup-'));
  const database = new Database(':memory:');
  t.after(async () => { database.close(); await fs.rm(directory, { recursive: true, force: true }); });
  migrateSchema(database);
  database.prepare('INSERT INTO gigs (id, artist, venue, city, date, songs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('gig', 'Artist', 'Venue', 'City', '2026-01-01', '[]', new Date().toISOString());
  database.prepare(`INSERT INTO gig_media (id, gig_id, filename, playback_filename, playback_mime, playback_status, mime_type, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('media', 'gig', 'original.mp4', 'playback.mp4', 'video/mp4', 'ready', 'video/mp4', 8, new Date().toISOString());
  await fs.writeFile(path.join(directory, 'original.mp4'), 'original');
  await fs.writeFile(path.join(directory, 'playback.mp4'), 'copy');
  const service = createArchiveIntegrityService({ database, fs, path, mediaDir: directory, databaseFile: '/data/master-list.sqlite', profileImageFilename: () => '' });
  const result = await service.removePlaybackCopies();
  assert.deepEqual(result, { removed: 1, bytesFreed: 4, skipped: 0 });
  assert.equal((await fs.readFile(path.join(directory, 'original.mp4'), 'utf8')), 'original');
  await assert.rejects(fs.stat(path.join(directory, 'playback.mp4')), { code: 'ENOENT' });
  assert.deepEqual(database.prepare('SELECT playback_filename, playback_status FROM gig_media WHERE id = ?').get('media'), { playback_filename: null, playback_status: 'not_started' });
});
