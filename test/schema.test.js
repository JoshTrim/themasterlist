const { afterEach, beforeEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');

describe('SQLite schema migrations', () => {
  let database;
  beforeEach(() => { database = new Database(':memory:'); migrateSchema(database); });
  afterEach(() => database.close());

  test('creates every current subsystem table and can run repeatedly', () => {
    assert.doesNotThrow(() => migrateSchema(database));
    const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all());
    for (const table of ['gigs', 'gig_media', 'media_playback_clips', 'profiles', 'sessions', 'instance_identity', 'peer_instances', 'peer_nonces', 'peer_sync_baselines', 'peer_sync_conflicts', 'app_settings', 'background_jobs']) assert.ok(tables.has(table), table);
  });

  test('contains columns introduced by incremental media and metadata migrations', () => {
    const mediaColumns = new Set(database.prepare('PRAGMA table_info(gig_media)').all().map((column) => column.name));
    for (const column of ['playback_filename', 'checksum', 'recognition_status', 'background_filename', 'playback_preferred', 'source_duration']) assert.ok(mediaColumns.has(column), column);
    const venueColumns = new Set(database.prepare('PRAGMA table_info(venue_info)').all().map((column) => column.name));
    assert.ok(venueColumns.has('image_position'));
    assert.ok(venueColumns.has('is_closed'));
  });

  test('enforces media ownership and cascade deletion', () => {
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO gigs (id, artist, venue, city, date, songs, created_at, shared_id) VALUES ('gig', 'Artist', 'Venue', 'City', '2026-01-01', '[]', ?, 'shared')`).run(now);
    database.prepare(`INSERT INTO gig_media (id, gig_id, filename, mime_type, size, created_at) VALUES ('media', 'gig', 'clip.mp4', 'video/mp4', 1, ?)`).run(now);
    database.prepare(`INSERT INTO media_playback_clips (media_id, song_index, created_at, updated_at) VALUES ('media', 0, ?, ?)`).run(now, now);
    database.prepare("DELETE FROM gigs WHERE id = 'gig'").run();
    assert.equal(database.prepare('SELECT COUNT(*) FROM gig_media').pluck().get(), 0);
    assert.equal(database.prepare('SELECT COUNT(*) FROM media_playback_clips').pluck().get(), 0);
  });
});
