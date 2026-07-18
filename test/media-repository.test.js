const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createMediaRepository } = require('../lib/media-repository');

function fixture() {
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-list-media-repo-'));
  const database = new Database(':memory:');
  migrateSchema(database);
  database.prepare("INSERT INTO gigs (id, artist, venue, city, date, songs, attendees, created_at) VALUES ('gig', 'Artist', 'Venue', 'City', '2026-07-18', '[]', '[]', '2026-07-18T00:00:00Z')").run();
  const repository = createMediaRepository({ database, mediaDir, path, existsSync: fs.existsSync, statSync: fs.statSync });
  return { database, mediaDir, repository };
}

test('media repository reports missing, ready and external playback states', () => {
  const { database, mediaDir, repository } = fixture();
  database.prepare("INSERT INTO gig_media (id, gig_id, filename, playback_filename, mime_type, caption, category, size, created_at) VALUES (?, 'gig', ?, ?, ?, ?, 'show', 8, ?)")
    .run('local', 'original.mov', 'proxy.mp4', 'video/quicktime', 'Local', '2026-07-18T00:00:00Z');
  database.prepare("INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, category, external_url, size, created_at) VALUES (?, 'gig', 'external', 'video/youtube', ?, 'other', ?, 0, ?)")
    .run('youtube', 'YouTube', 'https://youtu.be/example', '2026-07-18T00:00:01Z');

  assert.equal(repository.list('gig')[0].playbackStatus, 'missing');
  fs.writeFileSync(path.join(mediaDir, 'original.mov'), 'original');
  fs.writeFileSync(path.join(mediaDir, 'proxy.mp4'), 'proxy');
  const rows = repository.list('gig');
  assert.equal(rows[0].playbackStatus, 'ready');
  assert.equal(rows[0].playbackSize, 5);
  assert.equal(rows[1].playbackStatus, 'external');
  assert.equal(rows[1].url, 'https://youtu.be/example');
  database.close();
});

test('media repository groups playback clips by source', () => {
  const { database, repository } = fixture();
  database.prepare("INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, category, size, created_at) VALUES ('media', 'gig', 'clip.mp4', 'video/mp4', 'Clip', 'show', 10, '2026-07-18T00:00:00Z')").run();
  database.prepare("INSERT INTO media_playback_clips (media_id, song_index, start_seconds, end_seconds, priority, created_at, updated_at) VALUES ('media', 2, 12.5, 40, 1, 'now', 'now')").run();
  assert.deepEqual(repository.list('gig')[0].playbackClips, [{ songIndex: 2, startSeconds: 12.5, endSeconds: 40, priority: 1 }]);
  database.close();
});
