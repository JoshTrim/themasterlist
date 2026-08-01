'use strict';

const SCHEMA_VERSION = 1;

function migrateSchema(database) {
  const previousVersion = Number(database.pragma('user_version', { simple: true })) || 0;
  function addColumnIfMissing(table, column, definition) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((entry) => entry.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS gigs (
      id TEXT PRIMARY KEY,
      artist TEXT NOT NULL,
      venue TEXT NOT NULL,
      city TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      performance_notes TEXT NOT NULL DEFAULT '',
      venue_notes TEXT NOT NULL DEFAULT '',
      performance_rating REAL,
      venue_rating REAL,
      favorite INTEGER NOT NULL DEFAULT 0,
      setlist_fm_id TEXT,
      setlist_fm_url TEXT,
      songs TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS artist_info (
      lookup_name TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      image TEXT,
      image_position TEXT NOT NULL DEFAULT 'center',
      is_manual INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      updated_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS venue_info (
      lookup_name TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      image TEXT,
      image_position TEXT NOT NULL DEFAULT 'center',
      is_manual INTEGER NOT NULL DEFAULT 0,
      is_closed INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      updated_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS artist_genres (
      lookup_name TEXT PRIMARY KEY,
      artist_name TEXT NOT NULL,
      genres TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'itunes',
      updated_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS gig_media (
      id TEXT PRIMARY KEY,
      gig_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      is_cover INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      rotation INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'show',
      external_url TEXT,
      song_index INTEGER,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE
    )
  `);
  database.exec(`CREATE TABLE IF NOT EXISTS youtube_search_cache (cache_key TEXT PRIMARY KEY, results TEXT NOT NULL, created_at TEXT NOT NULL)`);
  database.exec(`CREATE TABLE IF NOT EXISTS album_lookup_cache (cache_key TEXT PRIMARY KEY, album TEXT, created_at TEXT NOT NULL)`);
  database.exec(`CREATE TABLE IF NOT EXISTS background_jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  database.exec(`CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    operation TEXT NOT NULL,
    quota_units INTEGER NOT NULL DEFAULT 1,
    status INTEGER,
    requested_at TEXT NOT NULL,
    usage_day TEXT NOT NULL
  )`);
  database.exec('CREATE INDEX IF NOT EXISTS api_usage_day_provider ON api_usage (usage_day, provider)');
  database.prepare("UPDATE background_jobs SET status = 'error', error = 'Interrupted by server restart', updated_at = ? WHERE status = 'running'").run(new Date().toISOString());
  addColumnIfMissing('artist_info', 'image_position', "TEXT NOT NULL DEFAULT 'center'");
  addColumnIfMissing('venue_info', 'image_position', "TEXT NOT NULL DEFAULT 'center'");
  addColumnIfMissing('artist_info', 'is_manual', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('venue_info', 'is_manual', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('venue_info', 'is_closed', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('gig_media', 'caption', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('gig_media', 'is_cover', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('gig_media', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('gig_media', 'rotation', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('gig_media', 'category', "TEXT NOT NULL DEFAULT 'show'");
  addColumnIfMissing('gig_media', 'external_url', 'TEXT');
  addColumnIfMissing('gig_media', 'song_index', 'INTEGER');
  addColumnIfMissing('gig_media', 'playback_filename', 'TEXT');
  addColumnIfMissing('gig_media', 'playback_mime', 'TEXT');
  addColumnIfMissing('gig_media', 'playback_status', "TEXT NOT NULL DEFAULT 'not_started'");
  addColumnIfMissing('gig_media', 'playback_error', 'TEXT');
  addColumnIfMissing('gig_media', 'checksum', 'TEXT');
  addColumnIfMissing('gig_media', 'recognition_status', "TEXT NOT NULL DEFAULT 'not_started'");
  addColumnIfMissing('gig_media', 'recognition_result', 'TEXT');
  addColumnIfMissing('gig_media', 'recognition_title', 'TEXT');
  addColumnIfMissing('gig_media', 'recognition_artist', 'TEXT');
  addColumnIfMissing('gig_media', 'recognition_album', 'TEXT');
  addColumnIfMissing('gig_media', 'recognition_error', 'TEXT');
  addColumnIfMissing('gig_media', 'recognition_override', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('gig_media', 'background_filename', 'TEXT');
  addColumnIfMissing('gig_media', 'background_status', "TEXT NOT NULL DEFAULT 'not_started'");
  addColumnIfMissing('gig_media', 'background_error', 'TEXT');
  addColumnIfMissing('gig_media', 'use_background_removed', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('gig_media', 'playback_preferred', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('gig_media', 'playback_start', 'REAL');
  addColumnIfMissing('gig_media', 'playback_end', 'REAL');
  addColumnIfMissing('gig_media', 'playback_clips_initialized', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('gig_media', 'source_description', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('gig_media', 'source_duration', 'REAL');
  addColumnIfMissing('gig_media', 'source_metadata_at', 'TEXT');
  database.exec(`
    CREATE TABLE IF NOT EXISTS media_playback_clips (
      media_id TEXT NOT NULL,
      song_index INTEGER NOT NULL,
      start_seconds REAL,
      end_seconds REAL,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (media_id, song_index),
      FOREIGN KEY (media_id) REFERENCES gig_media(id) ON DELETE CASCADE
    )
  `);
  addColumnIfMissing('media_playback_clips', 'priority', 'INTEGER NOT NULL DEFAULT 0');
  database.prepare(`INSERT OR IGNORE INTO media_playback_clips (media_id, song_index, start_seconds, end_seconds, created_at, updated_at)
    SELECT id, song_index, playback_start, playback_end, created_at, ? FROM gig_media
    WHERE playback_clips_initialized = 0 AND song_index IS NOT NULL AND mime_type LIKE 'video/%' AND category <> 'artifact'`).run(new Date().toISOString());
  database.prepare("UPDATE gig_media SET playback_clips_initialized = 1 WHERE playback_clips_initialized = 0 AND mime_type LIKE 'video/%'").run();
  database.prepare("UPDATE gig_media SET background_status = 'error', background_error = 'Interrupted by server restart' WHERE background_status = 'running'").run();
  database.prepare("UPDATE gig_media SET playback_status = 'ready', playback_error = NULL WHERE playback_filename IS NOT NULL").run();
  database.prepare("UPDATE gig_media SET playback_status = 'error', playback_error = 'Interrupted by server restart' WHERE playback_status = 'encoding'").run();
  database.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shared_shows (
      id TEXT PRIMARY KEY,
      source_gig_id TEXT,
      artist TEXT NOT NULL,
      venue TEXT NOT NULL,
      city TEXT NOT NULL,
      date TEXT NOT NULL,
      setlist_fm_id TEXT,
      setlist_fm_url TEXT,
      songs TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shared_attendees (
      show_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (show_id, profile_id),
      FOREIGN KEY (show_id) REFERENCES shared_shows(id) ON DELETE CASCADE,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS shared_reviews (
      show_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      performance_rating REAL,
      venue_rating REAL,
      favorite INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (show_id, profile_id),
      FOREIGN KEY (show_id) REFERENCES shared_shows(id) ON DELETE CASCADE,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
  `);
  database.pragma('foreign_keys = ON');
  addColumnIfMissing('profiles', 'password_hash', 'TEXT');
  addColumnIfMissing('profiles', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
  database.exec(`UPDATE profiles SET is_admin = 0
    WHERE is_admin = 1 AND id NOT IN (
      SELECT id FROM profiles WHERE is_admin = 1 ORDER BY created_at, id LIMIT 1
    )`);
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS profiles_single_owner ON profiles (is_admin) WHERE is_admin = 1');
  addColumnIfMissing('gigs', 'attendees', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing('gigs', 'shared_id', 'TEXT');
  database.prepare('UPDATE gigs SET shared_id = id WHERE shared_id IS NULL OR shared_id = ?').run('');
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS gigs_shared_id ON gigs (shared_id)');
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS invites (
      token_hash TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS instance_identity (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      instance_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT 'The Master List instance',
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS peer_instances (
      id TEXT PRIMARY KEY,
      peer_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      public_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'paired',
      created_at TEXT NOT NULL,
      last_seen_at TEXT
    );
    CREATE TABLE IF NOT EXISTS shared_gig_contributions (
      shared_gig_id TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      local_gig_id TEXT,
      participant_name TEXT NOT NULL DEFAULT '',
      performance_rating REAL,
      venue_rating REAL,
      favorite INTEGER NOT NULL DEFAULT 0,
      performance_notes TEXT NOT NULL DEFAULT '',
      venue_notes TEXT NOT NULL DEFAULT '',
      media_manifest TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (shared_gig_id, instance_id),
      FOREIGN KEY (shared_gig_id) REFERENCES shared_shows(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sync_events (
      event_id TEXT PRIMARY KEY,
      origin_instance_id TEXT NOT NULL,
      shared_gig_id TEXT,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      peer_id TEXT,
      shared_gig_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      read_at TEXT
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS peer_sync_baselines (
      shared_gig_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      local_hash TEXT NOT NULL,
      remote_hash TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (shared_gig_id, peer_id)
    );
    CREATE TABLE IF NOT EXISTS peer_sync_conflicts (
      id TEXT PRIMARY KEY,
      shared_gig_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      local_gig_id TEXT NOT NULL,
      local_payload TEXT NOT NULL,
      remote_payload TEXT NOT NULL,
      remote_snapshot TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution TEXT
    );
    CREATE TABLE IF NOT EXISTS peer_nonces (
      origin_instance_id TEXT NOT NULL,
      nonce TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      PRIMARY KEY (origin_instance_id, nonce)
    );
    CREATE TABLE IF NOT EXISTS peer_invites (
      nonce TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
  `);
  database.exec('CREATE INDEX IF NOT EXISTS notifications_unread ON notifications (read_at, created_at)');
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS peer_sync_conflicts_open ON peer_sync_conflicts (shared_gig_id, peer_id) WHERE status = 'open'");
  database.exec('CREATE INDEX IF NOT EXISTS peer_nonces_issued_at ON peer_nonces (issued_at)');
  if (previousVersion < SCHEMA_VERSION) database.pragma(`user_version = ${SCHEMA_VERSION}`);
  return { previousVersion, version: Math.max(previousVersion, SCHEMA_VERSION), expectedVersion: SCHEMA_VERSION, migrated: previousVersion < SCHEMA_VERSION, ahead: previousVersion > SCHEMA_VERSION };
}

module.exports = { SCHEMA_VERSION, migrateSchema };
