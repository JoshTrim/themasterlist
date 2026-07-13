const http = require('node:http');
const Database = require('better-sqlite3');
const fs = require('node:fs/promises');
const legacyFs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
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
addColumnIfMissing('gig_media', 'caption', "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing('gig_media', 'is_cover', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('gig_media', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('gig_media', 'rotation', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('gig_media', 'category', "TEXT NOT NULL DEFAULT 'show'");
addColumnIfMissing('gig_media', 'external_url', 'TEXT');
addColumnIfMissing('gig_media', 'song_index', 'INTEGER');
addColumnIfMissing('gig_media', 'playback_filename', 'TEXT');
addColumnIfMissing('gig_media', 'playback_mime', 'TEXT');
addColumnIfMissing('gig_media', 'checksum', 'TEXT');
addColumnIfMissing('gig_media', 'recognition_status', "TEXT NOT NULL DEFAULT 'not_started'");
addColumnIfMissing('gig_media', 'recognition_result', 'TEXT');
addColumnIfMissing('gig_media', 'recognition_title', 'TEXT');
addColumnIfMissing('gig_media', 'recognition_artist', 'TEXT');
addColumnIfMissing('gig_media', 'recognition_album', 'TEXT');
addColumnIfMissing('gig_media', 'recognition_error', 'TEXT');
addColumnIfMissing('gig_media', 'recognition_override', 'INTEGER NOT NULL DEFAULT 0');
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
    media: database.prepare('SELECT id, filename, playback_filename AS playbackFilename, mime_type AS mimeType, caption, is_cover AS isCover, sort_order AS sortOrder, rotation, category, external_url AS externalUrl, song_index AS songIndex, size, created_at AS createdAt, recognition_status AS recognitionStatus, recognition_title AS recognitionTitle, recognition_artist AS recognitionArtist, recognition_album AS recognitionAlbum, recognition_error AS recognitionError, recognition_override AS recognitionOverride FROM gig_media WHERE gig_id = ? ORDER BY sort_order, created_at').all(row.id).map((media) => ({ ...media, isCover: Boolean(media.isCover), recognitionOverride: Boolean(media.recognitionOverride), rotation: Number(media.rotation || 0), songIndex: media.songIndex === null ? null : Number(media.songIndex), url: media.externalUrl || `/api/media/${media.id}` })),
    createdAt: row.created_at
  }));
}

async function writeGigs(gigs) {
  const insert = database.prepare(`
    INSERT INTO gigs (id, artist, venue, city, date, notes, performance_notes, venue_notes,
      performance_rating, venue_rating, favorite, setlist_fm_id, setlist_fm_url, songs, created_at)
    VALUES (@id, @artist, @venue, @city, @date, @notes, @performanceNotes, @venueNotes,
      @performanceRating, @venueRating, @favorite, @setlistFmId, @setlistFmUrl, @songs, @createdAt)
  `);
  const replace = database.transaction((records) => {
    database.exec('DELETE FROM gigs');
    for (const gig of records) insert.run({
      ...gig,
      notes: gig.notes || '',
      performanceNotes: gig.performanceNotes || gig.notes || '',
      venueNotes: gig.venueNotes || '',
      performanceRating: gig.performanceRating ?? null,
      venueRating: gig.venueRating ?? null,
      favorite: gig.favorite ? 1 : 0,
      setlistFmId: gig.setlistFmId || null,
      setlistFmUrl: gig.setlistFmUrl || null,
      songs: JSON.stringify(gig.songs || []),
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

function currentAccount(request) {
  const token = cookieValue(request, 'master_list_session');
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
  return { 'Set-Cookie': `master_list_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` };
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
  const cached = database.prepare('SELECT title, description, bio, image, source FROM artist_info WHERE lookup_name = ?').get(lookupName);
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
  const cached = database.prepare('SELECT title, description, bio, image, source FROM venue_info WHERE lookup_name = ?').get(lookupName);
  if (cached && venueWords.every((word) => cached.title.toLowerCase().includes(word)) && (cached.bio || cached.description || cached.image)) return { name: requestedName, city: requestedCity, ...cached };
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
  const id = randomUUID();
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO shared_shows
    (id, source_gig_id, artist, venue, city, date, setlist_fm_id, setlist_fm_url, songs, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, sourceGigId, gig.artist, gig.venue, gig.city, gig.date, gig.setlistFmId, gig.setlistFmUrl, JSON.stringify(gig.songs || []), now
  );
  database.prepare('INSERT INTO shared_attendees (show_id, profile_id, joined_at) VALUES (?, ?, ?)').run(id, profile.id, now);
  return id;
}

function findGigSync(id) {
  const row = database.prepare('SELECT * FROM gigs WHERE id = ?').get(id);
  if (!row) throw new Error('Gig not found.');
  return {
    id: row.id, artist: row.artist, venue: row.venue, city: row.city, date: row.date,
    setlistFmId: row.setlist_fm_id, setlistFmUrl: row.setlist_fm_url, songs: JSON.parse(row.songs || '[]')
  };
}

function readGigsSync() {
  return { find: (id) => findGigSync(id) };
}

function mediaExtension(mimeType, filename) {
  const known = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
  return known[mimeType] || path.extname(filename || '').slice(1).replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'bin';
}
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

function mediaRows(gigId) {
  return database.prepare('SELECT id, filename, mime_type AS mimeType, caption, is_cover AS isCover, sort_order AS sortOrder, rotation, category, external_url AS externalUrl, song_index AS songIndex, size, created_at AS createdAt, recognition_status AS recognitionStatus, recognition_title AS recognitionTitle, recognition_artist AS recognitionArtist, recognition_album AS recognitionAlbum, recognition_error AS recognitionError, recognition_override AS recognitionOverride FROM gig_media WHERE gig_id = ? ORDER BY sort_order, created_at').all(gigId).map((media) => ({ ...media, isCover: Boolean(media.isCover), recognitionOverride: Boolean(media.recognitionOverride), rotation: Number(media.rotation || 0), songIndex: media.songIndex === null ? null : Number(media.songIndex), url: media.externalUrl || `/api/media/${media.id}` }));
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

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 30_000_000) throw new Error('Request body is too large.');
  }
  return body ? JSON.parse(body) : {};
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
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(file);
  } catch (error) {
    if (error.code === 'ENOENT' && !path.extname(requested)) {
      const app = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
    const cacheKey = `${gig.id}:${index}:${gig.artist}:${gig.venue}:${gig.date || ''}`;
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
    const results = filtered.slice(0, 3).map((item) => ({ id: item.id.videoId, title: item.snippet?.title || '', channel: item.snippet?.channelTitle || '', thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '' }));
    database.prepare('INSERT INTO youtube_search_cache (cache_key, results, created_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET results = excluded.results, created_at = excluded.created_at').run(cacheKey, JSON.stringify(results), new Date().toISOString());
    matches.push({ index, title: song.title, results });
  }
  return matches;
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
    const token = cookieValue(request, 'master_list_session');
    if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': 'master_list_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/invites') {
    const account = requireAccount(request);
    if (!account.isAdmin) return sendError(response, 403, 'Only the owner can create invites.');
    const token = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    database.prepare('INSERT INTO invites (token_hash, created_by, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), account.id, expires);
    return sendJson(response, 201, { inviteUrl: `${appOrigin(request)}/?invite=${encodeURIComponent(token)}`, expiresAt: expires });
  }

  request.account = accountsConfigured() ? requireAccount(request) : null;

  const mediaFileMatch = url.pathname.match(/^\/api\/media\/([\w-]+)$/);
  if (request.method === 'GET' && mediaFileMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(mediaFileMatch[1]);
    if (!media) return sendError(response, 404, 'Media not found.');
    try {
      const filePath = path.join(MEDIA_DIR, media.playback_filename || media.filename);
      const stat = await fs.stat(filePath);
      const range = request.headers.range;
      if (range) {
        const match = range.match(/bytes=(\d*)-(\d*)/);
        const start = match?.[1] ? Number(match[1]) : 0;
        const end = match?.[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
        if (start >= stat.size || start > end) return sendError(response, 416, 'Requested range not satisfiable.');
        response.writeHead(206, { 'Content-Type': media.playback_mime || media.mime_type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
        return legacyFs.createReadStream(filePath, { start, end }).pipe(response);
      }
      response.writeHead(200, { 'Content-Type': media.playback_mime || media.mime_type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
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
    const imported = body.gigs.map((gig) => ({ ...gig, id: gig.id || randomUUID(), artist: String(gig.artist || '').trim(), venue: String(gig.venue || '').trim(), city: String(gig.city || '').trim(), date: String(gig.date || '').trim(), songs: Array.isArray(gig.songs) ? gig.songs : [], createdAt: gig.createdAt || new Date().toISOString() }));
    imported.forEach(validateGig);
    const importGigs = database.transaction((records) => { const statement = database.prepare(`INSERT INTO gigs (id, artist, venue, city, date, notes, performance_notes, venue_notes, performance_rating, venue_rating, favorite, setlist_fm_id, setlist_fm_url, songs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET artist=excluded.artist, venue=excluded.venue, city=excluded.city, date=excluded.date, notes=excluded.notes, performance_notes=excluded.performance_notes, venue_notes=excluded.venue_notes, performance_rating=excluded.performance_rating, venue_rating=excluded.venue_rating, favorite=excluded.favorite, setlist_fm_id=excluded.setlist_fm_id, setlist_fm_url=excluded.setlist_fm_url, songs=excluded.songs`); records.forEach((gig) => statement.run(gig.id, gig.artist, gig.venue, gig.city, gig.date, gig.notes || '', gig.performanceNotes || gig.notes || '', gig.venueNotes || '', gig.performanceRating ?? null, gig.venueRating ?? null, gig.favorite ? 1 : 0, gig.setlistFmId || null, gig.setlistFmUrl || null, JSON.stringify(gig.songs || []), gig.createdAt)); });
    importGigs(imported);
    return sendJson(response, 200, { imported: imported.length });
  }
  if (request.method === 'GET' && url.pathname === '/api/stats') {
    const gigs = database.prepare('SELECT artist, venue, city, date, favorite, songs FROM gigs').all();
    const songs = gigs.flatMap((gig) => JSON.parse(gig.songs || '[]'));
    const countBy = (values) => Object.entries(values.reduce((result, value) => { const key = String(value || 'Unknown'); result[key] = (result[key] || 0) + 1; return result; }, {})).sort((a, b) => b[1] - a[1]);
    return sendJson(response, 200, { shows: gigs.length, artists: new Set(gigs.map((gig) => gig.artist.toLowerCase())).size, venues: new Set(gigs.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size, cities: new Set(gigs.map((gig) => gig.city.toLowerCase())).size, songs: songs.length, favourites: gigs.filter((gig) => gig.favorite).length, topArtists: countBy(gigs.map((gig) => gig.artist)).slice(0, 5), topVenues: countBy(gigs.map((gig) => gig.venue)).slice(0, 5), years: countBy(gigs.map((gig) => gig.date?.slice(0, 4)).filter(Boolean)) });
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
  if (request.method === 'POST' && url.pathname === '/api/media/cleanup') {
    requireAccount(request);
    const referenced = new Set(database.prepare('SELECT filename, playback_filename FROM gig_media').all().flatMap((row) => [row.filename, row.playback_filename].filter(Boolean)));
    const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true }); let removed = 0;
    for (const entry of entries) { if (!entry.isFile() || referenced.has(entry.name)) continue; await fs.rm(path.join(MEDIA_DIR, entry.name), { force: true }); removed += 1; }
    return sendJson(response, 200, { removed });
  }

  if (request.method === 'GET' && url.pathname === '/api/artists') {
    return sendJson(response, 200, await fetchArtistInfo(url.searchParams.get('name')));
  }
  if (request.method === 'GET' && url.pathname === '/api/venues') {
    return sendJson(response, 200, await fetchVenueInfo(url.searchParams.get('name'), url.searchParams.get('city')));
  }
  if (request.method === 'PATCH' && url.pathname === '/api/venues') {
    const name = String(url.searchParams.get('name') || '').trim();
    const city = String(url.searchParams.get('city') || '').trim();
    if (!name) return sendError(response, 400, 'A venue name is required.');
    const body = await readBody(request);
    const lookupName = `${name}|${city}`.toLowerCase();
    const existing = database.prepare('SELECT title, description, bio, image, source FROM venue_info WHERE lookup_name = ?').get(lookupName);
    const info = {
      title: String(body.title ?? existing?.title ?? name).trim(),
      description: String(body.description ?? existing?.description ?? '').trim(),
      bio: String(body.bio ?? existing?.bio ?? '').trim(),
      image: String(body.image ?? existing?.image ?? '').trim() || null,
      source: String(body.source ?? existing?.source ?? '').trim() || null
    };
    database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.source, new Date().toISOString());
    return sendJson(response, 200, { name, city, ...info });
  }

  if (request.method === 'GET' && url.pathname === '/api/gigs') {
    const gigs = await readGigs();
    return sendJson(response, 200, gigs.sort((a, b) => b.date.localeCompare(a.date)));
  }

  const albumStatsMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/album-stats$/);
  if (albumStatsMatch && request.method === 'GET') {
    const gig = database.prepare('SELECT artist, songs FROM gigs WHERE id = ?').get(albumStatsMatch[1]);
    if (!gig) return sendError(response, 404, 'Gig not found.');
    const songs = JSON.parse(gig.songs || '[]');
    const enriched = await Promise.all(songs.map(async (song) => ({ ...song, album: await resolveAlbum(song.artist || gig.artist, song.title) || song.album || null })));
    database.prepare('UPDATE gigs SET songs = ? WHERE id = ?').run(JSON.stringify(enriched), albumStatsMatch[1]);
    const counts = {};
    enriched.forEach((song) => { const album = song.album || 'Unknown album'; counts[album] = (counts[album] || 0) + 1; });
    return sendJson(response, 200, { songs: enriched, albums: counts });
  }

  if (request.method === 'POST' && url.pathname === '/api/gigs') {
    const gig = await readBody(request);
    validateGig(gig);
    const gigs = await readGigs();
    const record = {
      id: randomUUID(),
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
      createdAt: new Date().toISOString()
    };
    gigs.push(record);
    await writeGigs(gigs);
    return sendJson(response, 201, record);
  }

  const gigMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)$/);
  const mediaCollectionMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/media$/);
  const chunkMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/media\/chunk$/);
  if (chunkMatch && request.method === 'POST') {
    console.log(`[media] chunk upload request for gig ${chunkMatch[1]} offset ${request.headers['x-upload-offset'] || 0}`);
    const gigId = chunkMatch[1]; const uploadId = String(request.headers['x-upload-id'] || ''); const filename = decodeURIComponent(String(request.headers['x-media-filename'] || 'upload')); const total = Number(request.headers['x-upload-total'] || 0); const offset = Number(request.headers['x-upload-offset'] || 0);
    if (!uploadId || !total) return sendError(response, 400, 'Invalid upload session.');
    for (const [sessionId, entry] of uploadSessions) if (entry.expiresAt && entry.expiresAt < Date.now()) uploadSessions.delete(sessionId);
    let session = uploadSessions.get(uploadId);
    if (session?.complete) return sendJson(response, 200, { complete: true, offset: session.total, media: mediaRows(gigId).find((entry) => entry.id === session.mediaId) });
    if (!session) { const stored = `${randomUUID()}.${mediaExtension(String(request.headers['content-type'] || ''), filename)}`; session = { gigId, filename, total, offset: 0, stored, path: path.join(MEDIA_DIR, `${stored}.uploading`) }; await fs.mkdir(MEDIA_DIR, { recursive: true }); uploadSessions.set(uploadId, session); }
    if (offset !== session.offset) return sendJson(response, 409, { offset: session.offset });
    const output = legacyFs.createWriteStream(session.path, { flags: offset ? 'a' : 'w' }); for await (const chunk of request) { session.offset += chunk.length; if (!output.write(chunk)) await new Promise((resolve) => output.once('drain', resolve)); } await new Promise((resolve, reject) => output.end((error) => error ? reject(error) : resolve()));
    if (session.offset >= session.total) {
      await fs.rename(session.path, path.join(MEDIA_DIR, session.stored)); const digest = await hashFile(path.join(MEDIA_DIR, session.stored));
      const duplicate = database.prepare('SELECT id FROM gig_media WHERE gig_id = ? AND checksum = ? AND size = ?').get(gigId, digest, session.total);
      if (duplicate) { await fs.rm(path.join(MEDIA_DIR, session.stored), { force: true }); uploadSessions.set(uploadId, { ...session, complete: true, mediaId: duplicate.id, expiresAt: Date.now() + 10 * 60 * 1000 }); return sendJson(response, 200, { complete: true, duplicate: true, offset: session.total, media: mediaRows(gigId).find((entry) => entry.id === duplicate.id) }); }
      const id = randomUUID(); const mimeType = String(request.headers['content-type'] || 'video/mp4'); const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ?').get(gigId).next;
      database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, is_cover, sort_order, rotation, checksum, size, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)').run(id, gigId, session.stored, mimeType, filename, sortOrder, digest, session.total, new Date().toISOString()); uploadSessions.set(uploadId, { ...session, complete: true, mediaId: id, expiresAt: Date.now() + 10 * 60 * 1000 });
      if (process.env.AUDD_API_TOKEN && mimeType.startsWith('video/')) database.prepare("UPDATE gig_media SET recognition_status = 'queued' WHERE id = ?").run(id);
      if (mimeType.startsWith('video/')) { const gigInfo = database.prepare('SELECT artist, venue, date FROM gigs WHERE id = ?').get(gigId); const sourcePath = path.join(MEDIA_DIR, session.stored); const proxyName = `${safeMediaName(gigInfo?.artist)}-${safeMediaName(gigInfo?.venue)}-${safeMediaName(gigInfo?.date)}-${id.slice(0, 8)}-playback.mp4`; const encodeJobId = randomUUID(); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'running', 1); setImmediate(async () => { const encoded = await createPlaybackProxy(sourcePath, path.join(MEDIA_DIR, proxyName)); if (encoded) { database.prepare('UPDATE gig_media SET playback_filename = ?, playback_mime = ? WHERE id = ?').run(proxyName, 'video/mp4', id); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'complete', 100); } else saveBackgroundJob(encodeJobId, 'Encode video', filename, 'error', 0, 'Playback encode failed.'); }); setImmediate(() => recognizeVideoTrack(gigId, id, sourcePath, filename)); }
      return sendJson(response, 201, { complete: true, media: mediaRows(gigId).find((entry) => entry.id === id) });
    }
    return sendJson(response, 200, { complete: false, offset: session.offset });
  }
  if (mediaCollectionMatch && request.method === 'GET') {
    if (!database.prepare('SELECT id FROM gigs WHERE id = ?').get(mediaCollectionMatch[1])) return sendError(response, 404, 'Gig not found.');
    return sendJson(response, 200, mediaRows(mediaCollectionMatch[1]));
  }
  if (mediaCollectionMatch && request.method === 'POST') {
    const gigId = mediaCollectionMatch[1];
    console.log(`[media] upload request for gig ${gigId}: ${request.headers['content-type'] || 'unknown'} (${request.headers['content-length'] || 'unknown'} bytes)`);
    if (!database.prepare('SELECT id FROM gigs WHERE id = ?').get(gigId)) return sendError(response, 404, 'Gig not found.');
    const contentType = String(request.headers['content-type'] || '');
    if (!contentType.includes('application/json')) {
      const mimeType = contentType.split(';')[0].trim();
      const filename = decodeURIComponent(String(request.headers['x-media-filename'] || 'upload')).slice(0, 180);
      const expectedSize = Number(request.headers['content-length'] || 0);
      if (!/^image\/(jpeg|png|gif|webp)$|^video\/(mp4|webm|quicktime)$/.test(mimeType)) return sendError(response, 415, 'Upload an image or video file.');
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
      const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ?').get(gigId).next;
      const digest = checksum.digest('hex');
      const duplicate = database.prepare('SELECT id FROM gig_media WHERE gig_id = ? AND checksum = ? AND size = ?').get(gigId, digest, size);
      if (duplicate) { await fs.rm(path.join(MEDIA_DIR, storedFilename), { force: true }); return sendJson(response, 200, { duplicate: true, media: mediaRows(gigId).find((entry) => entry.id === duplicate.id) }); }
      database.prepare('INSERT INTO gig_media (id, gig_id, filename, playback_filename, mime_type, caption, is_cover, sort_order, rotation, checksum, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, gigId, storedFilename, playbackFilename, mimeType, decodeURIComponent(String(request.headers['x-media-caption'] || filename)).trim(), 0, sortOrder, 0, digest, size, new Date().toISOString());
      if (process.env.AUDD_API_TOKEN && mimeType.startsWith('video/')) database.prepare("UPDATE gig_media SET recognition_status = 'queued' WHERE id = ?").run(id);
      console.log(`[media] upload complete: ${id}`);
      if (mimeType.startsWith('video/')) { const gigInfo = database.prepare('SELECT artist, venue, date FROM gigs WHERE id = ?').get(gigId); const sourcePath = path.join(MEDIA_DIR, storedFilename); const proxyName = `${safeMediaName(gigInfo?.artist)}-${safeMediaName(gigInfo?.venue)}-${safeMediaName(gigInfo?.date)}-${id.slice(0, 8)}-playback.mp4`; const encodeJobId = randomUUID(); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'running', 1); setImmediate(async () => { const encoded = await createPlaybackProxy(sourcePath, path.join(MEDIA_DIR, proxyName)); if (encoded) { database.prepare('UPDATE gig_media SET playback_filename = ?, playback_mime = ? WHERE id = ?').run(proxyName, 'video/mp4', id); saveBackgroundJob(encodeJobId, 'Encode video', filename, 'complete', 100); } else saveBackgroundJob(encodeJobId, 'Encode video', filename, 'error', 0, 'Playback encode failed.'); }); setImmediate(() => recognizeVideoTrack(gigId, id, sourcePath, filename)); }
      return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
    }
    const body = await readBody(request);
    if (body.externalUrl) {
      let parsed;
      try { parsed = new URL(String(body.externalUrl)); } catch { return sendError(response, 400, 'Enter a valid YouTube URL.'); }
      if (!['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(parsed.hostname.toLowerCase())) return sendError(response, 400, 'Only YouTube URLs can be added as external media.');
      const id = randomUUID();
      const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ?').get(gigId).next;
      database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, is_cover, sort_order, rotation, category, external_url, song_index, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, gigId, 'external', 'video/youtube', String(body.caption || 'YouTube video').trim(), 0, sortOrder, 0, 'other', parsed.toString(), Number.isInteger(body.songIndex) ? body.songIndex : null, 0, new Date().toISOString());
      return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
    }
    const mimeType = String(body.mimeType || '');
    const filename = String(body.filename || 'upload').slice(0, 180);
    if (!/^image\/(jpeg|png|gif|webp)$|^video\/(mp4|webm|quicktime)$/.test(mimeType)) return sendError(response, 415, 'Upload an image or video file.');
    const encoded = String(body.data || '').replace(/^data:[^;]+;base64,/, '');
    const file = Buffer.from(encoded, 'base64');
    if (!file.length || file.length > MAX_MEDIA_SIZE) return sendError(response, 413, 'Each upload must be between 1 byte and 50 GB.');
    await fs.mkdir(MEDIA_DIR, { recursive: true });
    const id = randomUUID();
    const storedFilename = `${id}.${mediaExtension(mimeType, filename)}`;
    await fs.writeFile(path.join(MEDIA_DIR, storedFilename), file);
    const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ?').get(gigId).next;
    database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, caption, is_cover, sort_order, rotation, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, gigId, storedFilename, mimeType, String(body.caption || filename).trim(), body.isCover ? 1 : 0, sortOrder, 0, file.length, new Date().toISOString());
    if (process.env.AUDD_API_TOKEN && mimeType.startsWith('video/')) database.prepare("UPDATE gig_media SET recognition_status = 'queued' WHERE id = ?").run(id);
    if (mimeType.startsWith('video/')) setImmediate(() => recognizeVideoTrack(gigId, id, path.join(MEDIA_DIR, storedFilename), filename));
    return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
  }
  const mediaMatch = url.pathname.match(/^\/api\/media\/([\w-]+)$/);
  if (request.method === 'PATCH' && mediaMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(mediaMatch[1]);
    if (!media) return sendError(response, 404, 'Media not found.');
    const body = await readBody(request);
    if ('isCover' in body && body.isCover) database.prepare('UPDATE gig_media SET is_cover = 0 WHERE gig_id = ?').run(media.gig_id);
    database.prepare('UPDATE gig_media SET caption = COALESCE(?, caption), is_cover = COALESCE(?, is_cover), sort_order = COALESCE(?, sort_order), rotation = COALESCE(?, rotation), song_index = CASE WHEN ? THEN ? ELSE song_index END, recognition_override = COALESCE(?, recognition_override) WHERE id = ?').run('caption' in body ? String(body.caption || '').trim() : null, 'isCover' in body ? (body.isCover ? 1 : 0) : null, 'sortOrder' in body ? Number(body.sortOrder) : null, 'rotation' in body ? ((Number(body.rotation) % 360) + 360) % 360 : null, 'songIndex' in body ? 1 : 0, 'songIndex' in body && body.songIndex !== null && body.songIndex !== '' ? Number(body.songIndex) : null, 'recognitionOverride' in body ? (body.recognitionOverride ? 1 : 0) : null, mediaMatch[1]);
    return sendJson(response, 200, mediaRows(media.gig_id).find((entry) => entry.id === mediaMatch[1]));
  }
  if (request.method === 'DELETE' && mediaMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(mediaMatch[1]);
    if (!media) return sendError(response, 404, 'Media not found.');
    await fs.rm(path.join(MEDIA_DIR, media.filename), { force: true });
    database.prepare('DELETE FROM gig_media WHERE id = ?').run(mediaMatch[1]);
    return sendJson(response, 200, { ok: true });
  }
  const trimMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/trim$/);
  if (request.method === 'POST' && trimMatch) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(trimMatch[1]);
    if (!media || !media.mime_type.startsWith('video/')) return sendError(response, 400, 'Only uploaded videos can be trimmed.');
    const start = Number(url.searchParams.get('start')); const end = Number(url.searchParams.get('end'));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return sendError(response, 400, 'Trim times are invalid.');
    const inputPath = path.join(MEDIA_DIR, media.filename); const outputPath = `${inputPath}.trimming.mp4`; const jobId = randomUUID(); saveBackgroundJob(jobId, 'Trim video', media.filename, 'running', 5);
    setImmediate(async () => { try { await trimVideoFile(inputPath, outputPath, start, end - start, (timeMs) => saveBackgroundJob(jobId, 'Trim video', media.filename, 'running', Math.min(99, Math.round((timeMs / 1000000 / (end - start)) * 100)))); await fs.rename(outputPath, inputPath); if (media.playback_filename) await fs.rm(path.join(MEDIA_DIR, media.playback_filename), { force: true }); database.prepare('UPDATE gig_media SET playback_filename = NULL, playback_mime = NULL, size = ?, checksum = ? WHERE id = ?').run((await fs.stat(inputPath)).size, await hashFile(inputPath), media.id); saveBackgroundJob(jobId, 'Trim video', media.filename, 'complete', 100); } catch (error) { await fs.rm(outputPath, { force: true }); saveBackgroundJob(jobId, 'Trim video', media.filename, 'error', 0, error.message); } });
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
  if (request.method === 'PATCH' && gigMatch) {
    const update = await readBody(request);
    const gigs = await readGigs();
    const gig = gigs.find((entry) => entry.id === gigMatch[1]);
    if (!gig) return sendError(response, 404, 'Gig not found');
    if ('artist' in update) gig.artist = String(update.artist || '').trim();
    if ('venue' in update) gig.venue = String(update.venue || '').trim();
    if ('city' in update) gig.city = String(update.city || '').trim();
    if ('date' in update) gig.date = String(update.date || '').trim();
    if ('songs' in update && Array.isArray(update.songs)) gig.songs = update.songs.map((song, index) => ({ title: String(song.title || '').trim(), artist: String(song.artist || '').trim(), encore: Boolean(song.encore), position: index + 1, info: String(song.info || '').trim() })).filter((song) => song.title);
    if ('favorite' in update) gig.favorite = update.favorite === true;
    if ('performanceRating' in update) gig.performanceRating = normaliseRating(update.performanceRating);
    if ('venueRating' in update) gig.venueRating = normaliseRating(update.venueRating);
    if ('performanceNotes' in update) gig.performanceNotes = String(update.performanceNotes || '').trim();
    if ('venueNotes' in update) gig.venueNotes = String(update.venueNotes || '').trim();
    await writeGigs(gigs);
    return sendJson(response, 200, gig);
  }

  if (request.method === 'DELETE' && gigMatch) {
    const gigs = await readGigs();
    const remaining = gigs.filter((gig) => gig.id !== gigMatch[1]);
    if (remaining.length === gigs.length) return sendError(response, 404, 'Gig not found');
    await writeGigs(remaining);
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
    console.error(error);
    sendError(response, error.status || 500, error.message || 'Something went wrong.');
  }
});

server.listen(PORT, HOST, () => console.log(`The Master List is running at http://${HOST}:${PORT}`));

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
