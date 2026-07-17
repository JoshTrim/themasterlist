const http = require('node:http');
const Database = require('better-sqlite3');
const fs = require('node:fs/promises');
const legacyFs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash, generateKeyPairSync, sign: signPayload, verify: verifyPayload } = require('node:crypto');

if (process.env.MASTER_LIST_SKIP_ENV !== 'true') loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.MASTER_LIST_DATA_DIR ? path.resolve(process.env.MASTER_LIST_DATA_DIR) : path.join(ROOT, 'data');
const GIGS_FILE = path.join(DATA_DIR, 'gigs.json');
const DB_FILE = path.join(DATA_DIR, 'master-list.sqlite');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const CONNECTIONS_FILE = path.join(DATA_DIR, 'connections.json');
const GEOCODES_FILE = path.join(DATA_DIR, 'geocodes.json');
const SETLIST_API = 'https://api.setlist.fm/rest/1.0/search/setlists';
const pendingOAuth = new Map();
const rotateJobs = new Map();
const uploadSessions = new Map();
const MAX_MEDIA_SIZE = Number(process.env.MAX_MEDIA_SIZE_GB || 50) * 1024 * 1024 * 1024;

legacyFs.mkdirSync(DATA_DIR, { recursive: true });
const database = new Database(DB_FILE);
database.pragma('journal_mode = WAL');
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
    source TEXT,
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
`);
database.exec('CREATE INDEX IF NOT EXISTS notifications_unread ON notifications (read_at, created_at)');

function ensureInstanceIdentity() {
  const existing = database.prepare('SELECT * FROM instance_identity WHERE id = 1').get();
  if (existing) return existing;
  const keys = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const identity = { instanceId: randomUUID(), name: String(process.env.INSTANCE_NAME || 'The Master List instance').trim(), publicKey: keys.publicKey, privateKey: keys.privateKey, createdAt: new Date().toISOString() };
  database.prepare('INSERT INTO instance_identity (id, instance_id, name, public_key, private_key, created_at) VALUES (1, ?, ?, ?, ?, ?)').run(identity.instanceId, identity.name, identity.publicKey, identity.privateKey, identity.createdAt);
  return { id: 1, instance_id: identity.instanceId, name: identity.name, public_key: identity.publicKey, private_key: identity.privateKey, created_at: identity.createdAt };
}

ensureInstanceIdentity();

function addColumnIfMissing(table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function saveBackgroundJob(id, type, name, status, progress = 0, error = null) {
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO background_jobs (id, type, name, status, progress, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, progress=excluded.progress, error=excluded.error, updated_at=excluded.updated_at`).run(id, type, name, status, progress, error, now, now);
  rotateJobs.set(id, { id, type, name, status, progress, error });
}

function usageDay() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function usageProvider(provider, url) {
  const hint = String(provider || '').toLowerCase();
  let hostname = '';
  try { hostname = new URL(url).hostname.toLowerCase(); } catch { /* keep the provider hint */ }
  if (hint.includes('youtube') || (hostname.includes('googleapis.com') && String(url).includes('/youtube/v3/'))) return 'youtube';
  if (hint.includes('spotify') || hostname.includes('spotify.com')) return 'spotify';
  if (hint.includes('setlist') || hostname.includes('setlist.fm')) return 'setlist.fm';
  if (hint.includes('apple') || hostname.includes('apple.com')) return 'apple-music';
  if (hint.includes('audd') || hostname.includes('audd.io')) return 'audd';
  if (hint.includes('musicbrainz') || hostname.includes('musicbrainz.org')) return 'musicbrainz';
  if (hint.includes('wikipedia') || hostname.includes('wikipedia.org')) return 'wikipedia';
  if (hint.includes('google') || hostname.includes('googleapis.com')) return 'google';
  return hint || 'other';
}

function usageMeta(url, options = {}, provider = '') {
  const service = usageProvider(provider, url);
  let parsed;
  try { parsed = new URL(url); } catch { parsed = { pathname: url }; }
  const method = String(options.method || 'GET').toUpperCase();
  const segments = String(parsed.pathname || '').split('/').filter(Boolean);
  const operation = service === 'youtube'
    ? `youtube.${segments.at(-1) || 'request'}`
    : segments.slice(-2).join('/') || service;
  let quotaUnits = 1;
  // YouTube Data API costs are fixed by operation. OAuth refreshes are not
  // Data API quota calls, so record them for diagnostics with zero units.
  if (service === 'youtube') {
    if (!String(parsed.pathname).startsWith('/youtube/v3/')) quotaUnits = 0;
    else if (segments.at(-1) === 'search') quotaUnits = 100;
    else if (segments.at(-1) === 'playlists' && method === 'POST') quotaUnits = 50;
    else if (segments.at(-1) === 'playlistItems' && method === 'POST') quotaUnits = 50;
  }
  return { service, operation, quotaUnits };
}

function recordApiUsage(provider, operation, quotaUnits = 1, status = null, requestedAt = new Date().toISOString()) {
  try {
    database.prepare('INSERT INTO api_usage (provider, operation, quota_units, status, requested_at, usage_day) VALUES (?, ?, ?, ?, ?, ?)').run(provider, operation, Math.max(0, Number(quotaUnits) || 0), status, requestedAt, usageDay());
  } catch (error) {
    console.warn('[api-usage] could not record request:', error.message);
  }
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

async function readGigs() {
  return database.prepare('SELECT * FROM gigs ORDER BY favorite DESC, date DESC').all().map((row) => ({
    id: row.id,
    sharedId: row.shared_id || row.id,
    artist: row.artist,
    venue: row.venue,
    city: row.city,
    date: row.date,
    notes: row.notes,
    performanceNotes: row.performance_notes,
    venueNotes: row.venue_notes,
    performanceRating: row.performance_rating,
    venueRating: row.venue_rating,
    favorite: Boolean(row.favorite),
    setlistFmId: row.setlist_fm_id,
    setlistFmUrl: row.setlist_fm_url,
    songs: JSON.parse(row.songs || '[]'),
    attendees: JSON.parse(row.attendees || '[]'),
    media: mediaRows(row.id),
    createdAt: row.created_at
  }));
}

async function writeGigs(gigs) {
  const insert = database.prepare(`
    INSERT INTO gigs (id, shared_id, artist, venue, city, date, notes, performance_notes, venue_notes,
      performance_rating, venue_rating, favorite, setlist_fm_id, setlist_fm_url, songs, attendees, created_at)
    VALUES (@id, @sharedId, @artist, @venue, @city, @date, @notes, @performanceNotes, @venueNotes,
      @performanceRating, @venueRating, @favorite, @setlistFmId, @setlistFmUrl, @songs, @attendees, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      shared_id = excluded.shared_id, artist = excluded.artist, venue = excluded.venue, city = excluded.city, date = excluded.date,
      notes = excluded.notes, performance_notes = excluded.performance_notes, venue_notes = excluded.venue_notes,
      performance_rating = excluded.performance_rating, venue_rating = excluded.venue_rating, favorite = excluded.favorite,
      setlist_fm_id = excluded.setlist_fm_id, setlist_fm_url = excluded.setlist_fm_url, songs = excluded.songs, attendees = excluded.attendees
  `);
  const replace = database.transaction((records) => {
    for (const gig of records) insert.run({
      ...gig,
      sharedId: gig.sharedId || gig.id,
      notes: gig.notes || '',
      performanceNotes: gig.performanceNotes || gig.notes || '',
      venueNotes: gig.venueNotes || '',
      performanceRating: gig.performanceRating ?? null,
      venueRating: gig.venueRating ?? null,
      favorite: gig.favorite ? 1 : 0,
      setlistFmId: gig.setlistFmId || null,
      setlistFmUrl: gig.setlistFmUrl || null,
      songs: JSON.stringify(gig.songs || []),
      attendees: JSON.stringify(gig.attendees || []),
      createdAt: gig.createdAt || new Date().toISOString()
    });
  });
  replace(gigs);
}

function migrateLegacyGigs() {
  const count = database.prepare('SELECT COUNT(*) AS count FROM gigs').get().count;
  if (count > 0 || !legacyFs.existsSync(GIGS_FILE)) return;
  const legacyGigs = JSON.parse(legacyFs.readFileSync(GIGS_FILE, 'utf8'));
  if (legacyGigs.length) writeGigs(legacyGigs);
}

migrateLegacyGigs();

async function readConnections() {
  try {
    return JSON.parse(await fs.readFile(CONNECTIONS_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeConnections(connections) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONNECTIONS_FILE, JSON.stringify(connections, null, 2) + '\n', { mode: 0o600 });
}

async function readGeocodes() {
  try {
    return JSON.parse(await fs.readFile(GEOCODES_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeGeocodes(geocodes) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(GEOCODES_FILE, JSON.stringify(geocodes, null, 2) + '\n');
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(payload));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function passwordMatches(password, stored) {
  const [, salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

function cookieValue(request, name) {
  const value = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
}

function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }

function sessionCookieName() {
  const instanceId = database.prepare('SELECT instance_id FROM instance_identity WHERE id = 1').get()?.instance_id || 'local';
  return `master_list_session_${instanceId.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
}

function sessionCookieSecure() {
  if (process.env.SESSION_COOKIE_SECURE) return process.env.SESSION_COOKIE_SECURE === 'true';
  return String(process.env.INSTANCE_URL || process.env.APP_ORIGIN || '').startsWith('https://');
}

function expiredSessionCookies() {
  const attributes = `HttpOnly; SameSite=Lax; Path=/; Max-Age=0${sessionCookieSecure() ? '; Secure' : ''}`;
  return [`${sessionCookieName()}=; ${attributes}`, `master_list_session=; ${attributes}`];
}

function currentAccount(request) {
  // The legacy cookie fallback keeps existing users signed in through this
  // migration. New cookies are instance-specific so two servers on different
  // ports of the same hostname cannot overwrite one another.
  const token = cookieValue(request, sessionCookieName()) || cookieValue(request, 'master_list_session');
  if (!token) return null;
  const row = database.prepare(`SELECT p.id, p.name, p.is_admin AS isAdmin FROM sessions s JOIN profiles p ON p.id = s.profile_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(token), new Date().toISOString());
  return row || null;
}

function accountsConfigured() {
  return database.prepare('SELECT COUNT(*) AS count FROM profiles WHERE password_hash IS NOT NULL').get().count > 0;
}

function requireAccount(request) {
  const account = currentAccount(request);
  if (!account) {
    const error = new Error('Sign in to continue.');
    error.status = 401;
    throw error;
  }
  return account;
}

function sessionHeaders(profileId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  database.prepare('INSERT INTO sessions (token_hash, profile_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), profileId, expires);
  const secure = sessionCookieSecure() ? '; Secure' : '';
  return { 'Set-Cookie': [
    `${sessionCookieName()}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
    'master_list_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
  ] };
}

function validateAccount(body) {
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  if (!name || name.length > 80) throw new Error('Enter a name up to 80 characters.');
  if (password.length < 10) throw new Error('Use a password with at least 10 characters.');
  return { name, password };
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function appOrigin(request) {
  return process.env.APP_ORIGIN || `http://${request.headers.host}`;
}

function configured(provider) {
  if (provider === 'spotify') return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  if (provider === 'youtube') return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (provider === 'apple-music') return Boolean(process.env.APPLE_MUSIC_DEVELOPER_TOKEN);
  if (provider === 'audd') return Boolean(process.env.AUDD_API_TOKEN);
  return false;
}

async function providerResponse(url, options, provider) {
  const meta = usageMeta(url, options, provider);
  let result;
  try {
    result = await fetch(url, options);
  } catch (error) {
    recordApiUsage(meta.service, meta.operation, meta.quotaUnits, null);
    throw error;
  }
  recordApiUsage(meta.service, meta.operation, meta.quotaUnits, result.status);
  if (result.ok) return result.json();
  const body = await result.json().catch(() => ({}));
  const detail = body.error?.message || body.error_description || body.message || body.error || `HTTP ${result.status}`;
  throw new Error(`${provider}: ${detail}`);
}

async function fetchArtistInfo(name) {
  const requestedName = String(name || '').trim();
  if (!requestedName) throw new Error('An artist name is required.');
  const lookupName = requestedName.toLowerCase();
  const cached = database.prepare('SELECT title, description, bio, image, image_position AS imagePosition, is_manual AS isManual, source FROM artist_info WHERE lookup_name = ?').get(lookupName);
  if (cached) return { name: requestedName, ...cached };
  const headers = { 'User-Agent': 'TheMasterList/0.1 personal-live-music-archive', 'Accept-Language': 'en' };
  let title = requestedName;
  const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
  searchUrl.searchParams.set('action', 'query'); searchUrl.searchParams.set('list', 'search');
  searchUrl.searchParams.set('srsearch', `${requestedName} musician`); searchUrl.searchParams.set('srlimit', '1'); searchUrl.searchParams.set('format', 'json');
  const searchResponse = await fetch(searchUrl, { headers });
  const result = searchResponse.ok ? await searchResponse.json() : null;
  title = result?.query?.search?.[0]?.title || requestedName;
  let response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers });
  if (!response.ok && title !== requestedName) response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(requestedName.replace(/ /g, '_'))}`, { headers });
  if (!response.ok) {
    const fallback = { name: requestedName, title: requestedName, bio: '', description: '', image: null, source: null };
    database.prepare('INSERT OR REPLACE INTO artist_info (lookup_name, title, description, bio, image, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(lookupName, fallback.title, fallback.description, fallback.bio, fallback.image, fallback.source, new Date().toISOString());
    return fallback;
  }
  const summary = await response.json();
  const info = { name: requestedName, title: summary.title || requestedName, description: summary.description || '', bio: summary.extract || '', image: summary.thumbnail?.source || summary.originalimage?.source || null, source: summary.content_urls?.desktop?.page || null };
  database.prepare('INSERT OR REPLACE INTO artist_info (lookup_name, title, description, bio, image, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.source, new Date().toISOString());
  return info;
}

async function fetchVenueInfo(name, city = '') {
  const requestedName = String(name || '').trim();
  const requestedCity = String(city || '').trim();
  if (!requestedName) throw new Error('A venue name is required.');
  const lookupName = `${requestedName}|${requestedCity}`.toLowerCase();
  const venueWords = requestedName.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
  const cached = database.prepare('SELECT title, description, bio, image, image_position AS imagePosition, is_manual AS isManual, source FROM venue_info WHERE lookup_name = ?').get(lookupName);
  if (cached && (cached.isManual || (venueWords.every((word) => cached.title.toLowerCase().includes(word)) && (cached.bio || cached.description || cached.image)))) return { name: requestedName, city: requestedCity, ...cached };
  if (cached) database.prepare('DELETE FROM venue_info WHERE lookup_name = ?').run(lookupName);
  const headers = { 'User-Agent': 'TheMasterList/0.1 personal-live-music-archive', 'Accept-Language': 'en' };
  const officialSources = { 'fortitude music hall|brisbane': 'https://www.thefortitude.com.au/venue-history' };
  const officialUrl = officialSources[lookupName];
  if (officialUrl) {
    const officialResponse = await fetch(officialUrl, { headers });
    if (officialResponse.ok) {
      const html = await officialResponse.text();
      const title = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.replace(/\s*[-|].*$/, '').trim() || requestedName;
      const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] || '';
      const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || null;
      const bio = description || `${title} is a live music venue in ${requestedCity}.`;
      const info = { name: requestedName, city: requestedCity, title, description, bio, image, source: officialUrl };
      database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.source, new Date().toISOString());
      return info;
    }
  }
  if (process.env.GOOGLE_CUSTOM_SEARCH_API_KEY && process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
    const googleUrl = new URL('https://www.googleapis.com/customsearch/v1');
    googleUrl.searchParams.set('key', process.env.GOOGLE_CUSTOM_SEARCH_API_KEY);
    googleUrl.searchParams.set('cx', process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID);
    googleUrl.searchParams.set('q', `${requestedName} ${requestedCity} official venue`);
    const googleResponse = await fetch(googleUrl, { headers });
    const result = googleResponse.ok ? await googleResponse.json() : null;
    const officialResult = result?.items?.find((item) => /official|venue|music|theatre|theater/i.test(`${item.title} ${item.snippet}`));
    if (officialResult?.link) {
      const pageResponse = await fetch(officialResult.link, { headers });
      if (pageResponse.ok) {
        const html = await pageResponse.text();
        const title = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.replace(/\s*[-|].*$/, '').trim() || requestedName;
        const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] || officialResult.snippet || '';
        const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || null;
        const info = { name: requestedName, city: requestedCity, title, description, bio: description, image, source: officialResult.link };
        database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.source, new Date().toISOString());
        return info;
      }
    }
  }
  const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
  searchUrl.searchParams.set('action', 'query'); searchUrl.searchParams.set('list', 'search'); searchUrl.searchParams.set('srlimit', '1'); searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('srsearch', `${requestedName} ${requestedCity} concert venue`);
  const searchResponse = await fetch(searchUrl, { headers });
  const result = searchResponse.ok ? await searchResponse.json() : null;
  const candidates = result?.query?.search || [];
  const title = candidates.find((candidate) => venueWords.every((word) => candidate.title.toLowerCase().includes(word)))?.title || requestedName;
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers });
  const summary = response.ok ? await response.json() : {};
  const info = { name: requestedName, city: requestedCity, title: summary.title || requestedName, description: summary.description || '', bio: summary.extract || '', image: summary.thumbnail?.source || summary.originalimage?.source || null, source: summary.content_urls?.desktop?.page || null };
  database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.source, new Date().toISOString());
  return info;
}

function playlistDetails(gig) {
  const date = new Date(`${gig.date}T12:00:00`).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  return {
    name: `The Master List · ${gig.artist} · ${date}`,
    description: `Setlist from ${gig.artist} at ${gig.venue}, ${gig.city} on ${date}. Created by The Master List.`
  };
}

function findGig(gigs, id) {
  const gig = gigs.find((entry) => entry.id === id);
  if (!gig) throw new Error('Gig not found.');
  if (!gig.songs?.length) throw new Error('This show has no setlist to export.');
  return gig;
}

function profileRows() {
  return database.prepare('SELECT id, name, created_at AS createdAt FROM profiles ORDER BY name COLLATE NOCASE').all();
}

function instanceRow() {
  const row = database.prepare('SELECT instance_id AS instanceId, name, public_key AS publicKey, created_at AS createdAt FROM instance_identity WHERE id = 1').get();
  return row || ensureInstanceIdentity();
}

function peerRows() {
  return database.prepare('SELECT id, peer_id AS peerId, name, base_url AS baseUrl, public_key AS publicKey, status, created_at AS createdAt, last_seen_at AS lastSeenAt FROM peer_instances ORDER BY name COLLATE NOCASE').all();
}

function normaliseGigAttendees(value, account) {
  const owner = account ? { id: account.id, type: 'owner', name: account.name } : null;
  const peers = new Map(peerRows().map((peer) => [peer.peerId, { id: peer.peerId, type: 'peer', name: peer.name }]));
  const selected = Array.isArray(value) ? value : [];
  const attendees = [];
  if (owner) attendees.push(owner);
  for (const entry of selected) {
    const peerId = String(entry?.id || '').trim();
    if (peers.has(peerId) && !attendees.some((attendee) => attendee.id === peerId)) attendees.push(peers.get(peerId));
  }
  return attendees;
}

function peerInviteToken(request) {
  const identity = database.prepare('SELECT instance_id, name, public_key, private_key FROM instance_identity WHERE id = 1').get();
  const payload = {
    version: 1,
    peerId: identity.instance_id,
    name: identity.name,
    publicKey: identity.public_key,
    baseUrl: String(process.env.INSTANCE_URL || appOrigin(request)).replace(/\/$/, ''),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    nonce: randomBytes(18).toString('base64url')
  };
  const encodedPayload = JSON.stringify(payload);
  const signature = signPayload(null, Buffer.from(encodedPayload), identity.private_key).toString('base64url');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');
}

function parsePeerInvite(token) {
  let envelope;
  try { envelope = JSON.parse(Buffer.from(String(token || ''), 'base64url').toString('utf8')); } catch { throw new Error('That pairing invite is not valid.'); }
  const payload = envelope?.payload;
  if (!payload?.peerId || !payload?.publicKey || !payload?.name || !payload?.expiresAt || !envelope.signature) throw new Error('That pairing invite is incomplete.');
  if (Date.parse(payload.expiresAt) <= Date.now()) throw new Error('That pairing invite has expired.');
  if (!verifyPayload(null, Buffer.from(JSON.stringify(payload)), payload.publicKey, Buffer.from(envelope.signature, 'base64url'))) throw new Error('That pairing invite signature could not be verified.');
  return payload;
}

function signInstanceEnvelope(payload) {
  const identity = database.prepare('SELECT instance_id, private_key FROM instance_identity WHERE id = 1').get();
  const signedPayload = {
    ...payload,
    originInstanceId: identity.instance_id,
    issuedAt: new Date().toISOString(),
    nonce: randomBytes(18).toString('base64url')
  };
  const encoded = JSON.stringify(signedPayload);
  return { payload: signedPayload, signature: signPayload(null, Buffer.from(encoded), identity.private_key).toString('base64url') };
}

function verifyPeerEnvelope(envelope, expectedPeerId = null) {
  const payload = envelope?.payload;
  const originInstanceId = String(payload?.originInstanceId || '').trim();
  if (!originInstanceId || !envelope?.signature) throw new Error('Signed peer request is incomplete.');
  if (expectedPeerId && originInstanceId !== expectedPeerId) throw new Error('Peer response came from an unexpected instance.');
  const peer = database.prepare('SELECT * FROM peer_instances WHERE peer_id = ?').get(originInstanceId);
  if (!peer) throw new Error('This instance is not paired.');
  const issuedAt = Date.parse(payload.issuedAt);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 10 * 60 * 1000) throw new Error('Signed peer request has expired.');
  const valid = verifyPayload(null, Buffer.from(JSON.stringify(payload)), peer.public_key, Buffer.from(envelope.signature, 'base64url'));
  if (!valid) throw new Error('Peer signature could not be verified.');
  return { payload, peer };
}

function verifySelfSignedPairEnvelope(envelope) {
  const payload = envelope?.payload;
  if (payload?.type !== 'pair' || !payload.originInstanceId || !payload.publicKey || !payload.name || !envelope?.signature) throw new Error('Pair confirmation is incomplete.');
  const issuedAt = Date.parse(payload.issuedAt);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 10 * 60 * 1000) throw new Error('Pair confirmation has expired.');
  if (!verifyPayload(null, Buffer.from(JSON.stringify(payload)), payload.publicKey, Buffer.from(envelope.signature, 'base64url'))) throw new Error('Pair confirmation signature could not be verified.');
  return payload;
}

async function confirmPairWithRemote(peer, inviteToken, request) {
  if (!peer?.base_url) return false;
  const identity = database.prepare('SELECT instance_id, name, public_key FROM instance_identity WHERE id = 1').get();
  const envelope = signInstanceEnvelope({
    type: 'pair',
    name: identity.name,
    publicKey: identity.public_key,
    baseUrl: String(process.env.INSTANCE_URL || appOrigin(request)).replace(/\/$/, '')
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${peer.base_url.replace(/\/$/, '')}/api/sync/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteToken, envelope }), signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Peer returned HTTP ${response.status}.`);
    const verified = verifyPeerEnvelope(body, peer.peer_id).payload;
    if (verified.requestNonce !== envelope.payload.nonce) throw new Error('Pair confirmation did not match this request.');
    return true;
  } finally { clearTimeout(timeout); }
}

async function postPeerEnvelope(peer, pathname, payload) {
  if (!peer?.base_url) throw new Error('This peer does not have a connection URL.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const envelope = signInstanceEnvelope(payload);
    const response = await fetch(`${peer.base_url.replace(/\/$/, '')}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Peer returned HTTP ${response.status}.`);
    const verified = verifyPeerEnvelope(body, peer.peer_id).payload;
    if (verified.requestNonce !== envelope.payload.nonce) throw new Error('Peer response did not match this request.');
    return verified;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Peer connection timed out.');
    throw error;
  } finally { clearTimeout(timeout); }
}

async function syncWithPeer(peer) {
  if (!peer?.base_url) throw new Error('Add a peer URL before syncing this instance.');
  try {
    const snapshots = localSyncSnapshots(peer.peer_id);
    const reply = await postPeerEnvelope(peer, '/api/sync/exchange', { type: 'sync-exchange', snapshots });
    if (reply.type !== 'sync-response' || !Array.isArray(reply.snapshots)) throw new Error('Peer returned an invalid sync response.');
    let applied = 0;
    for (const snapshot of reply.snapshots.slice(0, 500)) if (applySyncSnapshot(snapshot, peer)) applied += 1;
    const now = new Date().toISOString();
    database.prepare("UPDATE peer_instances SET status = 'connected', last_seen_at = ? WHERE id = ?").run(now, peer.id);
    return { ok: true, peerId: peer.id, peerName: peer.name, sent: snapshots.length, received: reply.snapshots.length, applied, remoteApplied: Number(reply.applied || 0), lastSeenAt: now };
  } catch (error) {
    database.prepare("UPDATE peer_instances SET status = 'unreachable' WHERE id = ?").run(peer.id);
    throw error;
  }
}

function localParticipantName() {
  return database.prepare('SELECT name FROM profiles WHERE is_admin = 1 ORDER BY created_at LIMIT 1').get()?.name || instanceRow().name;
}

function syncMediaManifest(gig) {
  return (gig.media || []).map((item) => ({
    id: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    caption: item.caption || '',
    size: Number(item.size || 0),
    checksum: item.checksum || null,
    category: item.category || 'show',
    externalUrl: item.externalUrl || null,
    songIndex: item.songIndex ?? null,
    playbackPreferred: Boolean(item.playbackPreferred),
    playbackStart: item.playbackStart ?? null,
    playbackEnd: item.playbackEnd ?? null,
    playbackClips: Array.isArray(item.playbackClips) ? item.playbackClips : []
  }));
}

function ensureSharedShowForGig(gig) {
  const sharedGigId = gig.sharedId || gig.id;
  database.prepare(`INSERT INTO shared_shows
    (id, source_gig_id, artist, venue, city, date, setlist_fm_id, setlist_fm_url, songs, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET source_gig_id=COALESCE(shared_shows.source_gig_id, excluded.source_gig_id),
      artist=excluded.artist, venue=excluded.venue, city=excluded.city, date=excluded.date,
      setlist_fm_id=excluded.setlist_fm_id, setlist_fm_url=excluded.setlist_fm_url, songs=excluded.songs`).run(
    sharedGigId, gig.id, gig.artist, gig.venue, gig.city, gig.date, gig.setlistFmId || null, gig.setlistFmUrl || null,
    JSON.stringify(gig.songs || []), gig.createdAt || new Date().toISOString()
  );
  return sharedGigId;
}

function upsertLocalContribution(gig, updatedAt = new Date().toISOString()) {
  const sharedGigId = ensureSharedShowForGig(gig);
  const identity = instanceRow();
  const media = syncMediaManifest(gig);
  database.prepare(`INSERT INTO shared_gig_contributions
    (shared_gig_id, instance_id, local_gig_id, participant_name, performance_rating, venue_rating, favorite, performance_notes, venue_notes, media_manifest, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(shared_gig_id, instance_id) DO UPDATE SET local_gig_id=excluded.local_gig_id,
      participant_name=excluded.participant_name, performance_rating=excluded.performance_rating,
      venue_rating=excluded.venue_rating, favorite=excluded.favorite, performance_notes=excluded.performance_notes,
      venue_notes=excluded.venue_notes, media_manifest=excluded.media_manifest, updated_at=excluded.updated_at`).run(
    sharedGigId, identity.instanceId, gig.id, localParticipantName(), gig.performanceRating ?? null, gig.venueRating ?? null,
    gig.favorite ? 1 : 0, gig.performanceNotes || gig.notes || '', gig.venueNotes || '', JSON.stringify(media), updatedAt
  );
  return { sharedGigId, contribution: sharedContributionRows(sharedGigId).find((entry) => entry.instanceId === identity.instanceId) };
}

function localSyncSnapshots(peerId) {
  const identity = instanceRow();
  return database.prepare('SELECT id FROM gigs ORDER BY created_at').all().map((row) => findGigSync(row.id)).filter((gig) =>
    (gig.attendees || []).some((attendee) => attendee.id === peerId)
  ).map((gig) => {
    const updatedAt = new Date().toISOString();
    const { sharedGigId, contribution } = upsertLocalContribution(gig, updatedAt);
    const attendees = (gig.attendees || []).map((attendee) => attendee.type === 'owner'
      ? { id: identity.instanceId, type: 'instance', name: localParticipantName() }
      : { id: attendee.id, type: 'instance', name: attendee.name });
    const show = { artist: gig.artist, venue: gig.venue, city: gig.city, date: gig.date, setlistFmId: gig.setlistFmId, setlistFmUrl: gig.setlistFmUrl, songs: gig.songs || [] };
    const contributionContent = { ...contribution };
    delete contributionContent.updatedAt;
    const eventPayload = { sharedGigId, instanceId: identity.instanceId, show, attendees, contribution: contributionContent };
    return {
      eventId: createHash('sha256').update(JSON.stringify(eventPayload)).digest('hex'),
      sharedGigId,
      show,
      attendees,
      contribution
    };
  });
}

function matchingLocalGig(show) {
  return database.prepare(`SELECT id, shared_id FROM gigs WHERE lower(artist) = lower(?) AND lower(venue) = lower(?)
    AND lower(city) = lower(?) AND date = ? ORDER BY created_at LIMIT 1`).get(show.artist, show.venue, show.city, show.date);
}

function applySyncSnapshot(snapshot, originPeer) {
  if (!snapshot?.eventId || !snapshot?.sharedGigId || !snapshot?.show || !snapshot?.contribution) return false;
  if (snapshot.contribution.instanceId !== originPeer.peer_id) throw new Error('Peer contribution identity does not match its signature.');
  if (database.prepare('SELECT 1 FROM sync_events WHERE event_id = ?').get(snapshot.eventId)) return false;
  const isNewPeerContribution = !database.prepare('SELECT 1 FROM shared_gig_contributions WHERE shared_gig_id = ? AND instance_id = ?').get(snapshot.sharedGigId, originPeer.peer_id);
  const show = snapshot.show;
  if (![show.artist, show.venue, show.city].every((value) => typeof value === 'string') || typeof show.date !== 'string') throw new Error('Peer sent an invalid shared show.');
  let local = database.prepare('SELECT id, shared_id FROM gigs WHERE shared_id = ?').get(snapshot.sharedGigId);
  if (!local) local = matchingLocalGig(show);
  if (local && local.shared_id !== snapshot.sharedGigId && !database.prepare('SELECT 1 FROM gigs WHERE shared_id = ?').get(snapshot.sharedGigId)) {
    database.prepare('UPDATE gigs SET shared_id = ? WHERE id = ?').run(snapshot.sharedGigId, local.id);
  }
  const now = new Date().toISOString();
  database.transaction(() => {
    database.prepare(`INSERT INTO shared_shows
      (id, source_gig_id, artist, venue, city, date, setlist_fm_id, setlist_fm_url, songs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET source_gig_id=COALESCE(shared_shows.source_gig_id, excluded.source_gig_id),
        artist=excluded.artist, venue=excluded.venue, city=excluded.city, date=excluded.date,
        setlist_fm_id=excluded.setlist_fm_id, setlist_fm_url=excluded.setlist_fm_url, songs=excluded.songs`).run(
      snapshot.sharedGigId, local?.id || null, show.artist, show.venue, show.city, show.date,
      show.setlistFmId || null, show.setlistFmUrl || null, JSON.stringify(Array.isArray(show.songs) ? show.songs : []), now
    );
    const contribution = snapshot.contribution;
    database.prepare(`INSERT INTO shared_gig_contributions
      (shared_gig_id, instance_id, local_gig_id, participant_name, performance_rating, venue_rating, favorite, performance_notes, venue_notes, media_manifest, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shared_gig_id, instance_id) DO UPDATE SET participant_name=excluded.participant_name,
        performance_rating=excluded.performance_rating, venue_rating=excluded.venue_rating, favorite=excluded.favorite,
        performance_notes=excluded.performance_notes, venue_notes=excluded.venue_notes,
        media_manifest=excluded.media_manifest, updated_at=excluded.updated_at
      WHERE excluded.updated_at >= shared_gig_contributions.updated_at`).run(
      snapshot.sharedGigId, originPeer.peer_id, null, String(contribution.participantName || originPeer.name).slice(0, 100),
      normaliseRating(contribution.performanceRating), normaliseRating(contribution.venueRating), contribution.favorite ? 1 : 0,
      String(contribution.performanceNotes || '').slice(0, 20_000), String(contribution.venueNotes || '').slice(0, 20_000), JSON.stringify(Array.isArray(contribution.media) ? contribution.media.slice(0, 500) : []),
      contribution.updatedAt || now
    );
    if (local) {
      const gigRow = database.prepare('SELECT attendees FROM gigs WHERE id = ?').get(local.id);
      const attendees = JSON.parse(gigRow?.attendees || '[]');
      if (!attendees.some((attendee) => attendee.id === originPeer.peer_id)) attendees.push({ id: originPeer.peer_id, type: 'peer', name: originPeer.name });
      database.prepare('UPDATE gigs SET attendees = ? WHERE id = ?').run(JSON.stringify(attendees), local.id);
      upsertLocalContribution(findGigSync(local.id), now);
    }
    database.prepare('INSERT INTO sync_events (event_id, origin_instance_id, shared_gig_id, event_type, payload, created_at, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      snapshot.eventId, originPeer.peer_id, snapshot.sharedGigId, 'shared-gig.snapshot', JSON.stringify(snapshot), contribution.updatedAt || now, now
    );
    if (isNewPeerContribution) {
      const notificationId = createHash('sha256').update(`peer-show:${originPeer.peer_id}:${snapshot.sharedGigId}`).digest('hex');
      database.prepare(`INSERT OR IGNORE INTO notifications
        (id, type, peer_id, shared_gig_id, title, body, created_at)
        VALUES (?, 'peer-show-shared', ?, ?, ?, ?, ?)`).run(
        notificationId, originPeer.peer_id, snapshot.sharedGigId, `${originPeer.name} shared a show`,
        `${show.artist} at ${show.venue}${show.city ? `, ${show.city}` : ''}`, now
      );
    }
  })();
  return true;
}

function sharedContributionRows(sharedGigId) {
  return database.prepare(`SELECT shared_gig_id AS sharedGigId, instance_id AS instanceId, local_gig_id AS localGigId,
    participant_name AS participantName, performance_rating AS performanceRating, venue_rating AS venueRating,
    favorite, performance_notes AS performanceNotes, venue_notes AS venueNotes, media_manifest AS mediaManifest, updated_at AS updatedAt
    FROM shared_gig_contributions WHERE shared_gig_id = ? ORDER BY updated_at`).all(sharedGigId).map((entry) => ({
    ...entry,
    favorite: Boolean(entry.favorite),
    media: JSON.parse(entry.mediaManifest || '[]')
  }));
}

function sharedShowRows() {
  const shows = database.prepare('SELECT * FROM shared_shows ORDER BY date DESC').all();
  const attendees = database.prepare(`
    SELECT a.show_id AS showId, p.id, p.name
    FROM shared_attendees a JOIN profiles p ON p.id = a.profile_id
    ORDER BY p.name COLLATE NOCASE
  `).all();
  const reviews = database.prepare(`
    SELECT r.show_id AS showId, r.profile_id AS profileId, p.name,
      r.performance_rating AS performanceRating, r.venue_rating AS venueRating,
      r.favorite, r.notes, r.updated_at AS updatedAt
    FROM shared_reviews r JOIN profiles p ON p.id = r.profile_id
  `).all();
  return shows.map((show) => ({
    id: show.id,
    sourceGigId: show.source_gig_id,
    artist: show.artist,
    venue: show.venue,
    city: show.city,
    date: show.date,
    setlistFmId: show.setlist_fm_id,
    setlistFmUrl: show.setlist_fm_url,
    songs: JSON.parse(show.songs || '[]'),
    createdAt: show.created_at,
    attendees: attendees.filter((person) => person.showId === show.id),
    reviews: reviews.filter((review) => review.showId === show.id).map((review) => ({ ...review, favorite: Boolean(review.favorite) }))
    , contributions: sharedContributionRows(show.id)
  }));
}

function requireProfile(profileId) {
  const profile = database.prepare('SELECT id, name FROM profiles WHERE id = ?').get(profileId);
  if (!profile) throw new Error('Choose a profile first.');
  return profile;
}

function createSharedShow(sourceGigId, profileId) {
  const profile = requireProfile(profileId);
  const gig = findGigSync(sourceGigId);
  const existing = database.prepare('SELECT id FROM shared_shows WHERE source_gig_id = ?').get(sourceGigId);
  if (existing) return existing.id;
  const id = gig.sharedId || gig.id;
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO shared_shows
    (id, source_gig_id, artist, venue, city, date, setlist_fm_id, setlist_fm_url, songs, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET source_gig_id=excluded.source_gig_id, artist=excluded.artist,
      venue=excluded.venue, city=excluded.city, date=excluded.date, setlist_fm_id=excluded.setlist_fm_id,
      setlist_fm_url=excluded.setlist_fm_url, songs=excluded.songs`).run(
    id, sourceGigId, gig.artist, gig.venue, gig.city, gig.date, gig.setlistFmId, gig.setlistFmUrl, JSON.stringify(gig.songs || []), now
  );
  database.prepare('INSERT INTO shared_attendees (show_id, profile_id, joined_at) VALUES (?, ?, ?)').run(id, profile.id, now);
  database.prepare(`INSERT INTO shared_gig_contributions
    (shared_gig_id, instance_id, local_gig_id, participant_name, performance_rating, venue_rating, favorite, performance_notes, venue_notes, media_manifest, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, instanceRow().instanceId, gig.id, profile.name, gig.performanceRating ?? null, gig.venueRating ?? null,
    gig.favorite ? 1 : 0, gig.performanceNotes || gig.notes || '', gig.venueNotes || '', JSON.stringify(gig.media || []), now
  );
  return id;
}

function findGigSync(id) {
  const row = database.prepare('SELECT * FROM gigs WHERE id = ?').get(id);
  if (!row) throw new Error('Gig not found.');
  return {
    id: row.id, sharedId: row.shared_id || row.id, artist: row.artist, venue: row.venue, city: row.city, date: row.date,
    setlistFmId: row.setlist_fm_id, setlistFmUrl: row.setlist_fm_url, songs: JSON.parse(row.songs || '[]'),
    attendees: JSON.parse(row.attendees || '[]'),
    notes: row.notes, performanceNotes: row.performance_notes, venueNotes: row.venue_notes,
    performanceRating: row.performance_rating, venueRating: row.venue_rating, favorite: Boolean(row.favorite),
    media: mediaRows(row.id)
  };
}

function readGigsSync() {
  return { find: (id) => findGigSync(id) };
}

function mediaExtension(mimeType, filename) {
  const known = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
  return known[mimeType] || path.extname(filename || '').slice(1).replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'bin';
}
function mediaCategory(value) { return String(value || '').toLowerCase() === 'artifact' ? 'artifact' : 'show'; }
function safeMediaName(value) { return String(value || 'undated').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'unknown'; }
async function hashFile(filePath) { const hash = createHash('sha256'); for await (const chunk of legacyFs.createReadStream(filePath)) hash.update(chunk); return hash.digest('hex'); }
function optimizeMp4(filePath) {
  return new Promise((resolve) => {
    const outputPath = `${filePath}.faststart`;
    const process = spawn('ffmpeg', ['-y', '-nostdin', '-i', filePath, '-c', 'copy', '-movflags', '+faststart', outputPath]);
    process.on('close', async (code) => { if (code === 0) { await fs.rename(outputPath, filePath).catch(() => {}); } else await fs.rm(outputPath, { force: true }).catch(() => {}); resolve(); });
    process.on('error', () => resolve());
  });
}
function createPlaybackProxy(filePath, outputPath) {
  return new Promise((resolve) => { console.log(`[media] starting playback encode: ${filePath}`); const process = spawn('ffmpeg', ['-y', '-nostdin', '-i', filePath, '-vf', 'scale=-2:1080', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath]); process.on('close', (code) => { console.log(`[media] playback encode ${code === 0 ? 'complete' : `failed (${code})`}: ${outputPath}`); resolve(code === 0); }); process.on('error', (error) => { console.error('[media] ffmpeg could not start:', error.message); resolve(false); }); });
}

function formatMediaRow(media) {
  const useBackgroundRemoved = Boolean(media.useBackgroundRemoved && media.backgroundFilename);
  const external = Boolean(media.externalUrl);
  const originalExists = external || Boolean(media.filename && legacyFs.existsSync(path.join(MEDIA_DIR, media.filename)));
  const playbackExists = Boolean(media.playbackFilename && legacyFs.existsSync(path.join(MEDIA_DIR, media.playbackFilename)));
  let playbackSize = 0;
  if (playbackExists) {
    try { playbackSize = legacyFs.statSync(path.join(MEDIA_DIR, media.playbackFilename)).size; } catch { playbackSize = 0; }
  }
  return {
    ...media,
    isCover: Boolean(media.isCover),
    playbackPreferred: Boolean(media.playbackPreferred),
    playbackStart: media.playbackStart === null || media.playbackStart === undefined ? null : Number(media.playbackStart),
    playbackEnd: media.playbackEnd === null || media.playbackEnd === undefined ? null : Number(media.playbackEnd),
    sourceDuration: media.sourceDuration === null || media.sourceDuration === undefined ? null : Number(media.sourceDuration),
    recognitionOverride: Boolean(media.recognitionOverride),
    useBackgroundRemoved,
    rotation: Number(media.rotation || 0),
    songIndex: media.songIndex === null ? null : Number(media.songIndex),
    originalExists,
    playbackExists,
    playbackSize,
    playbackStatus: external ? 'external' : !String(media.mimeType || '').startsWith('video/') ? 'not_required' : !originalExists ? 'missing' : playbackExists ? 'ready' : media.playbackStatus || 'not_started',
    url: media.externalUrl || `/api/media/${media.id}${useBackgroundRemoved ? '?variant=cutout' : ''}`
  };
}

function mediaRows(gigId) {
  const rows = database.prepare('SELECT id, filename, playback_filename AS playbackFilename, playback_mime AS playbackMime, playback_status AS playbackStatus, playback_error AS playbackError, mime_type AS mimeType, caption, is_cover AS isCover, sort_order AS sortOrder, rotation, category, external_url AS externalUrl, song_index AS songIndex, playback_preferred AS playbackPreferred, playback_start AS playbackStart, playback_end AS playbackEnd, source_description AS sourceDescription, source_duration AS sourceDuration, source_metadata_at AS sourceMetadataAt, size, created_at AS createdAt, recognition_status AS recognitionStatus, recognition_title AS recognitionTitle, recognition_artist AS recognitionArtist, recognition_album AS recognitionAlbum, recognition_error AS recognitionError, recognition_override AS recognitionOverride, background_filename AS backgroundFilename, background_status AS backgroundStatus, background_error AS backgroundError, use_background_removed AS useBackgroundRemoved FROM gig_media WHERE gig_id = ? ORDER BY sort_order, created_at').all(gigId).map(formatMediaRow);
  const clips = database.prepare(`SELECT clips.media_id AS mediaId, clips.song_index AS songIndex, clips.start_seconds AS startSeconds, clips.end_seconds AS endSeconds, clips.priority
    FROM media_playback_clips clips JOIN gig_media media ON media.id = clips.media_id WHERE media.gig_id = ? ORDER BY clips.song_index, clips.priority, clips.created_at`).all(gigId);
  const byMedia = new Map();
  clips.forEach((clip) => { if (!byMedia.has(clip.mediaId)) byMedia.set(clip.mediaId, []); byMedia.get(clip.mediaId).push({ songIndex: Number(clip.songIndex), startSeconds: clip.startSeconds === null ? null : Number(clip.startSeconds), endSeconds: clip.endSeconds === null ? null : Number(clip.endSeconds), priority: Number(clip.priority) || 0 }); });
  rows.forEach((media) => { media.playbackClips = byMedia.get(media.id) || []; });
  return rows;
}

function removeImageBackground(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const bundledCommand = path.join(ROOT, '.venv', 'bin', 'rembg');
    const command = process.env.REMBG_COMMAND || (legacyFs.existsSync(bundledCommand) ? bundledCommand : 'rembg');
    const model = String(process.env.REMBG_MODEL || 'isnet-general-use').trim();
    const child = spawn(command, ['i', '-m', model, inputPath, outputPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => { error += chunk.toString(); });
    child.on('error', (spawnError) => {
      if (spawnError.code === 'ENOENT') reject(new Error('Background removal is not installed. Run npm run setup:background-removal, then restart the server.'));
      else reject(spawnError);
    });
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error.slice(-700) || 'Background removal failed.')));
  });
}

function probeDuration(inputPath) { return new Promise((resolve) => { const probe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath]); let out = ''; probe.stdout.on('data', (chunk) => { out += chunk; }); probe.on('close', () => resolve(Number(out.trim()) || 0)); probe.on('error', () => resolve(0)); }); }
function rotateVideoFile(inputPath, outputPath, direction = 'clockwise', onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const transpose = direction === 'counterclockwise' ? 'transpose=2' : 'transpose=1';
    const process = spawn('ffmpeg', ['-y', '-nostdin', '-i', inputPath, '-map', '0', '-vf', transpose, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-f', 'mp4', outputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let progress = ''; process.stdout.on('data', (chunk) => { progress += chunk.toString(); const match = progress.match(/out_time_ms=(\d+)/); if (match) { onProgress(Number(match[1])); progress = progress.slice(progress.lastIndexOf('out_time_ms=')); } });
    let error = '';
    process.stderr.on('data', (chunk) => { error += chunk.toString(); });
    process.on('error', reject);
    process.on('close', (code) => code === 0 ? resolve() : reject(new Error(error.slice(-500) || 'Video rotation failed.')));
  });
}
function trimVideoFile(inputPath, outputPath, start, duration, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', ['-y', '-nostdin', '-ss', String(start), '-i', inputPath, '-t', String(duration), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-f', 'mp4', outputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let progress = ''; process.stdout.on('data', (chunk) => { progress += chunk.toString(); const match = progress.match(/out_time_ms=(\d+)/); if (match) { onProgress(Number(match[1])); progress = progress.slice(progress.lastIndexOf('out_time_ms=')); } });
    let error = ''; process.stderr.on('data', (chunk) => { error += chunk.toString(); }); process.on('close', (code) => code === 0 ? resolve() : reject(new Error(error.slice(-500) || 'ffmpeg trim failed.'))); process.on('error', reject);
  });
}

function extractRecognitionSample(inputPath, outputPath, startSeconds = 0) {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', ['-y', '-nostdin', '-ss', String(Math.max(0, startSeconds)), '-i', inputPath, '-t', '12', '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', outputPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    process.stderr.on('data', (chunk) => { error += chunk.toString(); });
    process.on('error', reject);
    process.on('close', (code) => code === 0 ? resolve() : reject(new Error(error.slice(-500) || 'Could not extract an audio sample.')));
  });
}

function recognitionKey(value) { return String(value || '').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^a-z0-9]+/g, ''); }

async function recognizeVideoTrack(gigId, mediaId, filePath, filename) {
  if (!process.env.AUDD_API_TOKEN) return;
  const jobId = randomUUID();
  const samplePath = `${filePath}.${mediaId}.recognition.mp3`;
  saveBackgroundJob(jobId, 'Detect track', filename, 'running', 5);
  database.prepare("UPDATE gig_media SET recognition_status = 'running', recognition_error = NULL WHERE id = ?").run(mediaId);
  try {
    const duration = await probeDuration(filePath);
    const start = duration > 18 ? Math.max(0, Math.min(120, (duration / 2) - 6)) : 0;
    await extractRecognitionSample(filePath, samplePath, start);
    saveBackgroundJob(jobId, 'Detect track', filename, 'running', 45);
    const audio = await fs.readFile(samplePath);
    const form = new FormData();
    form.append('api_token', process.env.AUDD_API_TOKEN);
    form.append('return', 'apple_music,spotify');
    form.append('file', new Blob([audio], { type: 'audio/mpeg' }), `${mediaId}.mp3`);
    const payload = await providerResponse('https://api.audd.io/', { method: 'POST', body: form }, 'audd');
    if (payload?.status !== 'success') throw new Error(payload?.error?.error_message || payload?.error || 'AudD could not identify this clip.');
    const result = payload.result || null;
    const title = result?.title ? String(result.title) : null;
    const artist = result?.artist ? String(result.artist) : null;
    const album = result?.album ? String(result.album) : null;
    const songs = findGigSync(gigId).songs || [];
    const matchIndex = title ? songs.findIndex((song) => recognitionKey(song.title) === recognitionKey(title)) : -1;
    const status = matchIndex >= 0 ? 'matched' : result ? 'identified' : 'not_found';
    database.prepare(`UPDATE gig_media SET recognition_status = ?, recognition_result = ?, recognition_title = ?, recognition_artist = ?, recognition_album = ?, recognition_error = NULL,
      song_index = CASE WHEN song_index IS NULL AND recognition_override = 0 AND ? >= 0 THEN ? ELSE song_index END WHERE id = ?`).run(status, result ? JSON.stringify(result) : null, title, artist, album, matchIndex, matchIndex >= 0 ? matchIndex : null, mediaId);
    saveBackgroundJob(jobId, 'Detect track', filename, 'complete', 100);
  } catch (error) {
    database.prepare("UPDATE gig_media SET recognition_status = 'error', recognition_error = ? WHERE id = ?").run(error.message, mediaId);
    saveBackgroundJob(jobId, 'Detect track', filename, 'error', 0, error.message);
  } finally {
    await fs.rm(samplePath, { force: true }).catch(() => {});
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function mapLocations() {
  const gigs = await readGigs();
  const geocodes = await readGeocodes();
  const locations = new Map();
  let changed = false;
  let lastLookup = 0;
  for (const gig of gigs) {
    const key = `${gig.venue}|${gig.city}`.toLowerCase();
    if (!(key in geocodes)) {
      const remaining = 1_000 - (Date.now() - lastLookup);
      if (remaining > 0) await wait(remaining);
      const query = new URL('https://nominatim.openstreetmap.org/search');
      query.searchParams.set('q', `${gig.venue}, ${gig.city}`);
      query.searchParams.set('format', 'jsonv2');
      query.searchParams.set('limit', '1');
      const result = await fetch(query, { headers: { 'User-Agent': 'TheMasterList/0.1 personal-live-music-archive', 'Accept-Language': 'en' } });
      lastLookup = Date.now();
      const match = result.ok ? (await result.json())[0] : null;
      geocodes[key] = match ? { lat: Number(match.lat), lng: Number(match.lon) } : null;
      changed = true;
    }
    const coordinates = geocodes[key];
    if (!coordinates) continue;
    if (!locations.has(key)) locations.set(key, { ...coordinates, venue: gig.venue, city: gig.city, gigs: [] });
    locations.get(key).gigs.push({ id: gig.id, artist: gig.artist, date: gig.date });
  }
  if (changed) await writeGeocodes(geocodes);
  return [...locations.values()];
}

async function archiveHealth() {
  const gigs = await readGigs();
  const geocodes = await readGeocodes();
  const issues = [];
  const artists = new Map();
  const venues = new Map();

  for (const gig of gigs) {
    const songs = Array.isArray(gig.songs) ? gig.songs : [];
    if (!songs.length) issues.push({ id: `setlist:${gig.id}`, type: 'setlist', title: gig.artist, detail: `${gig.venue} · ${gig.date || 'Date unknown'} has no setlist`, repairable: false, href: `/edit?id=${encodeURIComponent(gig.id)}` });
    const missingAlbums = songs.filter((song) => !String(song.album || '').trim() || /^unknown album$/i.test(String(song.album).trim())).length;
    if (missingAlbums) issues.push({ id: `albums:${gig.id}`, type: 'albums', key: gig.id, title: gig.artist, detail: `${missingAlbums} of ${songs.length} tracks need album metadata`, repairable: true, href: `/edit?id=${encodeURIComponent(gig.id)}` });
    const artistKey = gig.artist.trim().toLowerCase();
    if (!artists.has(artistKey)) artists.set(artistKey, gig.artist.trim());
    const venueKey = `${gig.venue}|${gig.city}`.toLowerCase();
    if (!venues.has(venueKey)) venues.set(venueKey, { name: gig.venue, city: gig.city });
  }

  for (const [key, name] of artists) {
    const info = database.prepare('SELECT bio, image FROM artist_info WHERE lookup_name = ?').get(key);
    if (!info?.bio || !info?.image) issues.push({ id: `artist:${key}`, type: 'artist', key: name, title: name, detail: !info ? 'Artist profile has not been fetched' : `Artist profile is missing ${[!info.bio && 'bio', !info.image && 'photo'].filter(Boolean).join(' and ')}`, repairable: true, href: `/artist?name=${encodeURIComponent(name)}` });
  }

  for (const [key, venue] of venues) {
    const info = database.prepare('SELECT bio, description, image FROM venue_info WHERE lookup_name = ?').get(key);
    if (!(info?.bio || info?.description) || !info?.image) issues.push({ id: `venue:${key}`, type: 'venue', key, name: venue.name, city: venue.city, title: venue.name, detail: !info ? `${venue.city} venue profile has not been fetched` : `Venue profile is missing ${[!(info.bio || info.description) && 'bio', !info.image && 'photo'].filter(Boolean).join(' and ')}`, repairable: true, href: `/venue?name=${encodeURIComponent(venue.name)}&city=${encodeURIComponent(venue.city)}` });
    if (!geocodes[key]) issues.push({ id: `location:${key}`, type: 'location', key, name: venue.name, city: venue.city, title: venue.name, detail: `No map coordinates stored for ${venue.city}`, repairable: true, href: '/map' });
  }

  const counts = issues.reduce((result, issue) => { result[issue.type] = (result[issue.type] || 0) + 1; return result; }, {});
  return { totalShows: gigs.length, healthy: issues.length === 0, counts, issues };
}

async function enrichGigAlbums(gigId, forceMissing = false) {
  const gig = database.prepare('SELECT artist, songs FROM gigs WHERE id = ?').get(gigId);
  if (!gig) throw new Error('Gig not found.');
  const songs = JSON.parse(gig.songs || '[]');
  if (forceMissing) songs.filter((song) => !String(song.album || '').trim() || /^unknown album$/i.test(String(song.album).trim())).forEach((song) => database.prepare('DELETE FROM album_lookup_cache WHERE cache_key = ?').run(`v6::${song.artist || gig.artist}::${song.title}`.toLowerCase()));
  const enriched = await Promise.all(songs.map(async (song) => ({ ...song, album: await resolveAlbum(song.artist || gig.artist, song.title) || song.album || null })));
  database.prepare('UPDATE gigs SET songs = ? WHERE id = ?').run(JSON.stringify(enriched), gigId);
  const counts = {};
  enriched.forEach((song) => { const album = song.album || 'Unknown album'; counts[album] = (counts[album] || 0) + 1; });
  return { songs: enriched, albums: counts };
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 30_000_000) throw new Error('Request body is too large.');
  }
  return body ? JSON.parse(body) : {};
}

function normaliseImagePosition(value) {
  const position = String(value || 'center').toLowerCase();
  return ['top', 'center', 'bottom'].includes(position) ? position : 'center';
}

function localProfileImageFilename(value) {
  const match = String(value || '').match(/^\/api\/profile-images\/(profile-[a-f0-9-]+\.(?:jpe?g|png|webp|gif))$/i);
  return match?.[1] || '';
}

async function saveProfileImageUpload(upload) {
  if (!upload) return null;
  const mimeType = String(upload.mimeType || '').toLowerCase();
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[mimeType];
  if (!extension) throw new Error('Profile photos must be JPEG, PNG, WebP or GIF images.');
  const encoded = String(upload.data || '').replace(/^data:[^,]+,/, '');
  const file = Buffer.from(encoded, 'base64');
  if (!file.length) throw new Error('The selected profile photo is empty.');
  if (file.length > 8 * 1024 * 1024) throw new Error('Profile photos must be 8 MB or smaller.');
  const validImage = mimeType === 'image/jpeg' ? file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff
    : mimeType === 'image/png' ? file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : mimeType === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(file.subarray(0, 6).toString('ascii'))
        : file.subarray(0, 4).toString('ascii') === 'RIFF' && file.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!validImage) throw new Error('The selected file does not appear to be a valid image.');
  const filename = `profile-${randomUUID()}.${extension}`;
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, filename), file);
  return `/api/profile-images/${filename}`;
}

async function removeReplacedProfileImage(previousImage, nextImage) {
  const previousFilename = localProfileImageFilename(previousImage);
  if (previousFilename && previousImage !== nextImage) await fs.rm(path.join(MEDIA_DIR, previousFilename), { force: true });
}

function normaliseSongs(setlist) {
  return (setlist.sets?.set || []).flatMap((set) =>
    (set.song || []).map((song, index) => ({
      title: song.name,
      artist: song.cover?.name || setlist.artist?.name || '',
      encore: Boolean(set.encore),
      position: index + 1,
      info: song.info || ''
    }))
  );
}

async function resolveAlbum(artist, title) {
  const key = `v6::${artist}::${title}`.toLowerCase();
  const cached = database.prepare('SELECT album FROM album_lookup_cache WHERE cache_key = ?').get(key);
  if (cached) return cached.album || null;
  let album = null;
  const clean = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/\b(feat\.?|ft\.?).*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const wantedArtist = clean(artist);
  const wantedTitle = clean(title);
  try {
    const result = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=song&limit=8`);
    if (result.ok) {
      const matches = (await result.json()).results || [];
      const scored = matches.map((entry) => {
        const entryTitle = clean(entry.trackName); const entryArtist = clean(entry.artistName);
        const titleMatch = entryTitle === wantedTitle ? 3 : (entryTitle.includes(wantedTitle) || wantedTitle.includes(entryTitle) ? 1 : 0);
        const artistMatch = entryArtist === wantedArtist ? 3 : (entryArtist.includes(wantedArtist) || wantedArtist.includes(entryArtist) ? 1 : 0);
        return { entry, score: titleMatch + artistMatch };
      }).filter((candidate) => candidate.score >= 5).sort((a, b) => b.score - a.score);
      const exact = scored.find(({ entry }) => entry.collectionType === 'Album' && Number(entry.trackCount) > 1) || scored[0]?.entry;
      if (exact) album = exact.collectionType === 'single' || Number(exact.trackCount) === 1 ? 'Single' : (exact.collectionName || null);
    }
  } catch {}
  if (!album) {
    try {
      const query = `artist:"${artist.replace(/"/g, '')}" AND recording:"${title.replace(/"/g, '')}"`;
      const result = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=8`, { headers: { 'User-Agent': 'TheMasterList/0.1 (personal music archive)' } });
      if (result.ok) {
        const recordings = (await result.json()).recordings || [];
        const recording = recordings.find((entry) => clean(entry.title) === wantedTitle) || recordings[0];
        const releases = (recording?.releases || []).filter((release) => release.title);
        const albumRelease = releases.find((release) => release['release-group']?.['primary-type'] === 'Album' && release.status === 'Official') || releases.find((release) => release['release-group']?.['primary-type'] === 'Album');
        album = albumRelease?.title || (releases.length === 1 ? 'Single' : null);
      }
    } catch {}
  }
  database.prepare('INSERT OR REPLACE INTO album_lookup_cache (cache_key, album, created_at) VALUES (?, ?, ?)').run(key, album, new Date().toISOString());
  return album;
}

function validateGig(gig) {
  const required = ['artist', 'venue', 'city'];
  const missing = required.filter((field) => !String(gig[field] || '').trim());
  if (missing.length) throw new Error(`Please provide: ${missing.join(', ')}.`);
}

function normaliseRating(value) {
  if (value === undefined || value === null || value === '') return null;
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Ratings must be whole stars from 1 to 5.');
  return rating;
}

async function serveStatic(request, response, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${requested}`);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendError(response, 403, 'Forbidden');

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(file);
  } catch (error) {
    if (error.code === 'ENOENT' && !path.extname(requested)) {
      const app = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return response.end(app);
    }
    if (error.code === 'ENOENT') return sendError(response, 404, 'Not found');
    throw error;
  }
}

async function getAccessToken(provider) {
  const connections = await readConnections();
  const connection = connections[provider];
  if (!connection?.accessToken) throw new Error(`Connect ${provider === 'youtube' ? 'YouTube' : 'Spotify'} before exporting.`);
  if (connection.expiresAt > Date.now() + 60_000) return connection.accessToken;
  if (!connection.refreshToken) throw new Error(`Reconnect ${provider === 'youtube' ? 'YouTube' : 'Spotify'} to continue.`);

  const tokenUrl = provider === 'spotify' ? 'https://accounts.spotify.com/api/token' : 'https://oauth2.googleapis.com/token';
  const payload = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: connection.refreshToken, client_id: provider === 'spotify' ? process.env.SPOTIFY_CLIENT_ID : process.env.GOOGLE_CLIENT_ID });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (provider === 'spotify') headers.Authorization = `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`;
  else payload.set('client_secret', process.env.GOOGLE_CLIENT_SECRET);
  const refreshed = await providerResponse(tokenUrl, { method: 'POST', headers, body: payload }, provider);
  connections[provider] = { ...connection, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || connection.refreshToken, expiresAt: Date.now() + refreshed.expires_in * 1000 };
  await writeConnections(connections);
  return connections[provider].accessToken;
}

async function exportSpotify(gig) {
  const accessToken = await getAccessToken('spotify');
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const matches = [];
  const unmatched = [];
  for (const song of gig.songs) {
    const query = new URLSearchParams({ q: `track:${song.title} artist:${song.artist || gig.artist}`, type: 'track', limit: '1' });
    const result = await providerResponse(`https://api.spotify.com/v1/search?${query}`, { headers }, 'Spotify search');
    const track = result.tracks?.items?.[0];
    if (track) matches.push(track.uri);
    else unmatched.push(`${song.artist || gig.artist} — ${song.title}`);
  }
  const details = playlistDetails(gig);
  const playlist = await providerResponse('https://api.spotify.com/v1/me/playlists', { method: 'POST', headers, body: JSON.stringify({ ...details, public: false }) }, 'Spotify playlist');
  for (let index = 0; index < matches.length; index += 100) {
    await providerResponse(`https://api.spotify.com/v1/playlists/${playlist.id}/items`, { method: 'POST', headers, body: JSON.stringify({ uris: matches.slice(index, index + 100) }) }, 'Spotify playlist');
  }
  return { url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`, matched: matches.length, unmatched };
}

async function exportYouTube(gig) {
  const accessToken = await getAccessToken('youtube');
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const videos = [];
  const unmatched = [];
  for (const song of gig.songs) {
    const query = new URLSearchParams({ part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '1', q: `${song.artist || gig.artist} ${song.title} official audio` });
    const result = await providerResponse(`https://www.googleapis.com/youtube/v3/search?${query}`, { headers }, 'YouTube search');
    const video = result.items?.[0]?.id?.videoId;
    if (video) videos.push(video);
    else unmatched.push(`${song.artist || gig.artist} — ${song.title}`);
  }
  const details = playlistDetails(gig);
  const playlist = await providerResponse('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
    method: 'POST', headers, body: JSON.stringify({ snippet: details, status: { privacyStatus: 'private' } })
  }, 'YouTube playlist');
  for (const videoId of videos) {
    await providerResponse('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST', headers, body: JSON.stringify({ snippet: { playlistId: playlist.id, resourceId: { kind: 'youtube#video', videoId } } })
    }, 'YouTube playlist');
  }
  return { url: `https://www.youtube.com/playlist?list=${playlist.id}`, matched: videos.length, unmatched };
}

async function searchYouTubeForGig(gig) {
  const accessToken = await getAccessToken('youtube');
  const headers = { Authorization: `Bearer ${accessToken}` };
  const matches = [];
  const venueNeedle = String(gig.venue || '').trim().toLowerCase();
  const dateNeedles = [];
  if (gig.date) {
    const date = new Date(`${gig.date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      dateNeedles.push(String(date.getFullYear()));
      dateNeedles.push(date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase());
      dateNeedles.push(date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase());
    }
  }
  for (const [index, song] of gig.songs.entries()) {
    // Include the embed check in the cache version so older cached results
    // cannot reintroduce videos that YouTube reports as non-embeddable.
    const cacheKey = `${gig.id}:${index}:${gig.artist}:${gig.venue}:${gig.date || ''}:embed-v2`;
    const cached = database.prepare('SELECT results, created_at AS createdAt FROM youtube_search_cache WHERE cache_key = ?').get(cacheKey);
    if (cached && Date.now() - Date.parse(cached.createdAt) < 24 * 60 * 60 * 1000) {
      matches.push({ index, title: song.title, results: JSON.parse(cached.results) });
      continue;
    }
    const query = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '10', q: `${song.artist || gig.artist} ${song.title} ${gig.venue} ${gig.city} live` });
    const result = await providerResponse(`https://www.googleapis.com/youtube/v3/search?${query}`, { headers }, 'YouTube search');
    const filtered = (result.items || []).filter((item) => {
      if (!item.id?.videoId) return false;
      const text = `${item.snippet?.title || ''} ${item.snippet?.description || ''}`.toLowerCase();
      return (venueNeedle && text.includes(venueNeedle)) || dateNeedles.some((needle) => text.includes(needle));
    });
    const candidateIds = filtered.map((item) => item.id.videoId).slice(0, 50);
    let embeddableIds = new Set();
    if (candidateIds.length) {
      const statusQuery = new URLSearchParams({ part: 'status', id: candidateIds.join(',') });
      const statusResult = await providerResponse(`https://www.googleapis.com/youtube/v3/videos?${statusQuery}`, { headers }, 'YouTube video status');
      embeddableIds = new Set((statusResult.items || []).filter((item) => item.status?.embeddable === true).map((item) => item.id));
    }
    const results = filtered.filter((item) => embeddableIds.has(item.id.videoId)).slice(0, 3).map((item) => ({ id: item.id.videoId, title: item.snippet?.title || '', description: item.snippet?.description || '', channel: item.snippet?.channelTitle || '', thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '' }));
    database.prepare('INSERT INTO youtube_search_cache (cache_key, results, created_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET results = excluded.results, created_at = excluded.created_at').run(cacheKey, JSON.stringify(results), new Date().toISOString());
    matches.push({ index, title: song.title, results });
  }
  return matches;
}

function youtubeVideoId(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
    return parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop() || '';
  } catch { return ''; }
}

function isoDurationSeconds(value) {
  const match = String(value || '').match(/^P(?:([\d.]+)D)?T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/i);
  if (!match) return null;
  return (Number(match[1]) || 0) * 86400 + (Number(match[2]) || 0) * 3600 + (Number(match[3]) || 0) * 60 + (Number(match[4]) || 0);
}

function chapterSeconds(value) {
  const parts = String(value || '').split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null;
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return seconds >= 0 ? seconds : null;
}

function parsePlaybackChapters(description) {
  const timestamp = '(?:\\d{1,2}:)?\\d{1,2}:\\d{2}';
  const leading = new RegExp(`^\\s*(?:[-*#]\\s*)?(${timestamp})\\s*(?:[-–—|:]\\s*)?(.+?)\\s*$`);
  const trailing = new RegExp(`^\\s*(.+?)\\s+(?:[-–—|]\\s*)?(${timestamp})\\s*$`);
  const chapters = [];
  String(description || '').split(/\r?\n/).forEach((line) => {
    const match = line.match(leading);
    const reverse = match ? null : line.match(trailing);
    const seconds = chapterSeconds(match?.[1] || reverse?.[2]);
    const title = String(match?.[2] || reverse?.[1] || '').replace(/^\d+[.)]\s*/, '').trim();
    if (seconds !== null && title) chapters.push({ seconds, title });
  });
  return chapters.filter((chapter, index) => index === 0 || chapter.seconds > chapters[index - 1].seconds).slice(0, 200);
}

function playbackMatchTokens(value, artist = '') {
  const artistTokens = new Set(String(artist || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  const ignored = new Set(['live', 'official', 'video', 'audio', 'lyrics', 'concert', 'full', 'show', 'set', 'tour', 'feat', 'featuring', ...artistTokens]);
  return String(value || '').toLowerCase().replace(/&amp;/g, ' and ').split(/[^a-z0-9]+/).filter((token) => token && !ignored.has(token));
}

function playbackTitleScore(value, song, gig) {
  const candidateKey = recognitionKey(value);
  const songKey = recognitionKey(song.title);
  if (!candidateKey || !songKey) return 0;
  if (candidateKey === songKey) return 1;
  if (songKey.length >= 4 && candidateKey.includes(songKey)) return .94;
  const candidateTokens = new Set(playbackMatchTokens(value, song.artist || gig.artist));
  const songTokens = new Set(playbackMatchTokens(song.title));
  if (!candidateTokens.size || !songTokens.size) return 0;
  const matched = [...songTokens].filter((token) => candidateTokens.has(token)).length;
  const recall = matched / songTokens.size;
  const precision = matched / candidateTokens.size;
  return (recall * .75) + (precision * .25);
}

function bestPlaybackSong(gig, value, minimum = .55) {
  let best = null;
  (gig.songs || []).forEach((song, songIndex) => {
    const score = playbackTitleScore(value, song, gig);
    if (score >= minimum && (!best || score > best.score)) best = { songIndex, score };
  });
  return best;
}

function estimateFullShowTimings(songCount, duration, anchors = [], terminalSeconds = null) {
  const count = Number(songCount);
  const naturalEnd = Number(duration);
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(naturalEnd) || naturalEnd <= 0) return [];
  const requestedEnd = Number(terminalSeconds);
  const end = Number.isFinite(requestedEnd) && requestedEnd > 0 && requestedEnd <= naturalEnd ? requestedEnd : naturalEnd;
  const bySong = new Map();
  anchors.forEach((anchor) => {
    const songIndex = Number(anchor.songIndex);
    const seconds = Number(anchor.seconds);
    if (!Number.isInteger(songIndex) || songIndex < 0 || songIndex >= count || !Number.isFinite(seconds) || seconds < 0 || seconds >= end) return;
    const current = bySong.get(songIndex);
    if (!current || Number(anchor.weight || 0) >= Number(current.weight || 0)) bySong.set(songIndex, { ...anchor, songIndex, seconds });
  });
  const detected = [...bySong.values()].sort((a, b) => a.songIndex - b.songIndex);
  const monotonic = [];
  detected.forEach((anchor) => { if (!monotonic.length || anchor.seconds > monotonic[monotonic.length - 1].seconds) monotonic.push(anchor); });
  const realAnchorCount = monotonic.length;
  if (!monotonic.length || monotonic[0].songIndex > 0) monotonic.unshift({ songIndex: 0, seconds: 0, synthetic: true });
  monotonic.push({ songIndex: count, seconds: end, synthetic: true });
  const confidence = realAnchorCount >= 2 ? .68 : realAnchorCount === 1 ? .58 : .48;
  const reason = realAnchorCount >= 2 ? 'Interpolated between detected full-show timestamps'
    : realAnchorCount === 1 ? 'Estimated around one detected timestamp — review timing'
      : 'Estimated evenly across the full-show duration — review timing';
  const estimates = [];
  for (let anchorIndex = 0; anchorIndex < monotonic.length - 1; anchorIndex += 1) {
    const startAnchor = monotonic[anchorIndex];
    const endAnchor = monotonic[anchorIndex + 1];
    const trackSpan = endAnchor.songIndex - startAnchor.songIndex;
    const timeSpan = endAnchor.seconds - startAnchor.seconds;
    if (trackSpan <= 0 || timeSpan <= 0) continue;
    for (let songIndex = startAnchor.songIndex; songIndex < endAnchor.songIndex; songIndex += 1) {
      const offset = songIndex - startAnchor.songIndex;
      const startSeconds = startAnchor.seconds + ((timeSpan * offset) / trackSpan);
      const endSeconds = startAnchor.seconds + ((timeSpan * (offset + 1)) / trackSpan);
      estimates.push({ songIndex, startSeconds: Math.round(startSeconds * 10) / 10, endSeconds: Math.round(endSeconds * 10) / 10, confidence, reason });
    }
  }
  return estimates;
}

async function refreshYouTubePlaybackMetadata(gigId, media) {
  const staleBefore = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const pending = media.filter((item) => item.mimeType === 'video/youtube' && youtubeVideoId(item.externalUrl || item.url) && (!item.sourceMetadataAt || Date.parse(item.sourceMetadataAt) < staleBefore));
  if (!pending.length) return null;
  if (!configured('youtube')) return 'YouTube metadata is not configured; title and AudD matching were used instead.';
  try {
    const token = await getAccessToken('youtube');
    const byVideoId = new Map(pending.map((item) => [youtubeVideoId(item.externalUrl || item.url), item]));
    const query = new URLSearchParams({ part: 'snippet,contentDetails,status', id: [...byVideoId.keys()].join(',') });
    const result = await providerResponse(`https://www.googleapis.com/youtube/v3/videos?${query}`, { headers: { Authorization: `Bearer ${token}` } }, 'YouTube video metadata');
    const now = new Date().toISOString();
    const update = database.prepare('UPDATE gig_media SET caption = ?, source_description = ?, source_duration = ?, source_metadata_at = ? WHERE id = ?');
    const seen = new Set();
    (result.items || []).forEach((video) => {
      const item = byVideoId.get(video.id);
      if (!item) return;
      seen.add(video.id);
      const caption = !item.caption || item.caption === 'YouTube video' ? video.snippet?.title || item.caption : item.caption;
      update.run(caption, video.snippet?.description || '', isoDurationSeconds(video.contentDetails?.duration), now, item.id);
    });
    pending.forEach((item) => { if (!seen.has(youtubeVideoId(item.externalUrl || item.url))) database.prepare('UPDATE gig_media SET source_metadata_at = ? WHERE id = ?').run(now, item.id); });
    return null;
  } catch (error) {
    return `YouTube metadata could not be refreshed: ${error.message}`;
  }
}

function suggestPlaybackPlan(gig, media) {
  const existingBySong = new Map();
  media.forEach((item) => (item.playbackClips || []).forEach((clip) => { if (!existingBySong.has(clip.songIndex)) existingBySong.set(clip.songIndex, new Set()); existingBySong.get(clip.songIndex).add(item.id); }));
  const suggestionBuckets = new Map();
  const setlistStarts = (gig.songs || []).map((song) => {
    if (song.startSeconds === null || song.startSeconds === undefined || song.startSeconds === '') return null;
    const value = Number(song.startSeconds);
    return Number.isFinite(value) && value >= 0 ? value : null;
  });
  const offer = (songIndex, item, startSeconds, endSeconds, confidence, reason) => {
    if (!Number.isInteger(songIndex) || existingBySong.get(songIndex)?.has(item.id)) return;
    if (!suggestionBuckets.has(songIndex)) suggestionBuckets.set(songIndex, new Map());
    const bucket = suggestionBuckets.get(songIndex);
    const current = bucket.get(item.id);
    if (!current || confidence > current.confidence) bucket.set(item.id, { songIndex, mediaId: item.id, startSeconds, endSeconds, confidence: Math.round(confidence * 100) / 100, reason, sourceLabel: item.caption || item.filename || 'Video', localSource: item.mimeType !== 'video/youtube' });
  };
  media.filter((item) => item.category !== 'artifact' && String(item.mimeType || '').startsWith('video/')).forEach((item) => {
    if (Number.isInteger(item.songIndex)) offer(item.songIndex, item, item.playbackStart, item.playbackEnd, .9, 'Existing track assignment');
    if (item.recognitionTitle) {
      const match = bestPlaybackSong(gig, item.recognitionTitle, .5);
      if (match) offer(match.songIndex, item, item.playbackStart, item.playbackEnd, .9 + (.08 * match.score), `AudD matched “${item.recognitionTitle}”`);
    }
    const chapters = item.mimeType === 'video/youtube' ? parsePlaybackChapters(item.sourceDescription) : [];
    const chapterMatches = [];
    chapters.forEach((chapter, chapterIndex) => {
      const match = bestPlaybackSong(gig, chapter.title, .5);
      if (!match || (chapterMatches.length && match.songIndex <= chapterMatches[chapterMatches.length - 1].songIndex)) return;
      chapterMatches.push({ ...chapter, ...match, chapterIndex });
    });
    const sourceText = `${item.caption || ''} ${item.sourceDescription || ''}`.toLowerCase();
    const artistWords = String(gig.artist || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    const venueWords = String(gig.venue || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    const duration = Number(item.sourceDuration);
    const explicitFullShow = /(?:full|complete|whole|entire)\s+(?:set|show|concert)|concert\s+(?:film|video)/.test(sourceText);
    const venueConcert = venueWords.some((word) => sourceText.includes(word)) && /concert|live\s+at|full\s+performance/.test(sourceText);
    const plausibleDuration = Number.isFinite(duration) && duration >= Math.max(8 * 60, (gig.songs || []).length * 75);
    const artistMatches = artistWords.some((word) => sourceText.includes(word));
    const looksLikeFullShow = Number.isFinite(duration) && duration > 0 && (chapterMatches.length >= 2 || (artistMatches && (explicitFullShow || (plausibleDuration && venueConcert))));
    const lastChapterMatch = chapterMatches[chapterMatches.length - 1];
    const followingChapter = lastChapterMatch ? chapters[lastChapterMatch.chapterIndex + 1] : null;
    const terminalSeconds = lastChapterMatch?.songIndex === (gig.songs || []).length - 1 ? followingChapter?.seconds : null;
    const timingAnchors = [
      ...setlistStarts.map((seconds, songIndex) => seconds === null ? null : ({ songIndex, seconds, weight: 1 })).filter(Boolean),
      ...chapterMatches.map((match) => ({ songIndex: match.songIndex, seconds: match.seconds, weight: 2 }))
    ];
    const estimates = looksLikeFullShow ? estimateFullShowTimings((gig.songs || []).length, duration, timingAnchors, terminalSeconds) : [];
    const estimateBySong = new Map(estimates.map((estimate) => [estimate.songIndex, estimate]));
    estimates.forEach((estimate) => offer(estimate.songIndex, item, estimate.startSeconds, estimate.endSeconds, estimate.confidence, estimate.reason));
    chapterMatches.forEach((match) => {
      const estimate = estimateBySong.get(match.songIndex);
      const nextChapter = chapters[match.chapterIndex + 1];
      offer(match.songIndex, item, match.seconds, estimate?.endSeconds ?? nextChapter?.seconds ?? item.sourceDuration ?? null, .74 + (.24 * match.score), `YouTube chapter “${match.title}”`);
    });
    if (looksLikeFullShow) setlistStarts.forEach((start, songIndex) => {
      if (start === null) return;
      const estimate = estimateBySong.get(songIndex);
      const next = setlistStarts.slice(songIndex + 1).find((value) => value !== null && value > start);
      offer(songIndex, item, start, estimate?.endSeconds ?? next ?? item.sourceDuration ?? null, .72, 'Setlist timestamp matched to a full-show video');
    });
    const titleMatch = bestPlaybackSong(gig, item.caption, .62);
    if (titleMatch) offer(titleMatch.songIndex, item, item.playbackStart, item.playbackEnd, .58 + (.28 * titleMatch.score), 'Video title matches the setlist');
    if (!chapters.length && item.sourceDescription) {
      String(item.sourceDescription).split(/\r?\n/).filter((line) => line.trim().length >= 3 && line.trim().length <= 140).slice(0, 100).forEach((line) => {
        const match = bestPlaybackSong(gig, line, .82);
        if (match) offer(match.songIndex, item, item.playbackStart, item.playbackEnd, .55 + (.2 * match.score), `Video description mentions “${line.trim()}”`);
      });
    }
  });
  return [...suggestionBuckets.entries()].map(([songIndex, bucket]) => {
    const ranked = [...bucket.values()].sort((a, b) => b.confidence - a.confidence || Number(b.localSource) - Number(a.localSource)).slice(0, 4);
    const primary = ranked.shift();
    return { ...primary, fallbackOnly: existingBySong.has(songIndex), alternatives: ranked };
  }).sort((a, b) => a.songIndex - b.songIndex);
}

async function exportAppleMusic(gig, musicUserToken) {
  if (!musicUserToken) throw new Error('Apple Music authorization was not completed.');
  const headers = {
    Authorization: `Bearer ${process.env.APPLE_MUSIC_DEVELOPER_TOKEN}`,
    'Music-User-Token': musicUserToken,
    'Content-Type': 'application/json'
  };
  const storefront = process.env.APPLE_MUSIC_STOREFRONT || 'au';
  const tracks = [];
  const unmatched = [];
  for (const song of gig.songs) {
    const query = new URLSearchParams({ term: `${song.artist || gig.artist} ${song.title}`, types: 'songs', limit: '1' });
    const result = await providerResponse(`https://api.music.apple.com/v1/catalog/${storefront}/search?${query}`, { headers }, 'Apple Music search');
    const track = result.results?.songs?.data?.[0];
    if (track) tracks.push({ id: track.id, type: 'songs' });
    else unmatched.push(`${song.artist || gig.artist} — ${song.title}`);
  }
  const details = playlistDetails(gig);
  const playlist = await providerResponse('https://api.music.apple.com/v1/me/library/playlists', {
    method: 'POST', headers, body: JSON.stringify({ attributes: { name: details.name, description: details.description } })
  }, 'Apple Music playlist');
  const playlistId = playlist.data?.[0]?.id;
  if (!playlistId) throw new Error('Apple Music did not return the new playlist.');
  for (let index = 0; index < tracks.length; index += 100) {
    await providerResponse(`https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, {
      method: 'POST', headers, body: JSON.stringify({ data: tracks.slice(index, index + 100) })
    }, 'Apple Music playlist');
  }
  return { url: 'https://music.apple.com/library', matched: tracks.length, unmatched };
}

async function handleAuth(request, response, url) {
  const provider = url.pathname.includes('/spotify') ? 'spotify' : url.pathname.includes('/youtube') ? 'youtube' : null;
  if (!provider) return sendError(response, 404, 'Not found');
  if (!configured(provider)) return redirect(response, '/?integrationError=missing-config');
  const callbackPath = `/auth/${provider}/callback`;
  // Spotify no longer permits `localhost` redirect URIs. It accepts the
  // explicit loopback IP address while Google continues to accept localhost.
  const callbackUrl = provider === 'spotify'
    ? process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${PORT}${callbackPath}`
    : `${appOrigin(request)}${callbackPath}`;

  if (url.pathname === `/auth/${provider}`) {
    const state = randomUUID();
    pendingOAuth.set(state, { provider, callbackUrl, createdAt: Date.now() });
    const authorizationUrl = new URL(provider === 'spotify' ? 'https://accounts.spotify.com/authorize' : 'https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.searchParams.set('client_id', provider === 'spotify' ? process.env.SPOTIFY_CLIENT_ID : process.env.GOOGLE_CLIENT_ID);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('scope', provider === 'spotify' ? 'playlist-modify-private playlist-modify-public' : 'https://www.googleapis.com/auth/youtube');
    if (provider === 'youtube') {
      authorizationUrl.searchParams.set('access_type', 'offline');
      authorizationUrl.searchParams.set('prompt', 'consent');
    }
    return redirect(response, authorizationUrl);
  }

  if (url.pathname === callbackPath) {
    const state = url.searchParams.get('state');
    const pending = pendingOAuth.get(state);
    pendingOAuth.delete(state);
    if (!pending || pending.provider !== provider || Date.now() - pending.createdAt > 10 * 60_000) return redirect(response, '/?integrationError=invalid-state');
    if (url.searchParams.get('error')) return redirect(response, '/?integrationError=authorization-denied');
    const code = url.searchParams.get('code');
    if (!code) return redirect(response, '/?integrationError=missing-code');
    const tokenUrl = provider === 'spotify' ? 'https://accounts.spotify.com/api/token' : 'https://oauth2.googleapis.com/token';
    const payload = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: pending.callbackUrl, client_id: provider === 'spotify' ? process.env.SPOTIFY_CLIENT_ID : process.env.GOOGLE_CLIENT_ID });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (provider === 'spotify') headers.Authorization = `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`;
    else payload.set('client_secret', process.env.GOOGLE_CLIENT_SECRET);
    const token = await providerResponse(tokenUrl, { method: 'POST', headers, body: payload }, provider);
    const connections = await readConnections();
    connections[provider] = { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 };
    await writeConnections(connections);
    return redirect(response, `/?connected=${provider}`);
  }
  return sendError(response, 404, 'Not found');
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/auth/status') {
    return sendJson(response, 200, { configured: accountsConfigured(), account: currentAccount(request) });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/setup') {
    if (database.prepare('SELECT COUNT(*) AS count FROM profiles').get().count) return sendError(response, 403, 'An account already exists.');
    try {
      const { name, password } = validateAccount(await readBody(request));
      const profile = { id: randomUUID(), name, createdAt: new Date().toISOString() };
      database.prepare('INSERT INTO profiles (id, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)').run(profile.id, name, hashPassword(password), profile.createdAt);
      return sendJson(response, 201, { id: profile.id, name: profile.name, isAdmin: 1 }, sessionHeaders(profile.id));
    } catch (error) { return sendError(response, 400, error.message); }
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(request);
    const profile = database.prepare('SELECT id, name, password_hash, is_admin AS isAdmin FROM profiles WHERE name = ?').get(String(body.name || '').trim());
    if (!profile || !passwordMatches(String(body.password || ''), profile.password_hash)) return sendError(response, 401, 'Incorrect name or password.');
    return sendJson(response, 200, { id: profile.id, name: profile.name, isAdmin: profile.isAdmin }, sessionHeaders(profile.id));
  }

  if (request.method === 'PATCH' && url.pathname === '/api/auth/account') {
    try {
      const account = requireAccount(request);
      const body = await readBody(request);
      if (!passwordMatches(String(body.currentPassword || ''), database.prepare('SELECT password_hash FROM profiles WHERE id = ?').get(account.id)?.password_hash)) return sendError(response, 401, 'Current password is incorrect.');
      const { name, password } = validateAccount({ name: body.name, password: body.newPassword });
      database.prepare('UPDATE profiles SET name = ?, password_hash = ? WHERE id = ?').run(name, hashPassword(password), account.id);
      return sendJson(response, 200, { id: account.id, name, isAdmin: account.isAdmin });
    } catch (error) { return sendError(response, error.message === 'Sign in required.' ? 401 : 400, error.message); }
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const body = await readBody(request);
      const invite = database.prepare('SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(tokenHash(String(body.inviteToken || '')), new Date().toISOString());
      if (!invite) return sendError(response, 403, 'This invite is invalid or has expired.');
      const { name, password } = validateAccount(body);
      const profile = { id: randomUUID(), name, createdAt: new Date().toISOString() };
      database.transaction(() => {
        database.prepare('INSERT INTO profiles (id, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)').run(profile.id, name, hashPassword(password), profile.createdAt);
        database.prepare('UPDATE invites SET used_at = ? WHERE token_hash = ?').run(profile.createdAt, tokenHash(String(body.inviteToken)));
      })();
      return sendJson(response, 201, { id: profile.id, name: profile.name, isAdmin: 0 }, sessionHeaders(profile.id));
    } catch (error) { return sendError(response, 400, error.message); }
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = cookieValue(request, sessionCookieName()) || cookieValue(request, 'master_list_session');
    if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': expiredSessionCookies() });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/invites') {
    const account = requireAccount(request);
    if (!account.isAdmin) return sendError(response, 403, 'Only the owner can create invites.');
    const token = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    database.prepare('INSERT INTO invites (token_hash, created_by, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), account.id, expires);
    return sendJson(response, 201, { inviteUrl: `${appOrigin(request)}/?invite=${encodeURIComponent(token)}`, expiresAt: expires });
  }

  if (request.method === 'POST' && url.pathname === '/api/sync/pair') {
    try {
      const body = await readBody(request);
      const invite = parsePeerInvite(body.inviteToken);
      if (invite.peerId !== instanceRow().instanceId) return sendError(response, 400, 'This pairing invite belongs to another instance.');
      const peer = verifySelfSignedPairEnvelope(body.envelope);
      if (peer.originInstanceId === instanceRow().instanceId) return sendError(response, 400, 'You cannot pair an instance with itself.');
      const baseUrl = String(peer.baseUrl || '').trim().replace(/\/$/, '');
      if (baseUrl) { const parsed = new URL(baseUrl); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Peer URL is invalid.'); }
      const now = new Date().toISOString();
      database.prepare(`INSERT INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, 'connected', ?, ?)
        ON CONFLICT(peer_id) DO UPDATE SET name=excluded.name, base_url=excluded.base_url, public_key=excluded.public_key,
          status='connected', last_seen_at=excluded.last_seen_at`).run(randomUUID(), peer.originInstanceId, peer.name, baseUrl, peer.publicKey, now, now);
      return sendJson(response, 200, signInstanceEnvelope({ type: 'pair-response', requestNonce: peer.nonce }));
    } catch (error) { return sendError(response, 400, error.message); }
  }

  if (request.method === 'POST' && url.pathname === '/api/sync/hello') {
    try {
      const { payload, peer } = verifyPeerEnvelope(await readBody(request));
      if (payload.type !== 'hello') return sendError(response, 400, 'Invalid peer health request.');
      const now = new Date().toISOString();
      database.prepare("UPDATE peer_instances SET status = 'connected', last_seen_at = ? WHERE peer_id = ?").run(now, peer.peer_id);
      return sendJson(response, 200, signInstanceEnvelope({ type: 'hello-response', requestNonce: payload.nonce, name: instanceRow().name }));
    } catch (error) { return sendError(response, 401, error.message); }
  }

  if (request.method === 'POST' && url.pathname === '/api/sync/exchange') {
    try {
      const { payload, peer } = verifyPeerEnvelope(await readBody(request));
      if (payload.type !== 'sync-exchange' || !Array.isArray(payload.snapshots)) return sendError(response, 400, 'Invalid sync exchange.');
      let applied = 0;
      for (const snapshot of payload.snapshots.slice(0, 500)) if (applySyncSnapshot(snapshot, peer)) applied += 1;
      const now = new Date().toISOString();
      database.prepare("UPDATE peer_instances SET status = 'connected', last_seen_at = ? WHERE peer_id = ?").run(now, peer.peer_id);
      return sendJson(response, 200, signInstanceEnvelope({
        type: 'sync-response',
        requestNonce: payload.nonce,
        applied,
        snapshots: localSyncSnapshots(peer.peer_id)
      }));
    } catch (error) { return sendError(response, 400, error.message); }
  }

  request.account = accountsConfigured() ? requireAccount(request) : null;

  if (request.method === 'GET' && url.pathname === '/api/instance') {
    requireAccount(request);
    return sendJson(response, 200, { ...instanceRow(), peers: peerRows() });
  }

  if (request.method === 'GET' && url.pathname === '/api/peers') {
    requireAccount(request);
    return sendJson(response, 200, peerRows());
  }

  if (request.method === 'GET' && url.pathname === '/api/notifications') {
    requireAccount(request);
    const notifications = database.prepare(`SELECT id, type, peer_id AS peerId, shared_gig_id AS sharedGigId,
      title, body, created_at AS createdAt FROM notifications WHERE read_at IS NULL ORDER BY created_at DESC LIMIT 50`).all();
    return sendJson(response, 200, notifications);
  }

  const notificationMatch = url.pathname.match(/^\/api\/notifications\/([a-f0-9]+)$/);
  if (request.method === 'PATCH' && notificationMatch) {
    requireAccount(request);
    database.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(new Date().toISOString(), notificationMatch[1]);
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === 'POST' && url.pathname === '/api/peers/invite') {
    requireAccount(request);
    const token = peerInviteToken(request);
    return sendJson(response, 201, { token, inviteUrl: `${appOrigin(request)}/account?peerInvite=${encodeURIComponent(token)}`, expiresAt: JSON.parse(Buffer.from(token, 'base64url').toString('utf8')).payload.expiresAt });
  }

  if (request.method === 'POST' && url.pathname === '/api/peers/import') {
    requireAccount(request);
    const body = await readBody(request);
    const peer = parsePeerInvite(body.token);
    if (peer.peerId === instanceRow().instanceId) return sendError(response, 400, 'You cannot pair an instance with itself.');
    const now = new Date().toISOString();
    const id = randomUUID();
    database.prepare(`INSERT INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, 'paired', ?, NULL)
      ON CONFLICT(peer_id) DO UPDATE SET name=excluded.name, base_url=excluded.base_url, public_key=excluded.public_key, status='paired'`).run(id, peer.peerId, peer.name, peer.baseUrl || '', peer.publicKey, now);
    let confirmed = false;
    try {
      confirmed = await confirmPairWithRemote(database.prepare('SELECT * FROM peer_instances WHERE peer_id = ?').get(peer.peerId), body.token, request);
      if (confirmed) database.prepare("UPDATE peer_instances SET status = 'connected', last_seen_at = ? WHERE peer_id = ?").run(new Date().toISOString(), peer.peerId);
    } catch { /* The peer may be offline; a later test will report connection state. */ }
    return sendJson(response, 201, { peer: peerRows().find((entry) => entry.peerId === peer.peerId), message: confirmed ? 'Peer paired on both instances.' : 'Peer saved locally. The remote instance could not be confirmed yet.' });
  }

  if (request.method === 'POST' && url.pathname === '/api/peers') {
    requireAccount(request);
    const body = await readBody(request);
    const peerId = String(body.peerId || '').trim();
    const name = String(body.name || '').trim();
    const publicKey = String(body.publicKey || '').trim();
    const baseUrl = String(body.baseUrl || '').trim().replace(/\/$/, '');
    if (!peerId || !name || !publicKey) return sendError(response, 400, 'Peer ID, name, and public key are required.');
    if (baseUrl) {
      try { const parsed = new URL(baseUrl); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } catch { return sendError(response, 400, 'Peer URL must be a valid HTTP or HTTPS URL.'); }
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    database.prepare(`INSERT INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, 'paired', ?, NULL)
      ON CONFLICT(peer_id) DO UPDATE SET name=excluded.name, base_url=excluded.base_url, public_key=excluded.public_key, status='paired'`).run(id, peerId, name, baseUrl, publicKey, now);
    return sendJson(response, 201, peerRows().find((peer) => peer.peerId === peerId));
  }

  if (request.method === 'POST' && url.pathname === '/api/peers/sync-all') {
    requireAccount(request);
    const connectedPeers = database.prepare("SELECT * FROM peer_instances WHERE status = 'connected' AND base_url <> '' ORDER BY name COLLATE NOCASE").all();
    const settled = await Promise.allSettled(connectedPeers.map((peer) => syncWithPeer(peer)));
    const results = settled.map((result, index) => result.status === 'fulfilled' ? result.value : { ok: false, peerId: connectedPeers[index].id, peerName: connectedPeers[index].name, error: result.reason?.message || 'Sync failed.' });
    return sendJson(response, 200, { peers: connectedPeers.length, results, applied: results.reduce((sum, result) => sum + Number(result.applied || 0), 0) });
  }

  const peerActionMatch = url.pathname.match(/^\/api\/peers\/([\w-]+)\/(test|sync)$/);
  if (request.method === 'POST' && peerActionMatch) {
    requireAccount(request);
    const peer = database.prepare('SELECT * FROM peer_instances WHERE id = ?').get(peerActionMatch[1]);
    if (!peer) return sendError(response, 404, 'Paired instance not found.');
    if (!peer.base_url) return sendError(response, 400, 'Add a peer URL before testing or syncing this instance.');
    try {
      if (peerActionMatch[2] === 'test') {
        const reply = await postPeerEnvelope(peer, '/api/sync/hello', { type: 'hello' });
        const now = new Date().toISOString();
        database.prepare("UPDATE peer_instances SET status = 'connected', last_seen_at = ? WHERE id = ?").run(now, peer.id);
        return sendJson(response, 200, { ok: true, name: reply.name || peer.name, status: 'connected', lastSeenAt: now });
      }
      return sendJson(response, 200, await syncWithPeer(peer));
    } catch (error) {
      database.prepare("UPDATE peer_instances SET status = 'unreachable' WHERE id = ?").run(peer.id);
      return sendError(response, 502, error.message);
    }
  }

  const peerMatch = url.pathname.match(/^\/api\/peers\/([\w-]+)$/);
  if (request.method === 'DELETE' && peerMatch) {
    requireAccount(request);
    database.prepare('DELETE FROM peer_instances WHERE id = ?').run(peerMatch[1]);
    return sendJson(response, 200, { ok: true });
  }

  const mediaFileMatch = url.pathname.match(/^\/api\/media\/([\w-]+)$/);
  if (request.method === 'GET' && mediaFileMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(mediaFileMatch[1]);
    if (!media) return sendError(response, 404, 'Media not found.');
    try {
      const useCutout = url.searchParams.get('variant') === 'cutout' && media.background_filename;
      const filePath = path.join(MEDIA_DIR, useCutout ? media.background_filename : (media.playback_filename || media.filename));
      const stat = await fs.stat(filePath);
      const responseMime = useCutout ? 'image/png' : (media.playback_mime || media.mime_type);
      const range = request.headers.range;
      if (range) {
        const match = range.match(/bytes=(\d*)-(\d*)/);
        const start = match?.[1] ? Number(match[1]) : 0;
        const end = match?.[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
        if (start >= stat.size || start > end) return sendError(response, 416, 'Requested range not satisfiable.');
        response.writeHead(206, { 'Content-Type': responseMime, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
        return legacyFs.createReadStream(filePath, { start, end }).pipe(response);
      }
      response.writeHead(200, { 'Content-Type': responseMime, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
      return legacyFs.createReadStream(filePath).pipe(response);
    } catch (error) { return sendError(response, 404, 'Media file not found.'); }
  }

  if (request.method === 'GET' && url.pathname === '/api/profiles') {
    if (!accountsConfigured()) return sendJson(response, 200, []);
    requireAccount(request);
    return sendJson(response, 200, profileRows());
  }

  if (request.method === 'POST' && url.pathname === '/api/profiles') {
    return sendError(response, 403, 'Create accounts with an invite link.');
  }

  if (request.method === 'GET' && url.pathname === '/api/shared/shows') {
    if (!accountsConfigured()) return sendJson(response, 200, []);
    requireAccount(request);
    return sendJson(response, 200, sharedShowRows());
  }

  if (request.method === 'POST' && url.pathname === '/api/shared/shows') {
    const account = requireAccount(request);
    const body = await readBody(request);
    const sharedId = createSharedShow(body.sourceGigId, account.id);
    return sendJson(response, 201, sharedShowRows().find((show) => show.id === sharedId));
  }

  const attendeeMatch = url.pathname.match(/^\/api\/shared\/shows\/([\w-]+)\/attendees$/);
  if (request.method === 'POST' && attendeeMatch) {
    requireAccount(request);
    const body = await readBody(request);
    requireProfile(body.profileId);
    const show = database.prepare('SELECT id FROM shared_shows WHERE id = ?').get(attendeeMatch[1]);
    if (!show) return sendError(response, 404, 'Shared show not found.');
    database.prepare('INSERT OR IGNORE INTO shared_attendees (show_id, profile_id, joined_at) VALUES (?, ?, ?)').run(attendeeMatch[1], body.profileId, new Date().toISOString());
    return sendJson(response, 200, sharedShowRows().find((entry) => entry.id === attendeeMatch[1]));
  }

  const reviewMatch = url.pathname.match(/^\/api\/shared\/shows\/([\w-]+)\/reviews$/);
  if (request.method === 'PATCH' && reviewMatch) {
    const account = requireAccount(request);
    const body = await readBody(request);
    const profileId = account.id;
    const show = database.prepare('SELECT id FROM shared_shows WHERE id = ?').get(reviewMatch[1]);
    if (!show) return sendError(response, 404, 'Shared show not found.');
    const existing = database.prepare('SELECT performance_rating AS performanceRating, venue_rating AS venueRating, favorite, notes FROM shared_reviews WHERE show_id = ? AND profile_id = ?').get(reviewMatch[1], profileId);
    const performanceRating = 'performanceRating' in body ? normaliseRating(body.performanceRating) : existing?.performanceRating || null;
    const venueRating = 'venueRating' in body ? normaliseRating(body.venueRating) : existing?.venueRating || null;
    const favorite = 'favorite' in body ? (body.favorite ? 1 : 0) : (existing?.favorite || 0);
    const notes = 'notes' in body ? String(body.notes || '').trim() : (existing?.notes || '');
    database.prepare(`INSERT INTO shared_reviews (show_id, profile_id, performance_rating, venue_rating, favorite, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(show_id, profile_id) DO UPDATE SET performance_rating=excluded.performance_rating,
        venue_rating=excluded.venue_rating, favorite=excluded.favorite, notes=excluded.notes, updated_at=excluded.updated_at`).run(
      reviewMatch[1], profileId, performanceRating, venueRating, favorite, notes, new Date().toISOString()
    );
    return sendJson(response, 200, sharedShowRows().find((entry) => entry.id === reviewMatch[1]));
  }

  if (request.method === 'POST' && url.pathname === '/api/map/locations') {
    const locations = await mapLocations();
    return sendJson(response, 200, { locations });
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations') {
    const connections = await readConnections();
    return sendJson(response, 200, {
      spotify: { configured: configured('spotify'), connected: Boolean(connections.spotify?.accessToken) },
      youtube: { configured: configured('youtube'), connected: Boolean(connections.youtube?.accessToken) },
      appleMusic: { configured: configured('apple-music'), developerToken: process.env.APPLE_MUSIC_DEVELOPER_TOKEN || null }
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/backup') {
    requireAccount(request);
    const media = database.prepare('SELECT * FROM gig_media ORDER BY created_at').all();
    const files = [];
    for (const item of media) {
      try { files.push({ ...item, data: (await fs.readFile(path.join(MEDIA_DIR, item.filename))).toString('base64') }); } catch { /* keep manifest entry if a file is missing */ }
    }
    const profileImages = [...new Set([...database.prepare('SELECT image FROM artist_info').all(), ...database.prepare('SELECT image FROM venue_info').all()].map((row) => localProfileImageFilename(row.image)).filter(Boolean))];
    for (const filename of profileImages) {
      try { files.push({ kind: 'profile-image', filename, data: (await fs.readFile(path.join(MEDIA_DIR, filename))).toString('base64') }); } catch { /* database backup still retains the missing image reference */ }
    }
    return sendJson(response, 200, { format: 'the-master-list-backup-v1', createdAt: new Date().toISOString(), database: (await fs.readFile(DB_FILE)).toString('base64'), media: files });
  }

  if (request.method === 'GET' && url.pathname === '/api/archive/export') {
    requireAccount(request);
    const gigs = await readGigs();
    return sendJson(response, 200, { format: 'the-master-list-export-v1', createdAt: new Date().toISOString(), gigs });
  }
  if (request.method === 'POST' && url.pathname === '/api/archive/import') {
    requireAccount(request);
    const body = await readBody(request);
    if (!Array.isArray(body.gigs)) return sendError(response, 400, 'Import must contain a gigs array.');
    const imported = body.gigs.map((gig) => { const id = gig.id || randomUUID(); return { ...gig, id, sharedId: gig.sharedId || id, artist: String(gig.artist || '').trim(), venue: String(gig.venue || '').trim(), city: String(gig.city || '').trim(), date: String(gig.date || '').trim(), songs: Array.isArray(gig.songs) ? gig.songs : [], attendees: normaliseGigAttendees(gig.attendees, request.account), createdAt: gig.createdAt || new Date().toISOString() }; });
    imported.forEach(validateGig);
    const importGigs = database.transaction((records) => { const statement = database.prepare(`INSERT INTO gigs (id, shared_id, artist, venue, city, date, notes, performance_notes, venue_notes, performance_rating, venue_rating, favorite, setlist_fm_id, setlist_fm_url, songs, attendees, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET shared_id=excluded.shared_id, artist=excluded.artist, venue=excluded.venue, city=excluded.city, date=excluded.date, notes=excluded.notes, performance_notes=excluded.performance_notes, venue_notes=excluded.venue_notes, performance_rating=excluded.performance_rating, venue_rating=excluded.venue_rating, favorite=excluded.favorite, setlist_fm_id=excluded.setlist_fm_id, setlist_fm_url=excluded.setlist_fm_url, songs=excluded.songs, attendees=excluded.attendees`); records.forEach((gig) => statement.run(gig.id, gig.sharedId, gig.artist, gig.venue, gig.city, gig.date, gig.notes || '', gig.performanceNotes || gig.notes || '', gig.venueNotes || '', gig.performanceRating ?? null, gig.venueRating ?? null, gig.favorite ? 1 : 0, gig.setlistFmId || null, gig.setlistFmUrl || null, JSON.stringify(gig.songs || []), JSON.stringify(gig.attendees || []), gig.createdAt)); });
    importGigs(imported);
    return sendJson(response, 200, { imported: imported.length });
  }
  if (request.method === 'GET' && url.pathname === '/api/stats') {
    const gigs = database.prepare('SELECT artist, venue, city, date, favorite, songs FROM gigs').all();
    const songs = gigs.flatMap((gig) => JSON.parse(gig.songs || '[]'));
    const countBy = (values) => Object.entries(values.reduce((result, value) => { const key = String(value || 'Unknown'); result[key] = (result[key] || 0) + 1; return result; }, {})).sort((a, b) => b[1] - a[1]);
    const topVenues = countBy(gigs.map((gig) => `${gig.venue}\u001f${gig.city}`)).slice(0, 5).map(([key, count]) => { const [name, city] = key.split('\u001f'); return [name, city, count]; });
    return sendJson(response, 200, { shows: gigs.length, artists: new Set(gigs.map((gig) => gig.artist.toLowerCase())).size, venues: new Set(gigs.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size, cities: new Set(gigs.map((gig) => gig.city.toLowerCase())).size, songs: songs.length, favourites: gigs.filter((gig) => gig.favorite).length, topArtists: countBy(gigs.map((gig) => gig.artist)).slice(0, 5), topVenues, years: countBy(gigs.map((gig) => gig.date?.slice(0, 4)).filter(Boolean)) });
  }
  if (request.method === 'GET' && url.pathname === '/api/limits') {
    requireAccount(request);
    const day = usageDay();
    const usage = database.prepare(`SELECT provider, COUNT(*) AS requests, COALESCE(SUM(quota_units), 0) AS units,
      SUM(CASE WHEN status IS NOT NULL AND status >= 400 THEN 1 ELSE 0 END) AS errors,
      MAX(requested_at) AS lastRequest
      FROM api_usage WHERE usage_day = ? GROUP BY provider`).all(day);
    const operations = database.prepare(`SELECT provider, operation, COUNT(*) AS requests, COALESCE(SUM(quota_units), 0) AS units,
      MAX(requested_at) AS lastRequest FROM api_usage WHERE usage_day = ? GROUP BY provider, operation ORDER BY units DESC, requests DESC LIMIT 30`).all(day);
    const recent = database.prepare(`SELECT provider, operation, quota_units AS units, status, requested_at AS requestedAt
      FROM api_usage WHERE usage_day = ? ORDER BY id DESC LIMIT 20`).all(day);
    const usageByProvider = new Map(usage.map((entry) => [entry.provider, entry]));
    const youtubeQuota = Math.max(1, Number(process.env.YOUTUBE_DAILY_QUOTA_UNITS || 10000));
    const definitions = [
      { id: 'youtube', name: 'YouTube Data API', configured: configured('youtube'), limit: youtubeQuota, unit: 'quota units', reset: 'Midnight Pacific Time', note: 'Estimated from this app’s requests. Search costs 100 units; playlist writes cost 50.' },
      { id: 'setlist.fm', name: 'setlist.fm', configured: Boolean(process.env.SETLIST_FM_API_KEY && process.env.SETLIST_FM_API_KEY !== 'replace-me'), limit: null, unit: 'requests', reset: 'Provider-managed', note: 'The API does not return a remaining-quota value, so this page shows tracked requests and errors.' },
      { id: 'spotify', name: 'Spotify Web API', configured: configured('spotify'), limit: null, unit: 'requests', reset: 'Provider-managed', note: 'Spotify does not publish a simple daily allowance; watch the recent error status for 429 responses.' },
      { id: 'apple-music', name: 'Apple Music API', configured: configured('apple-music'), limit: null, unit: 'requests', reset: 'Provider-managed', note: 'Apple Music does not expose a remaining request count to this app.' },
      { id: 'audd', name: 'AudD music recognition', configured: configured('audd'), limit: null, unit: 'requests', reset: 'Provider-managed', note: 'AudD usage is tracked here, but the provider controls the allowance and billing.' }
    ];
    return sendJson(response, 200, {
      day,
      generatedAt: new Date().toISOString(),
      providers: definitions.map((definition) => {
        const entry = usageByProvider.get(definition.id) || { requests: 0, units: 0, errors: 0, lastRequest: null };
        return { ...definition, requests: Number(entry.requests), units: Number(entry.units), errors: Number(entry.errors), remaining: definition.limit === null ? null : Math.max(0, definition.limit - Number(entry.units)), lastRequest: entry.lastRequest };
      }),
      operations,
      recent
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/jobs') {
    return sendJson(response, 200, database.prepare("SELECT id, type, name, status, progress, error FROM background_jobs WHERE status IN ('running', 'queued') ORDER BY created_at").all());
  }
  const jobMatch = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/);
  if (request.method === 'GET' && jobMatch) {
    const job = rotateJobs.get(jobMatch[1]) || database.prepare('SELECT id, type, name, status, progress, error FROM background_jobs WHERE id = ?').get(jobMatch[1]);
    return sendJson(response, job ? 200 : 404, job || { error: 'Background job not found.' });
  }
  if (request.method === 'POST' && url.pathname === '/api/media/cleanup') {
    requireAccount(request);
    const profileImages = [...database.prepare('SELECT image FROM artist_info').all(), ...database.prepare('SELECT image FROM venue_info').all()].map((row) => localProfileImageFilename(row.image)).filter(Boolean);
    const referenced = new Set([...database.prepare('SELECT filename, playback_filename, background_filename FROM gig_media').all().flatMap((row) => [row.filename, row.playback_filename, row.background_filename].filter(Boolean)), ...profileImages]);
    const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true }); let removed = 0;
    for (const entry of entries) { if (!entry.isFile() || referenced.has(entry.name)) continue; await fs.rm(path.join(MEDIA_DIR, entry.name), { force: true }); removed += 1; }
    return sendJson(response, 200, { removed });
  }

  const profileImageMatch = url.pathname.match(/^\/api\/profile-images\/(profile-[a-f0-9-]+\.(?:jpe?g|png|webp|gif))$/i);
  if (request.method === 'GET' && profileImageMatch) {
    requireAccount(request);
    const filename = profileImageMatch[1];
    try {
      const filePath = path.join(MEDIA_DIR, filename);
      const stat = await fs.stat(filePath);
      const mimeType = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' })[path.extname(filename).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': mimeType, 'Content-Length': stat.size, 'Cache-Control': 'private, max-age=86400' });
      return legacyFs.createReadStream(filePath).pipe(response);
    } catch { return sendError(response, 404, 'Profile image not found.'); }
  }

  if (request.method === 'GET' && url.pathname === '/api/directory/metadata') {
    requireAccount(request);
    const artists = database.prepare('SELECT lookup_name AS lookupName, title, description, image, image_position AS imagePosition FROM artist_info').all();
    const venues = database.prepare('SELECT lookup_name AS lookupName, title, description, image, image_position AS imagePosition FROM venue_info').all();
    return sendJson(response, 200, { artists, venues });
  }

  if (request.method === 'GET' && url.pathname === '/api/artists') {
    const info = await fetchArtistInfo(url.searchParams.get('name'));
    return sendJson(response, 200, { ...info, imagePosition: normaliseImagePosition(info.imagePosition) });
  }
  if (request.method === 'GET' && url.pathname === '/api/venues') {
    const info = await fetchVenueInfo(url.searchParams.get('name'), url.searchParams.get('city'));
    return sendJson(response, 200, { ...info, imagePosition: normaliseImagePosition(info.imagePosition) });
  }
  if (request.method === 'PATCH' && url.pathname === '/api/artists') {
    requireAccount(request);
    const name = String(url.searchParams.get('name') || '').trim();
    if (!name) return sendError(response, 400, 'An artist name is required.');
    const body = await readBody(request);
    const lookupName = name.toLowerCase();
    const existing = database.prepare('SELECT title, description, bio, image, image_position AS imagePosition, source FROM artist_info WHERE lookup_name = ?').get(lookupName);
    const uploadedImage = await saveProfileImageUpload(body.imageUpload);
    const info = {
      title: String(body.title ?? existing?.title ?? name).trim(),
      description: String(body.description ?? existing?.description ?? '').trim(),
      bio: String(body.bio ?? existing?.bio ?? '').trim(),
      image: uploadedImage || String(body.image ?? existing?.image ?? '').trim() || null,
      imagePosition: normaliseImagePosition(body.imagePosition ?? existing?.imagePosition),
      source: String(body.source ?? existing?.source ?? '').trim() || null
    };
    database.prepare('INSERT OR REPLACE INTO artist_info (lookup_name, title, description, bio, image, image_position, is_manual, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.imagePosition, info.source, new Date().toISOString());
    await removeReplacedProfileImage(existing?.image, info.image);
    return sendJson(response, 200, { name, ...info });
  }
  if (request.method === 'PATCH' && url.pathname === '/api/venues') {
    requireAccount(request);
    const name = String(url.searchParams.get('name') || '').trim();
    const city = String(url.searchParams.get('city') || '').trim();
    if (!name) return sendError(response, 400, 'A venue name is required.');
    const body = await readBody(request);
    const lookupName = `${name}|${city}`.toLowerCase();
    const existing = database.prepare('SELECT title, description, bio, image, image_position AS imagePosition, source FROM venue_info WHERE lookup_name = ?').get(lookupName);
    const uploadedImage = await saveProfileImageUpload(body.imageUpload);
    const info = {
      title: String(body.title ?? existing?.title ?? name).trim(),
      description: String(body.description ?? existing?.description ?? '').trim(),
      bio: String(body.bio ?? existing?.bio ?? '').trim(),
      image: uploadedImage || String(body.image ?? existing?.image ?? '').trim() || null,
      imagePosition: normaliseImagePosition(body.imagePosition ?? existing?.imagePosition),
      source: String(body.source ?? existing?.source ?? '').trim() || null
    };
    database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, image_position, is_manual, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.imagePosition, info.source, new Date().toISOString());
    await removeReplacedProfileImage(existing?.image, info.image);
    return sendJson(response, 200, { name, city, ...info });
  }

  if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, await archiveHealth());
  if (request.method === 'POST' && url.pathname === '/api/health/repair') {
    const body = await readBody(request);
    const type = String(body.type || '');
    if (type === 'albums') await enrichGigAlbums(String(body.key || ''), true);
    else if (type === 'artist') {
      const name = String(body.key || '').trim();
      if (!name) return sendError(response, 400, 'Artist name is required.');
      const existing = database.prepare('SELECT image FROM artist_info WHERE lookup_name = ?').get(name.toLowerCase());
      database.prepare('DELETE FROM artist_info WHERE lookup_name = ?').run(name.toLowerCase());
      await removeReplacedProfileImage(existing?.image, null);
      await fetchArtistInfo(name);
    } else if (type === 'venue') {
      const name = String(body.name || '').trim(); const city = String(body.city || '').trim();
      if (!name) return sendError(response, 400, 'Venue name is required.');
      const existing = database.prepare('SELECT image FROM venue_info WHERE lookup_name = ?').get(`${name}|${city}`.toLowerCase());
      database.prepare('DELETE FROM venue_info WHERE lookup_name = ?').run(`${name}|${city}`.toLowerCase());
      await removeReplacedProfileImage(existing?.image, null);
      await fetchVenueInfo(name, city);
    } else if (type === 'location') {
      const key = String(body.key || '').toLowerCase();
      const geocodes = await readGeocodes();
      delete geocodes[key];
      await writeGeocodes(geocodes);
      await mapLocations();
    } else return sendError(response, 400, 'This metadata issue cannot be repaired automatically.');
    return sendJson(response, 200, await archiveHealth());
  }
  if (request.method === 'POST' && url.pathname === '/api/health/manual') {
    const body = await readBody(request);
    const type = String(body.type || '');
    if (type === 'artist') {
      const name = String(body.key || '').trim();
      if (!name) return sendError(response, 400, 'Artist name is required.');
      const lookupName = name.toLowerCase();
      const existing = database.prepare('SELECT image, image_position AS imagePosition FROM artist_info WHERE lookup_name = ?').get(lookupName);
      const info = {
        title: String(body.title || name).trim(), description: String(body.description || '').trim(), bio: String(body.bio || '').trim(),
        image: String(body.image || '').trim() || null, imagePosition: normaliseImagePosition(existing?.imagePosition), source: String(body.source || '').trim() || null
      };
      database.prepare('INSERT OR REPLACE INTO artist_info (lookup_name, title, description, bio, image, image_position, is_manual, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.imagePosition, info.source, new Date().toISOString());
      await removeReplacedProfileImage(existing?.image, info.image);
    } else if (type === 'venue') {
      const name = String(body.name || '').trim(); const city = String(body.city || '').trim();
      if (!name) return sendError(response, 400, 'Venue name is required.');
      const lookupName = `${name}|${city}`.toLowerCase();
      const existing = database.prepare('SELECT image, image_position AS imagePosition FROM venue_info WHERE lookup_name = ?').get(lookupName);
      const info = {
        title: String(body.title || name).trim(), description: String(body.description || '').trim(), bio: String(body.bio || '').trim(),
        image: String(body.image || '').trim() || null, imagePosition: normaliseImagePosition(existing?.imagePosition), source: String(body.source || '').trim() || null
      };
      database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, image_position, is_manual, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.imagePosition, info.source, new Date().toISOString());
      await removeReplacedProfileImage(existing?.image, info.image);
    } else if (type === 'location') {
      const key = String(body.key || '').toLowerCase(); const address = String(body.address || '').trim();
      let lat = Number(body.lat); let lng = Number(body.lng);
      if (!key) return sendError(response, 400, 'A venue location is required.');
      if (address) {
        const query = new URL('https://nominatim.openstreetmap.org/search');
        query.searchParams.set('q', address); query.searchParams.set('format', 'jsonv2'); query.searchParams.set('limit', '1');
        const result = await fetch(query, { headers: { 'User-Agent': 'TheMasterList/0.1 personal-live-music-archive', 'Accept-Language': 'en' } });
        const match = result.ok ? (await result.json())[0] : null;
        if (!match) return sendError(response, 404, 'That address could not be found. Try including the suburb, city and country.');
        lat = Number(match.lat); lng = Number(match.lon);
      }
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return sendError(response, 400, 'Enter an address or valid latitude and longitude coordinates.');
      const geocodes = await readGeocodes();
      geocodes[key] = { lat, lng };
      await writeGeocodes(geocodes);
    } else return sendError(response, 400, 'Manual entry is not available for this issue type.');
    return sendJson(response, 200, await archiveHealth());
  }

  if (request.method === 'GET' && url.pathname === '/api/gigs') {
    const gigs = await readGigs();
    return sendJson(response, 200, gigs.sort((a, b) => b.date.localeCompare(a.date)));
  }

  const albumStatsMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/album-stats$/);
  if (albumStatsMatch && request.method === 'GET') {
    return sendJson(response, 200, await enrichGigAlbums(albumStatsMatch[1]));
  }

  if (request.method === 'POST' && url.pathname === '/api/gigs') {
    const gig = await readBody(request);
    validateGig(gig);
    const record = {
      id: randomUUID(),
      sharedId: randomUUID(),
      artist: gig.artist.trim(),
      venue: gig.venue.trim(),
      city: gig.city.trim(),
      date: String(gig.date || '').trim(),
      notes: String(gig.notes || '').trim(),
      performanceNotes: String(gig.performanceNotes || gig.notes || '').trim(),
      venueNotes: String(gig.venueNotes || '').trim(),
      performanceRating: normaliseRating(gig.performanceRating),
      venueRating: normaliseRating(gig.venueRating),
      favorite: gig.favorite === true || gig.favorite === 'true',
      setlistFmId: gig.setlistFmId || null,
      setlistFmUrl: gig.setlistFmUrl || null,
      songs: Array.isArray(gig.songs) ? gig.songs : [],
      attendees: normaliseGigAttendees(gig.attendees, request.account),
      createdAt: new Date().toISOString()
    };
    database.prepare(`
      INSERT INTO gigs (id, shared_id, artist, venue, city, date, notes, performance_notes, venue_notes,
        performance_rating, venue_rating, favorite, setlist_fm_id, setlist_fm_url, songs, attendees, created_at)
      VALUES (@id, @sharedId, @artist, @venue, @city, @date, @notes, @performanceNotes, @venueNotes,
        @performanceRating, @venueRating, @favorite, @setlistFmId, @setlistFmUrl, @songs, @attendees, @createdAt)
    `).run({
      ...record,
      performanceRating: record.performanceRating ?? null,
      venueRating: record.venueRating ?? null,
      favorite: record.favorite ? 1 : 0,
      setlistFmId: record.setlistFmId || null,
      setlistFmUrl: record.setlistFmUrl || null,
      songs: JSON.stringify(record.songs || []),
      attendees: JSON.stringify(record.attendees || [])
    });
    return sendJson(response, 201, record);
  }

  const gigMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)$/);
  const mediaCollectionMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/media$/);
  const artifactCollectionMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/artifacts$/);
  const chunkMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/media\/chunk$/);
  const artifactChunkMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/artifacts\/chunk$/);
  const uploadChunkMatch = artifactChunkMatch || chunkMatch;
  if (uploadChunkMatch && request.method === 'POST') {
    console.log(`[media] ${artifactChunkMatch ? 'artifact ' : ''}chunk upload request for gig ${uploadChunkMatch[1]} offset ${request.headers['x-upload-offset'] || 0}`);
    const gigId = uploadChunkMatch[1]; const uploadId = String(request.headers['x-upload-id'] || ''); const filename = decodeURIComponent(String(request.headers['x-media-filename'] || 'upload')); const total = Number(request.headers['x-upload-total'] || 0); const offset = Number(request.headers['x-upload-offset'] || 0); const category = artifactChunkMatch ? 'artifact' : mediaCategory(url.searchParams.get('category') || request.headers['x-media-category']); const uploadMimeType = String(request.headers['content-type'] || 'video/mp4');
    if (!uploadId || !total) return sendError(response, 400, 'Invalid upload session.');
    if (category === 'artifact' && !/^image\/(jpeg|png|gif|webp)$/.test(uploadMimeType)) return sendError(response, 415, 'Artifacts must be uploaded as photos.');
    for (const [sessionId, entry] of uploadSessions) if (entry.expiresAt && entry.expiresAt < Date.now()) uploadSessions.delete(sessionId);
    let session = uploadSessions.get(uploadId);
    if (session?.complete) return sendJson(response, 200, { complete: true, offset: session.total, media: mediaRows(gigId).find((entry) => entry.id === session.mediaId) });
    if (!session) { const stored = `${randomUUID()}.${mediaExtension(uploadMimeType, filename)}`; session = { gigId, filename, total, category, offset: 0, stored, path: path.join(MEDIA_DIR, `${stored}.uploading`) }; await fs.mkdir(MEDIA_DIR, { recursive: true }); uploadSessions.set(uploadId, session); }
    if (offset !== session.offset) return sendJson(response, 409, { offset: session.offset });
    const output = legacyFs.createWriteStream(session.path, { flags: offset ? 'a' : 'w' }); for await (const chunk of request) { session.offset += chunk.length; if (!output.write(chunk)) await new Promise((resolve) => output.once('drain', resolve)); } await new Promise((resolve, reject) => output.end((error) => error ? reject(error) : resolve()));
    if (session.offset >= session.total) {
      await fs.rename(session.path, path.join(MEDIA_DIR, session.stored)); const digest = await hashFile(path.join(MEDIA_DIR, session.stored));
      const duplicate = database.prepare('SELECT id FROM gig_media WHERE gig_id = ? AND checksum = ? AND size = ? AND category = ?').get(gigId, digest, session.total, session.category || 'show');
      if (duplicate) { await fs.rm(path.join(MEDIA_DIR, session.stored), { force: true }); uploadSessions.set(uploadId, { ...session, complete: true, mediaId: duplicate.id, expiresAt: Date.now() + 10 * 60 * 1000 }); return sendJson(response, 200, { complete: true, duplicate: true, offset: session.total, media: mediaRows(gigId).find((entry) => entry.id === duplicate.id) }); }
      const id = randomUUID(); const mimeType = uploadMimeType; const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ? AND category = ?').get(gigId, session.category || 'show').next;
      database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, is_cover, sort_order, rotation, category, checksum, size, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)').run(id, gigId, session.stored, mimeType, filename, sortOrder, session.category || 'show', digest, session.total, new Date().toISOString()); uploadSessions.set(uploadId, { ...session, complete: true, mediaId: id, expiresAt: Date.now() + 10 * 60 * 1000 });
      if (process.env.AUDD_API_TOKEN && mimeType.startsWith('video/')) database.prepare("UPDATE gig_media SET recognition_status = 'queued' WHERE id = ?").run(id);
      if (mimeType.startsWith('video/')) { const gigInfo = database.prepare('SELECT artist, venue, date FROM gigs WHERE id = ?').get(gigId); const sourcePath = path.join(MEDIA_DIR, session.stored); const proxyName = `${safeMediaName(gigInfo?.artist)}-${safeMediaName(gigInfo?.venue)}-${safeMediaName(gigInfo?.date)}-${id.slice(0, 8)}-playback.mp4`; const encodeJobId = randomUUID(); database.prepare("UPDATE gig_media SET playback_status = 'encoding', playback_error = NULL WHERE id = ?").run(id); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'running', 1); setImmediate(async () => { const encoded = await createPlaybackProxy(sourcePath, path.join(MEDIA_DIR, proxyName)); if (encoded) { database.prepare("UPDATE gig_media SET playback_filename = ?, playback_mime = ?, playback_status = 'ready', playback_error = NULL WHERE id = ?").run(proxyName, 'video/mp4', id); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'complete', 100); } else { database.prepare("UPDATE gig_media SET playback_status = 'error', playback_error = 'Playback encode failed.' WHERE id = ?").run(id); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'error', 0, 'Playback encode failed.'); } }); setImmediate(() => recognizeVideoTrack(gigId, id, sourcePath, filename)); }
      return sendJson(response, 201, { complete: true, media: mediaRows(gigId).find((entry) => entry.id === id) });
    }
    return sendJson(response, 200, { complete: false, offset: session.offset });
  }
  if (mediaCollectionMatch && request.method === 'GET') {
    if (!database.prepare('SELECT id FROM gigs WHERE id = ?').get(mediaCollectionMatch[1])) return sendError(response, 404, 'Gig not found.');
    return sendJson(response, 200, mediaRows(mediaCollectionMatch[1]));
  }
  const uploadCollectionMatch = artifactCollectionMatch || mediaCollectionMatch;
  if (uploadCollectionMatch && request.method === 'POST') {
    const gigId = uploadCollectionMatch[1];
    console.log(`[media] upload request for gig ${gigId}: ${request.headers['content-type'] || 'unknown'} (${request.headers['content-length'] || 'unknown'} bytes)`);
    if (!database.prepare('SELECT id FROM gigs WHERE id = ?').get(gigId)) return sendError(response, 404, 'Gig not found.');
    const contentType = String(request.headers['content-type'] || '');
    if (!contentType.includes('application/json')) {
      const mimeType = contentType.split(';')[0].trim();
      const category = artifactCollectionMatch ? 'artifact' : mediaCategory(url.searchParams.get('category') || request.headers['x-media-category']);
      const filename = decodeURIComponent(String(request.headers['x-media-filename'] || 'upload')).slice(0, 180);
      const expectedSize = Number(request.headers['content-length'] || 0);
      if (!/^image\/(jpeg|png|gif|webp)$|^video\/(mp4|webm|quicktime)$/.test(mimeType)) return sendError(response, 415, 'Upload an image or video file.');
      if (category === 'artifact' && !mimeType.startsWith('image/')) return sendError(response, 415, 'Artifacts must be uploaded as photos.');
      if (expectedSize > MAX_MEDIA_SIZE) return sendError(response, 413, 'Each upload must be 50 GB or smaller.');
      await fs.mkdir(MEDIA_DIR, { recursive: true });
      const id = randomUUID();
      const storedFilename = `${id}.${mediaExtension(mimeType, filename)}`;
      const temporaryPath = path.join(MEDIA_DIR, `${storedFilename}.uploading`);
      let playbackFilename = null;
      const output = legacyFs.createWriteStream(temporaryPath, { flags: 'wx' });
      let size = 0;
      const checksum = createHash('sha256');
      try {
        for await (const chunk of request) {
          size += chunk.length;
          checksum.update(chunk);
          if (size > MAX_MEDIA_SIZE) throw new Error('Each upload must be 50 GB or smaller.');
          if (!output.write(chunk)) await new Promise((resolve) => output.once('drain', resolve));
        }
        await new Promise((resolve, reject) => { output.end((error) => error ? reject(error) : resolve()); });
        await fs.rename(temporaryPath, path.join(MEDIA_DIR, storedFilename));
        console.log(`[media] upload stored: ${storedFilename} (${size} bytes)`);
      } catch (error) {
        output.destroy(); await fs.rm(temporaryPath, { force: true });
        return sendError(response, 413, error.message);
      }
      const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ? AND category = ?').get(gigId, category).next;
      const digest = checksum.digest('hex');
      const duplicate = database.prepare('SELECT id FROM gig_media WHERE gig_id = ? AND checksum = ? AND size = ? AND category = ?').get(gigId, digest, size, category);
      if (duplicate) { await fs.rm(path.join(MEDIA_DIR, storedFilename), { force: true }); return sendJson(response, 200, { duplicate: true, media: mediaRows(gigId).find((entry) => entry.id === duplicate.id) }); }
      database.prepare('INSERT INTO gig_media (id, gig_id, filename, playback_filename, mime_type, caption, is_cover, sort_order, rotation, category, checksum, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, gigId, storedFilename, playbackFilename, mimeType, decodeURIComponent(String(request.headers['x-media-caption'] || filename)).trim(), 0, sortOrder, 0, category, digest, size, new Date().toISOString());
      if (process.env.AUDD_API_TOKEN && mimeType.startsWith('video/')) database.prepare("UPDATE gig_media SET recognition_status = 'queued' WHERE id = ?").run(id);
      console.log(`[media] upload complete: ${id}`);
      if (mimeType.startsWith('video/')) { const gigInfo = database.prepare('SELECT artist, venue, date FROM gigs WHERE id = ?').get(gigId); const sourcePath = path.join(MEDIA_DIR, storedFilename); const proxyName = `${safeMediaName(gigInfo?.artist)}-${safeMediaName(gigInfo?.venue)}-${safeMediaName(gigInfo?.date)}-${id.slice(0, 8)}-playback.mp4`; const encodeJobId = randomUUID(); database.prepare("UPDATE gig_media SET playback_status = 'encoding', playback_error = NULL WHERE id = ?").run(id); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'running', 1); setImmediate(async () => { const encoded = await createPlaybackProxy(sourcePath, path.join(MEDIA_DIR, proxyName)); if (encoded) { database.prepare("UPDATE gig_media SET playback_filename = ?, playback_mime = ?, playback_status = 'ready', playback_error = NULL WHERE id = ?").run(proxyName, 'video/mp4', id); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'complete', 100); } else { database.prepare("UPDATE gig_media SET playback_status = 'error', playback_error = 'Playback encode failed.' WHERE id = ?").run(id); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'error', 0, 'Playback encode failed.'); } }); setImmediate(() => recognizeVideoTrack(gigId, id, sourcePath, filename)); }
      return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
    }
    const body = await readBody(request);
    if (body.externalUrl) {
      let parsed;
      try { parsed = new URL(String(body.externalUrl)); } catch { return sendError(response, 400, 'Enter a valid YouTube URL.'); }
      if (!['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(parsed.hostname.toLowerCase())) return sendError(response, 400, 'Only YouTube URLs can be added as external media.');
      const id = randomUUID();
      const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ?').get(gigId).next;
      database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, is_cover, sort_order, rotation, category, external_url, song_index, source_description, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, gigId, 'external', 'video/youtube', String(body.caption || 'YouTube video').trim(), 0, sortOrder, 0, 'other', parsed.toString(), Number.isInteger(body.songIndex) ? body.songIndex : null, String(body.sourceDescription || ''), 0, new Date().toISOString());
      return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
    }
    const mimeType = String(body.mimeType || '');
    const category = artifactCollectionMatch ? 'artifact' : mediaCategory(body.category);
    const filename = String(body.filename || 'upload').slice(0, 180);
    if (!/^image\/(jpeg|png|gif|webp)$|^video\/(mp4|webm|quicktime)$/.test(mimeType)) return sendError(response, 415, 'Upload an image or video file.');
    if (category === 'artifact' && !mimeType.startsWith('image/')) return sendError(response, 415, 'Artifacts must be uploaded as photos.');
    const encoded = String(body.data || '').replace(/^data:[^;]+;base64,/, '');
    const file = Buffer.from(encoded, 'base64');
    if (!file.length || file.length > MAX_MEDIA_SIZE) return sendError(response, 413, 'Each upload must be between 1 byte and 50 GB.');
    await fs.mkdir(MEDIA_DIR, { recursive: true });
    const id = randomUUID();
    const storedFilename = `${id}.${mediaExtension(mimeType, filename)}`;
    await fs.writeFile(path.join(MEDIA_DIR, storedFilename), file);
    const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ? AND category = ?').get(gigId, category).next;
    database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, is_cover, sort_order, rotation, category, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, gigId, storedFilename, mimeType, String(body.caption || filename).trim(), body.isCover ? 1 : 0, sortOrder, 0, category, file.length, new Date().toISOString());
    if (process.env.AUDD_API_TOKEN && mimeType.startsWith('video/')) database.prepare("UPDATE gig_media SET recognition_status = 'queued' WHERE id = ?").run(id);
    if (mimeType.startsWith('video/')) setImmediate(() => recognizeVideoTrack(gigId, id, path.join(MEDIA_DIR, storedFilename), filename));
    return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
  }
  const retryEncodeMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/retry-encode$/);
  if (request.method === 'POST' && retryEncodeMatch) {
    requireAccount(request);
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(retryEncodeMatch[1]);
    if (!media || !String(media.mime_type || '').startsWith('video/') || media.external_url) return sendError(response, 400, 'Only uploaded videos can create a playback copy.');
    if (media.playback_status === 'encoding') return sendError(response, 409, 'Playback encoding is already running.');
    const sourcePath = path.join(MEDIA_DIR, media.filename);
    if (!legacyFs.existsSync(sourcePath)) return sendError(response, 409, 'The original media file is missing from disk.');
    const gigInfo = database.prepare('SELECT artist, venue, date FROM gigs WHERE id = ?').get(media.gig_id);
    const proxyName = `${safeMediaName(gigInfo?.artist)}-${safeMediaName(gigInfo?.venue)}-${safeMediaName(gigInfo?.date)}-${media.id.slice(0, 8)}-playback.mp4`;
    const jobId = randomUUID();
    database.prepare("UPDATE gig_media SET playback_status = 'encoding', playback_error = NULL WHERE id = ?").run(media.id);
    saveBackgroundJob(jobId, 'Encode video', media.caption || media.filename, 'running', 1);
    setImmediate(async () => {
      const encoded = await createPlaybackProxy(sourcePath, path.join(MEDIA_DIR, proxyName));
      if (encoded) {
        database.prepare("UPDATE gig_media SET playback_filename = ?, playback_mime = ?, playback_status = 'ready', playback_error = NULL WHERE id = ?").run(proxyName, 'video/mp4', media.id);
        saveBackgroundJob(jobId, 'Encode video', media.caption || media.filename, 'complete', 100);
      } else {
        database.prepare("UPDATE gig_media SET playback_status = 'error', playback_error = 'Playback encode failed.' WHERE id = ?").run(media.id);
        saveBackgroundJob(jobId, 'Encode video', media.caption || media.filename, 'error', 0, 'Playback encode failed.');
      }
    });
    return sendJson(response, 202, { jobId });
  }
  const retryRecognitionMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/retry-recognition$/);
  if (request.method === 'POST' && retryRecognitionMatch) {
    requireAccount(request);
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(retryRecognitionMatch[1]);
    if (!media || !String(media.mime_type || '').startsWith('video/') || media.external_url) return sendError(response, 400, 'Only uploaded videos can use track detection.');
    if (['queued', 'running'].includes(media.recognition_status)) return sendError(response, 409, 'Track detection is already running.');
    if (!process.env.AUDD_API_TOKEN) return sendError(response, 409, 'AudD is not configured.');
    const sourcePath = path.join(MEDIA_DIR, media.filename);
    if (!legacyFs.existsSync(sourcePath)) return sendError(response, 409, 'The original media file is missing from disk.');
    database.prepare("UPDATE gig_media SET recognition_status = 'queued', recognition_error = NULL WHERE id = ?").run(media.id);
    setImmediate(() => recognizeVideoTrack(media.gig_id, media.id, sourcePath, media.caption || media.filename));
    return sendJson(response, 202, { ok: true });
  }
  const mediaMatch = url.pathname.match(/^\/api\/media\/([\w-]+)$/);
  if (request.method === 'PATCH' && mediaMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(mediaMatch[1]);
    if (!media) return sendError(response, 404, 'Media not found.');
    const body = await readBody(request);
    const playbackStart = 'playbackStart' in body && body.playbackStart !== '' && body.playbackStart !== null ? Number(body.playbackStart) : null;
    const playbackEnd = 'playbackEnd' in body && body.playbackEnd !== '' && body.playbackEnd !== null ? Number(body.playbackEnd) : null;
    if ('playbackStart' in body && playbackStart !== null && (!Number.isFinite(playbackStart) || playbackStart < 0)) return sendError(response, 400, 'Playback start must be zero or greater.');
    if ('playbackEnd' in body && playbackEnd !== null && (!Number.isFinite(playbackEnd) || playbackEnd <= 0)) return sendError(response, 400, 'Playback end must be greater than zero.');
    const effectiveStart = 'playbackStart' in body ? playbackStart : media.playback_start;
    const effectiveEnd = 'playbackEnd' in body ? playbackEnd : media.playback_end;
    if (effectiveStart !== null && effectiveEnd !== null && Number(effectiveEnd) <= Number(effectiveStart)) return sendError(response, 400, 'Playback end must be after playback start.');
    const nextSongIndex = 'songIndex' in body ? (body.songIndex === null || body.songIndex === '' ? null : Number(body.songIndex)) : media.song_index;
    const nextPreferred = 'playbackPreferred' in body ? Boolean(body.playbackPreferred) : Boolean(media.playback_preferred);
    if (nextPreferred && nextSongIndex !== null) database.prepare('UPDATE gig_media SET playback_preferred = 0 WHERE gig_id = ? AND song_index = ? AND id <> ?').run(media.gig_id, nextSongIndex, media.id);
    if ('isCover' in body && body.isCover) database.prepare('UPDATE gig_media SET is_cover = 0 WHERE gig_id = ?').run(media.gig_id);
    database.prepare('UPDATE gig_media SET caption = COALESCE(?, caption), is_cover = COALESCE(?, is_cover), sort_order = COALESCE(?, sort_order), rotation = COALESCE(?, rotation), song_index = CASE WHEN ? THEN ? ELSE song_index END, recognition_override = COALESCE(?, recognition_override), use_background_removed = COALESCE(?, use_background_removed), playback_preferred = COALESCE(?, playback_preferred), playback_start = CASE WHEN ? THEN ? ELSE playback_start END, playback_end = CASE WHEN ? THEN ? ELSE playback_end END WHERE id = ?').run('caption' in body ? String(body.caption || '').trim() : null, 'isCover' in body ? (body.isCover ? 1 : 0) : null, 'sortOrder' in body ? Number(body.sortOrder) : null, 'rotation' in body ? ((Number(body.rotation) % 360) + 360) % 360 : null, 'songIndex' in body ? 1 : 0, nextSongIndex, 'recognitionOverride' in body ? (body.recognitionOverride ? 1 : 0) : null, 'useBackgroundRemoved' in body ? (body.useBackgroundRemoved ? 1 : 0) : null, 'playbackPreferred' in body ? (body.playbackPreferred ? 1 : 0) : null, 'playbackStart' in body ? 1 : 0, playbackStart, 'playbackEnd' in body ? 1 : 0, playbackEnd, mediaMatch[1]);
    return sendJson(response, 200, mediaRows(media.gig_id).find((entry) => entry.id === mediaMatch[1]));
  }
  if (request.method === 'DELETE' && mediaMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(mediaMatch[1]);
    if (!media) return sendError(response, 404, 'Media not found.');
    await fs.rm(path.join(MEDIA_DIR, media.filename), { force: true });
    if (media.playback_filename) await fs.rm(path.join(MEDIA_DIR, media.playback_filename), { force: true });
    if (media.background_filename) await fs.rm(path.join(MEDIA_DIR, media.background_filename), { force: true });
    database.prepare('DELETE FROM gig_media WHERE id = ?').run(mediaMatch[1]);
    return sendJson(response, 200, { ok: true });
  }
  const backgroundMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/remove-background$/);
  if (request.method === 'POST' && backgroundMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(backgroundMatch[1]);
    if (!media) return sendError(response, 404, 'Media not found.');
    if (media.category !== 'artifact' || !media.mime_type.startsWith('image/')) return sendError(response, 400, 'Background removal is only available for artifact photos.');
    if (media.background_status === 'running') return sendError(response, 409, 'Background removal is already running.');
    const inputPath = path.join(MEDIA_DIR, media.filename);
    const outputName = `${path.parse(media.filename).name}.cutout.png`;
    const outputPath = path.join(MEDIA_DIR, outputName);
    const temporaryOutputPath = `${outputPath}.processing.png`;
    const jobId = randomUUID();
    database.prepare("UPDATE gig_media SET background_status = 'running', background_error = NULL WHERE id = ?").run(media.id);
    saveBackgroundJob(jobId, 'Remove background', media.caption || media.filename, 'running', 10);
    setImmediate(async () => {
      try {
        saveBackgroundJob(jobId, 'Remove background', media.caption || media.filename, 'running', 25);
        await removeImageBackground(inputPath, temporaryOutputPath);
        saveBackgroundJob(jobId, 'Remove background', media.caption || media.filename, 'running', 90);
        await fs.rename(temporaryOutputPath, outputPath);
        database.prepare("UPDATE gig_media SET background_filename = ?, background_status = 'complete', background_error = NULL, use_background_removed = 1 WHERE id = ?").run(outputName, media.id);
        saveBackgroundJob(jobId, 'Remove background', media.caption || media.filename, 'complete', 100);
      } catch (error) {
        await fs.rm(temporaryOutputPath, { force: true }).catch(() => {});
        database.prepare("UPDATE gig_media SET background_status = 'error', background_error = ? WHERE id = ?").run(error.message, media.id);
        saveBackgroundJob(jobId, 'Remove background', media.caption || media.filename, 'error', 0, error.message);
      }
    });
    return sendJson(response, 202, { jobId });
  }
  const trimMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/trim$/);
  if (request.method === 'POST' && trimMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(trimMatch[1]);
    if (!media || !media.mime_type.startsWith('video/')) return sendError(response, 400, 'Only uploaded videos can be trimmed.');
    const start = Number(url.searchParams.get('start')); const end = Number(url.searchParams.get('end'));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return sendError(response, 400, 'Trim times are invalid.');
    const inputPath = path.join(MEDIA_DIR, media.filename); const outputPath = `${inputPath}.trimming.mp4`; const jobId = randomUUID(); saveBackgroundJob(jobId, 'Trim video', media.filename, 'running', 5);
    setImmediate(async () => { try { await trimVideoFile(inputPath, outputPath, start, end - start, (timeMs) => saveBackgroundJob(jobId, 'Trim video', media.filename, 'running', Math.min(99, Math.round((timeMs / 1000000 / (end - start)) * 100)))); await fs.rename(outputPath, inputPath); if (media.playback_filename) await fs.rm(path.join(MEDIA_DIR, media.playback_filename), { force: true }); database.prepare("UPDATE gig_media SET playback_filename = NULL, playback_mime = NULL, playback_status = 'not_started', playback_error = NULL, size = ?, checksum = ? WHERE id = ?").run((await fs.stat(inputPath)).size, await hashFile(inputPath), media.id); saveBackgroundJob(jobId, 'Trim video', media.filename, 'complete', 100); } catch (error) { await fs.rm(outputPath, { force: true }); saveBackgroundJob(jobId, 'Trim video', media.filename, 'error', 0, error.message); } });
    return sendJson(response, 202, { jobId });
  }
  const rotateMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/rotate$/);
  if (request.method === 'POST' && rotateMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(rotateMatch[1]);
    if (!media) return sendError(response, 404, 'Media not found.');
    if (!media.mime_type.startsWith('video/')) return sendError(response, 400, 'Only video files can be rotated this way.');
    const inputPath = path.join(MEDIA_DIR, media.playback_filename || media.filename);
    const outputPath = `${inputPath}.rotating.mp4`;
    const direction = url.searchParams.get('direction') === 'counterclockwise' ? 'counterclockwise' : 'clockwise';
    const jobId = randomUUID(); saveBackgroundJob(jobId, 'Rotate video', media.filename, 'running', 5);
    setImmediate(async () => { try { const duration = await probeDuration(inputPath); await rotateVideoFile(inputPath, outputPath, direction, (timeMs) => { const progress = duration ? Math.min(99, Math.round((timeMs / 1000000 / duration) * 100)) : 10; saveBackgroundJob(jobId, 'Rotate video', media.filename, 'running', progress); }); await fs.rename(outputPath, inputPath); database.prepare('UPDATE gig_media SET rotation = 0 WHERE id = ?').run(media.id); saveBackgroundJob(jobId, 'Rotate video', media.filename, 'complete', 100); } catch (error) { await fs.rm(outputPath, { force: true }); saveBackgroundJob(jobId, 'Rotate video', media.filename, 'error', 0, error.message); } });
    return sendJson(response, 202, { jobId });
  }
  const rotateStatusMatch = url.pathname.match(/^\/api\/media\/rotate\/([\w-]+)$/);
  if (request.method === 'GET' && rotateStatusMatch) return sendJson(response, 200, rotateJobs.get(rotateStatusMatch[1]) || database.prepare('SELECT id, type, name, status, progress, error FROM background_jobs WHERE id = ?').get(rotateStatusMatch[1]) || { status: 'missing', progress: 0 });
  const playbackSuggestMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/playback-plan\/suggest$/);
  if (request.method === 'POST' && playbackSuggestMatch) {
    requireAccount(request);
    const gig = findGigSync(playbackSuggestMatch[1]);
    let media = mediaRows(gig.id);
    const metadataWarning = await refreshYouTubePlaybackMetadata(gig.id, media);
    media = mediaRows(gig.id);
    const suggestions = suggestPlaybackPlan(gig, media);
    return sendJson(response, 200, { suggestions, metadataWarning, inspected: media.filter((item) => item.category !== 'artifact' && String(item.mimeType || '').startsWith('video/')).length });
  }
  const playbackPlanMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/playback-plan$/);
  if (request.method === 'PUT' && playbackPlanMatch) {
    requireAccount(request);
    const gig = database.prepare('SELECT id, songs FROM gigs WHERE id = ?').get(playbackPlanMatch[1]);
    if (!gig) return sendError(response, 404, 'Gig not found.');
    const songs = JSON.parse(gig.songs || '[]');
    const media = database.prepare("SELECT id FROM gig_media WHERE gig_id = ? AND mime_type LIKE 'video/%' AND category <> 'artifact'").all(gig.id);
    const mediaIds = new Set(media.map((item) => item.id));
    const body = await readBody(request);
    if (!Array.isArray(body.clips)) return sendError(response, 400, 'Playback clips are required.');
    if (body.clips.length > songs.length * 8) return sendError(response, 400, 'A track can have at most eight playback sources.');
    const validatedClips = [];
    const clipKeys = new Set();
    for (const [inputIndex, item] of body.clips.entries()) {
      const songIndex = Number(item.songIndex);
      const mediaId = String(item.mediaId || '');
      const requestedPriority = Number(item.priority);
      const startSeconds = item.startSeconds === '' || item.startSeconds === null || item.startSeconds === undefined ? null : Number(item.startSeconds);
      const endSeconds = item.endSeconds === '' || item.endSeconds === null || item.endSeconds === undefined ? null : Number(item.endSeconds);
      if (!Number.isInteger(songIndex) || songIndex < 0 || songIndex >= songs.length || !mediaIds.has(mediaId)) return sendError(response, 400, 'Playback clip references an invalid song or video.');
      if (startSeconds !== null && (!Number.isFinite(startSeconds) || startSeconds < 0)) return sendError(response, 400, `Invalid start point for track ${songIndex + 1}.`);
      if (endSeconds !== null && (!Number.isFinite(endSeconds) || endSeconds <= 0)) return sendError(response, 400, `Invalid end point for track ${songIndex + 1}.`);
      if (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds) return sendError(response, 400, `Playback end must follow the start for track ${songIndex + 1}.`);
      const key = `${songIndex}:${mediaId}`;
      if (clipKeys.has(key)) return sendError(response, 400, `Track ${songIndex + 1} contains the same playback source more than once.`);
      clipKeys.add(key);
      validatedClips.push({ mediaId, songIndex, startSeconds, endSeconds, requestedPriority: Number.isInteger(requestedPriority) && requestedPriority >= 0 ? requestedPriority : inputIndex, inputIndex });
    }
    const clipsBySong = new Map();
    validatedClips.forEach((clip) => { if (!clipsBySong.has(clip.songIndex)) clipsBySong.set(clip.songIndex, []); clipsBySong.get(clip.songIndex).push(clip); });
    if ([...clipsBySong.values()].some((clips) => clips.length > 8)) return sendError(response, 400, 'A track can have at most eight playback sources.');
    clipsBySong.forEach((clips) => clips.sort((a, b) => a.requestedPriority - b.requestedPriority || a.inputIndex - b.inputIndex).forEach((clip, priority) => { clip.priority = priority; }));
    const clipsByMedia = new Map();
    validatedClips.forEach((clip) => { if (!clipsByMedia.has(clip.mediaId)) clipsByMedia.set(clip.mediaId, []); clipsByMedia.get(clip.mediaId).push(clip); });
    for (const clips of clipsByMedia.values()) {
      clips.sort((a, b) => a.songIndex - b.songIndex);
      for (let index = 1; index < clips.length; index += 1) {
        const previous = clips[index - 1];
        const current = clips[index];
        if (previous.startSeconds !== null && current.startSeconds !== null && current.startSeconds < previous.startSeconds) return sendError(response, 400, `Track ${current.songIndex + 1} starts before an earlier clip from the same video.`);
        if (previous.endSeconds !== null && current.startSeconds !== null && current.startSeconds < previous.endSeconds) return sendError(response, 400, `Track ${current.songIndex + 1} overlaps the previous clip from the same video.`);
      }
    }
    const savePlan = database.transaction((clips) => {
      database.prepare('DELETE FROM media_playback_clips WHERE media_id IN (SELECT id FROM gig_media WHERE gig_id = ?)').run(gig.id);
      database.prepare("UPDATE gig_media SET playback_clips_initialized = 1 WHERE gig_id = ? AND mime_type LIKE 'video/%'").run(gig.id);
      const insert = database.prepare('INSERT INTO media_playback_clips (media_id, song_index, start_seconds, end_seconds, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const now = new Date().toISOString();
      clips.forEach((clip) => insert.run(clip.mediaId, clip.songIndex, clip.startSeconds, clip.endSeconds, clip.priority, now, now));
    });
    savePlan(validatedClips);
    return sendJson(response, 200, { media: mediaRows(gig.id) });
  }
  if (request.method === 'PATCH' && gigMatch) {
    const update = await readBody(request);
    const gigs = await readGigs();
    const gig = gigs.find((entry) => entry.id === gigMatch[1]);
    if (!gig) return sendError(response, 404, 'Gig not found');
    if ('artist' in update) gig.artist = String(update.artist || '').trim();
    if ('venue' in update) gig.venue = String(update.venue || '').trim();
    if ('city' in update) gig.city = String(update.city || '').trim();
    if ('date' in update) gig.date = String(update.date || '').trim();
    if ('attendees' in update) gig.attendees = normaliseGigAttendees(update.attendees, request.account);
    if ('songs' in update && Array.isArray(update.songs)) gig.songs = update.songs.map((song, index) => {
      const existing = gig.songs[index] || {};
      const merged = {
        ...existing,
        ...song,
        title: String(song.title || '').trim(),
        artist: String(song.artist ?? existing.artist ?? '').trim(),
        album: String(song.album ?? existing.album ?? '').trim() || null,
        encore: 'encore' in song ? Boolean(song.encore) : Boolean(existing.encore),
        position: index + 1,
        info: String(song.info ?? existing.info ?? '').trim(),
        startSeconds: song.startSeconds === '' || song.startSeconds === null || song.startSeconds === undefined ? null : Number(song.startSeconds),
        endSeconds: song.endSeconds === '' || song.endSeconds === null || song.endSeconds === undefined ? null : Number(song.endSeconds)
      };
      if (!Number.isFinite(merged.startSeconds)) merged.startSeconds = null;
      if (!Number.isFinite(merged.endSeconds)) merged.endSeconds = null;
      return merged;
    }).filter((song) => song.title);
    if ('favorite' in update) gig.favorite = update.favorite === true;
    if ('performanceRating' in update) gig.performanceRating = normaliseRating(update.performanceRating);
    if ('venueRating' in update) gig.venueRating = normaliseRating(update.venueRating);
    if ('performanceNotes' in update) gig.performanceNotes = String(update.performanceNotes || '').trim();
    if ('venueNotes' in update) gig.venueNotes = String(update.venueNotes || '').trim();
    database.prepare(`UPDATE gigs SET artist = ?, venue = ?, city = ?, date = ?, songs = ?, attendees = ?, favorite = ?,
      performance_rating = ?, venue_rating = ?, performance_notes = ?, venue_notes = ?, notes = ? WHERE id = ?`).run(
      gig.artist, gig.venue, gig.city, gig.date, JSON.stringify(gig.songs || []), JSON.stringify(gig.attendees || []), gig.favorite ? 1 : 0,
      gig.performanceRating ?? null, gig.venueRating ?? null, gig.performanceNotes || '', gig.venueNotes || '', gig.notes || '', gig.id
    );
    return sendJson(response, 200, gig);
  }

  if (request.method === 'DELETE' && gigMatch) {
    const gigs = await readGigs();
    const remaining = gigs.filter((gig) => gig.id !== gigMatch[1]);
    if (remaining.length === gigs.length) return sendError(response, 404, 'Gig not found');
    database.prepare('DELETE FROM gigs WHERE id = ?').run(gigMatch[1]);
    return sendJson(response, 200, { ok: true });
  }

  const exportMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/export\/(spotify|youtube|apple-music)$/);
  const youtubeSearchMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/youtube-search$/);
  if (request.method === 'POST' && youtubeSearchMatch) {
    const gig = findGig(await readGigs(), youtubeSearchMatch[1]);
    if (!configured('youtube')) return sendError(response, 503, 'YouTube is not configured yet.');
    return sendJson(response, 200, { matches: await searchYouTubeForGig(gig) });
  }
  if (request.method === 'POST' && exportMatch) {
    const provider = exportMatch[2];
    if (!configured(provider)) return sendError(response, 503, `${provider === 'apple-music' ? 'Apple Music' : provider === 'youtube' ? 'YouTube' : 'Spotify'} is not configured yet.`);
    const gig = findGig(await readGigs(), exportMatch[1]);
    const body = await readBody(request);
    const exportResult = provider === 'spotify' ? await exportSpotify(gig)
      : provider === 'youtube' ? await exportYouTube(gig)
      : await exportAppleMusic(gig, body.musicUserToken);
    return sendJson(response, 201, { provider, ...exportResult });
  }

  if (request.method === 'GET' && url.pathname === '/api/setlists/search') {
    if (!process.env.SETLIST_FM_API_KEY || process.env.SETLIST_FM_API_KEY === 'replace-me') {
      return sendError(response, 503, 'Add SETLIST_FM_API_KEY to .env before searching setlist.fm.');
    }
    const artistName = url.searchParams.get('artistName')?.trim();
    const cityName = url.searchParams.get('cityName')?.trim();
    const eventDate = url.searchParams.get('eventDate')?.trim();
    if (!artistName || !cityName) return sendError(response, 400, 'Artist and city are required.');

    const upstream = new URL(SETLIST_API);
    upstream.searchParams.set('artistName', artistName);
    upstream.searchParams.set('cityName', cityName);
    if (eventDate) upstream.searchParams.set('date', eventDate.split('-').reverse().join('-'));
    const headers = { Accept: 'application/json', 'x-api-key': process.env.SETLIST_FM_API_KEY };
    let setlistResponse = await fetch(upstream, { headers });
    recordApiUsage('setlist.fm', 'search/setlists', 1, setlistResponse.status);

    // Venue city labels are not always how concertgoers name the place
    // (e.g. Hollywood Bowl is recorded as Los Angeles). Retry by artist/date.
    if (setlistResponse.status === 404) {
      upstream.searchParams.delete('cityName');
      setlistResponse = await fetch(upstream, { headers });
      recordApiUsage('setlist.fm', 'search/setlists retry', 1, setlistResponse.status);
    }
    if (setlistResponse.status === 404) return sendJson(response, 200, { total: 0, setlists: [] });
    if (!setlistResponse.ok) {
      return sendError(response, setlistResponse.status, 'setlist.fm could not complete this search.');
    }
    const result = await setlistResponse.json();
    const setlists = (result.setlist || []).map((setlist) => ({
      id: setlist.id,
      artist: setlist.artist?.name || artistName,
      venue: setlist.venue?.name || '',
      city: setlist.venue?.city?.name || cityName,
      date: setlist.eventDate,
      url: setlist.url,
      songs: normaliseSongs(setlist)
    }));
    return sendJson(response, 200, { total: result.total || 0, setlists });
  }

  return sendError(response, 404, 'Not found');
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else if (url.pathname.startsWith('/auth/')) await handleAuth(request, response, url);
    else await serveStatic(request, response, url.pathname);
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error);
    sendError(response, error.status || 500, error.message || 'Something went wrong.');
  }
});

if (require.main === module) server.listen(PORT, HOST, () => console.log(`The Master List is running at http://${HOST}:${PORT}`));

module.exports = {
  server,
  database,
  paths: { data: DATA_DIR, database: DB_FILE, media: MEDIA_DIR },
  testables: { estimateFullShowTimings, parsePlaybackChapters, suggestPlaybackPlan, youtubeVideoId }
};

function loadEnvFile() {
  try {
    const contents = require('node:fs').readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
