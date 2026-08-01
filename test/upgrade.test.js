const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');

function createV010Database(filename) {
  const database = new Database(filename);
  database.exec(`
    CREATE TABLE gigs (
      id TEXT PRIMARY KEY, artist TEXT NOT NULL, venue TEXT NOT NULL, city TEXT NOT NULL,
      date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', performance_notes TEXT NOT NULL DEFAULT '',
      venue_notes TEXT NOT NULL DEFAULT '', performance_rating REAL, venue_rating REAL,
      favorite INTEGER NOT NULL DEFAULT 0, setlist_fm_id TEXT, setlist_fm_url TEXT,
      songs TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
    );
    CREATE TABLE gig_media (
      id TEXT PRIMARY KEY, gig_id TEXT NOT NULL, filename TEXT NOT NULL,
      mime_type TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE
    );
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, password_hash TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
  `);
  database.prepare(`INSERT INTO gigs
    (id, artist, venue, city, date, notes, performance_notes, venue_notes, performance_rating, favorite, songs, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('legacy-gig', 'Preserved Artist', 'Preserved Venue', 'Preserved City', '2026-01-20', 'Original note', 'Great performance', 'Dark room', 5, 1, JSON.stringify([{ title: 'Preserved Song', album: 'Preserved Album' }]), '2026-01-21T00:00:00.000Z');
  database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('legacy-media', 'legacy-gig', 'preserved-video.mp4', 'video/mp4', 123456, '2026-01-21T00:00:00.000Z');
  database.prepare('INSERT INTO profiles (id, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)')
    .run('legacy-owner', 'Preserved Owner', 'scrypt:preserved-hash', '2026-01-01T00:00:00.000Z');
  database.close();
}

test('a populated v0.1 database upgrades in place without losing shows, setlists, media or owner credentials', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'master-list-upgrade-'));
  const filename = path.join(root, 'master-list.sqlite');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  createV010Database(filename);

  const database = new Database(filename);
  migrateSchema(database);
  assert.doesNotThrow(() => migrateSchema(database));
  database.close();

  const upgraded = new Database(filename);
  const gig = upgraded.prepare('SELECT * FROM gigs WHERE id = ?').get('legacy-gig');
  assert.equal(gig.artist, 'Preserved Artist');
  assert.equal(gig.performance_notes, 'Great performance');
  assert.equal(gig.favorite, 1);
  assert.deepEqual(JSON.parse(gig.songs), [{ title: 'Preserved Song', album: 'Preserved Album' }]);
  assert.equal(gig.shared_id, 'legacy-gig');
  const media = upgraded.prepare('SELECT * FROM gig_media WHERE id = ?').get('legacy-media');
  assert.equal(media.gig_id, 'legacy-gig');
  assert.equal(media.filename, 'preserved-video.mp4');
  assert.equal(media.size, 123456);
  assert.equal(media.playback_status, 'not_started');
  const owner = upgraded.prepare('SELECT name, password_hash, is_admin FROM profiles WHERE id = ?').get('legacy-owner');
  assert.deepEqual(owner, { name: 'Preserved Owner', password_hash: 'scrypt:preserved-hash', is_admin: 1 });
  for (const table of ['media_playback_clips', 'peer_instances', 'peer_sync_conflicts', 'app_settings']) {
    assert.equal(upgraded.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?").pluck().get(table), 1, table);
  }
  assert.equal(upgraded.pragma('quick_check', { simple: true }), 'ok');
  upgraded.close();
});
