const http = require('node:http');
const Database = require('better-sqlite3');
const fs = require('node:fs/promises');
const legacyFs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes, createHash, generateKeyPairSync, sign: signPayload, verify: verifyPayload } = require('node:crypto');
const playback = require('./lib/playback');
const { recognitionKey, youtubeVideoId, isoDurationSeconds, parsePlaybackChapters, estimateFullShowTimings, suggestPlaybackPlan } = playback;
const { normaliseGenres, normaliseImagePosition, normaliseSongs, validateGig, normaliseRating } = require('./lib/validation');
const { createAuth } = require('./lib/auth');
const { sendJson, sendError, redirect, readBody } = require('./lib/http');
const { syncPayloadHash, mergeText, mergeSongs, averageRating } = require('./lib/sync-merge');
const { createBackupService } = require('./lib/backups');
const { mediaExtension, mediaCategory, safeMediaName, hashFile } = require('./lib/media-utils');
const { createAuthRoutes } = require('./lib/routes/auth');
const { createConflictStore } = require('./lib/conflicts');
const { migrateSchema } = require('./lib/schema');
const { loadEnvFile } = require('./lib/env');
const { createGigRepository } = require('./lib/gigs');
const { createBackgroundJobs } = require('./lib/background-jobs');
const { createMediaRepository } = require('./lib/media-repository');
const { createMediaProcessor } = require('./lib/media-processing');
const { createMediaUploadRoutes } = require('./lib/routes/media-uploads');
const { createMediaMutationRoutes } = require('./lib/routes/media-mutations');
const { createMediaEncoding } = require('./lib/media-encoding');
const { createMediaRecognition } = require('./lib/media-recognition');
const { recoverMediaWork } = require('./lib/media-recovery');

if (process.env.MASTER_LIST_SKIP_ENV !== 'true') loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.MASTER_LIST_DATA_DIR ? path.resolve(process.env.MASTER_LIST_DATA_DIR) : path.join(ROOT, 'data');
const GIGS_FILE = path.join(DATA_DIR, 'gigs.json');
const DB_FILE = path.join(DATA_DIR, 'master-list.sqlite');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const PENDING_RESTORE_FILE = path.join(DATA_DIR, 'restore-pending.sqlite');
const CONNECTIONS_FILE = path.join(DATA_DIR, 'connections.json');
const GEOCODES_FILE = path.join(DATA_DIR, 'geocodes.json');
const SETLIST_API = 'https://api.setlist.fm/rest/1.0/search/setlists';
const pendingOAuth = new Map();
const MAX_MEDIA_SIZE = Number(process.env.MAX_MEDIA_SIZE_GB || 50) * 1024 * 1024 * 1024;

legacyFs.mkdirSync(DATA_DIR, { recursive: true });
legacyFs.mkdirSync(MEDIA_DIR, { recursive: true });
legacyFs.mkdirSync(BACKUP_DIR, { recursive: true });
if (legacyFs.existsSync(PENDING_RESTORE_FILE)) {
  legacyFs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (legacyFs.existsSync(DB_FILE)) legacyFs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `pre-restore-${timestamp}.sqlite`));
  for (const suffix of ['-wal', '-shm']) {
    try { legacyFs.rmSync(`${DB_FILE}${suffix}`, { force: true }); } catch { /* best-effort stale SQLite sidecar cleanup */ }
  }
  legacyFs.renameSync(PENDING_RESTORE_FILE, DB_FILE);
  console.log('[maintenance] applied staged database restore');
}
const database = new Database(DB_FILE);
database.pragma('journal_mode = WAL');
migrateSchema(database);

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

function appSetting(key, fallback = null) {
  const row = database.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setAppSetting(key, value) {
  database.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(key, String(value), new Date().toISOString());
}

function ensureBackupSettings() {
  const defaults = {
    backup_enabled: String(process.env.BACKUP_ENABLED || 'true').toLowerCase() === 'false' ? 'false' : 'true',
    backup_interval_hours: String(Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS || 24))),
    backup_retention_count: String(Math.max(1, Number(process.env.BACKUP_RETENTION_COUNT || 14))),
    backup_last_status: 'never'
  };
  const insert = database.prepare('INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)');
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(defaults)) insert.run(key, value, now);
}

ensureBackupSettings();

const authService = createAuth({ database });
const { currentAccount, accountsConfigured, requireAccount } = authService;
const handleAuthApi = createAuthRoutes({ database, auth: authService, appOrigin });
const backupService = createBackupService({ database, fs, path, backupDir: BACKUP_DIR, getSetting: appSetting, setSetting: setAppSetting });
const { settings: backupSettings, prune: pruneScheduledBackups, create: createScheduledBackup, runCheck: runScheduledBackupCheck } = backupService;
const backgroundJobs = createBackgroundJobs({ database });
const mediaRepository = createMediaRepository({ database, mediaDir: MEDIA_DIR, path, existsSync: legacyFs.existsSync, statSync: legacyFs.statSync });
const mediaRows = mediaRepository.list;
const gigRepository = createGigRepository({ database, mediaRows });
const { readAll: readGigs, writeAll: writeGigs, find: findGigSync } = gigRepository;
const mediaProcessor = createMediaProcessor({ spawn, fs, path, root: ROOT, existsSync: legacyFs.existsSync });
const mediaEncoding = createMediaEncoding({ database, fs, path, mediaDir: MEDIA_DIR, jobs: backgroundJobs, processor: mediaProcessor, safeMediaName, randomUUID });
const mediaRecognition = createMediaRecognition({
  database, fs, token: () => process.env.AUDD_API_TOKEN, jobs: backgroundJobs,
  processor: mediaProcessor, providerResponse, findGig: findGigSync, recognitionKey, randomUUID
});
const handleMediaUpload = createMediaUploadRoutes({
  database, fs, legacyFs, path, mediaDir: MEDIA_DIR, maxMediaSize: MAX_MEDIA_SIZE,
  randomUUID, createHash, mediaExtension, mediaCategory, hashFile, mediaRows,
  readBody, sendJson, sendError,
  startPlaybackEncode: mediaEncoding.start, recognizeVideoTrack: mediaRecognition.recognize,
  auddConfigured: () => Boolean(process.env.AUDD_API_TOKEN)
});
const handleMediaMutation = createMediaMutationRoutes({
  database, fs, existsSync: legacyFs.existsSync, path, mediaDir: MEDIA_DIR, randomUUID,
  requireAccount, readBody, sendJson, sendError, mediaRows, hashFile,
  encoding: mediaEncoding, recognition: mediaRecognition, processor: mediaProcessor, jobs: backgroundJobs
});
const conflictStore = createConflictStore({ database, payloadFromGig: conflictPayloadFromGig, payloadFromSnapshot: conflictPayloadFromSnapshot, findGig: findGigSync });
const { detect: detectSyncConflict, list: peerConflictRows } = conflictStore;

const mediaRecoveryPromise = recoverMediaWork({ database, fs, path, mediaDir: MEDIA_DIR }).then((result) => {
  if (Object.values(result).some(Boolean)) console.log('[media] recovered interrupted work:', result);
}).catch((error) => console.error('[media] recovery failed:', error.message));

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

function cachedArtistGenres(name) {
  const row = database.prepare('SELECT genres, source, updated_at AS updatedAt FROM artist_genres WHERE lookup_name = ?').get(String(name || '').trim().toLowerCase());
  if (!row) return null;
  try { return { genres: normaliseGenres(JSON.parse(row.genres || '[]')), source: row.source, updatedAt: row.updatedAt }; } catch { return { genres: [], source: row.source, updatedAt: row.updatedAt }; }
}

function saveArtistGenres(name, genres, source = 'manual') {
  const artistName = String(name || '').trim();
  const values = normaliseGenres(genres);
  database.prepare('INSERT OR REPLACE INTO artist_genres (lookup_name, artist_name, genres, source, updated_at) VALUES (?, ?, ?, ?, ?)').run(artistName.toLowerCase(), artistName, JSON.stringify(values), source, new Date().toISOString());
  return values;
}

async function fetchArtistGenres(name) {
  const artistName = String(name || '').trim();
  if (!artistName) return [];
  const cached = cachedArtistGenres(artistName);
  if (cached) return cached.genres;
  let genres = [];
  try {
    const endpoint = new URL('https://itunes.apple.com/search');
    endpoint.searchParams.set('term', artistName); endpoint.searchParams.set('entity', 'musicArtist'); endpoint.searchParams.set('limit', '8');
    const response = await fetch(endpoint);
    const results = response.ok ? (await response.json()).results || [] : [];
    const clean = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const wanted = clean(artistName);
    const match = results.find((entry) => clean(entry.artistName) === wanted) || results.find((entry) => clean(entry.artistName).includes(wanted) || wanted.includes(clean(entry.artistName)));
    genres = normaliseGenres(match?.primaryGenreName || '');
  } catch { /* Keep an empty cached result so Overview remains fast offline. */ }
  return saveArtistGenres(artistName, genres, 'itunes');
}

async function archiveGenreStats() {
  const gigs = database.prepare('SELECT artist FROM gigs').all();
  const artistCounts = new Map();
  for (const gig of gigs) artistCounts.set(gig.artist, (artistCounts.get(gig.artist) || 0) + 1);
  const pending = [...artistCounts];
  const entries = [];
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (pending.length) {
      const [artist, shows] = pending.shift();
      entries.push({ artist, shows, genres: await fetchArtistGenres(artist) });
    }
  }));
  const totals = new Map();
  for (const entry of entries) {
    const genres = entry.genres.length ? entry.genres : ['Unknown'];
    const weight = entry.shows / genres.length;
    for (const genre of genres) totals.set(genre, (totals.get(genre) || 0) + weight);
  }
  const totalShows = gigs.length || 1;
  return [...totals].map(([genre, shows]) => ({ genre, shows: Math.round(shows * 10) / 10, percentage: Math.round((shows / totalShows) * 1000) / 10 })).sort((a, b) => b.percentage - a.percentage || a.genre.localeCompare(b.genre));
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
  const cached = database.prepare('SELECT title, description, bio, image, image_position AS imagePosition, is_manual AS isManual, is_closed AS isClosed, source FROM venue_info WHERE lookup_name = ?').get(lookupName);
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

function conflictPayloadFromGig(gig) {
  return {
    notes: String(gig.performanceNotes || gig.notes || ''),
    venueNotes: String(gig.venueNotes || ''),
    performanceRating: normaliseRating(gig.performanceRating),
    venueRating: normaliseRating(gig.venueRating),
    favorite: Boolean(gig.favorite),
    songs: Array.isArray(gig.songs) ? gig.songs : [],
    media: syncMediaManifest(gig)
  };
}

function conflictPayloadFromSnapshot(snapshot) {
  const contribution = snapshot.contribution || {};
  return {
    notes: String(contribution.performanceNotes || ''),
    venueNotes: String(contribution.venueNotes || ''),
    performanceRating: normaliseRating(contribution.performanceRating),
    venueRating: normaliseRating(contribution.venueRating),
    favorite: Boolean(contribution.favorite),
    songs: Array.isArray(snapshot.show?.songs) ? snapshot.show.songs : [],
    media: Array.isArray(contribution.media) ? contribution.media : []
  };
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
  const conflictState = detectSyncConflict(snapshot, originPeer, local ? findGigSync(local.id) : null);
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
    {
      const notificationId = createHash('sha256').update(`peer-show:${originPeer.peer_id}:${snapshot.eventId}`).digest('hex');
      const notificationType = conflictState.conflict ? 'peer-sync-conflict' : (isNewPeerContribution ? 'peer-show-shared' : 'peer-show-updated');
      database.prepare(`INSERT OR IGNORE INTO notifications
        (id, type, peer_id, shared_gig_id, title, body, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        notificationId, notificationType, originPeer.peer_id, snapshot.sharedGigId, conflictState.conflict ? `Review edits from ${originPeer.name}` : (isNewPeerContribution ? `${originPeer.name} shared a show` : `${originPeer.name} updated a shared show`),
        `${show.artist} at ${show.venue}${show.city ? `, ${show.city}` : ''}`, now
      );
    }
  })();
  return true;
}

function applyRemoteMediaAssignments(localGigId, localMedia, remoteMedia, mode) {
  const remoteByKey = new Map();
  for (const item of remoteMedia || []) {
    for (const key of [item.checksum && `hash:${item.checksum}`, item.externalUrl && `url:${item.externalUrl}`, item.id && `id:${item.id}`].filter(Boolean)) remoteByKey.set(key, item);
  }
  for (const local of localMedia || []) {
    const remote = [local.checksum && `hash:${local.checksum}`, local.externalUrl && `url:${local.externalUrl}`, local.id && `id:${local.id}`].filter(Boolean).map((key) => remoteByKey.get(key)).find(Boolean);
    if (!remote || (mode === 'merge' && local.songIndex !== null && local.songIndex !== undefined)) continue;
    const remoteSongIndex = remote.songIndex !== null && remote.songIndex !== undefined && Number.isInteger(Number(remote.songIndex)) && Number(remote.songIndex) >= 0 ? Number(remote.songIndex) : null;
    const remoteStart = remote.playbackStart !== null && remote.playbackStart !== undefined && Number.isFinite(Number(remote.playbackStart)) ? Number(remote.playbackStart) : null;
    const remoteEnd = remote.playbackEnd !== null && remote.playbackEnd !== undefined && Number.isFinite(Number(remote.playbackEnd)) ? Number(remote.playbackEnd) : null;
    database.prepare('UPDATE gig_media SET song_index = ?, playback_preferred = ?, playback_start = ?, playback_end = ? WHERE id = ? AND gig_id = ?').run(
      remoteSongIndex, remote.playbackPreferred ? 1 : 0, remoteStart, remoteEnd, local.id, localGigId
    );
    if (Array.isArray(remote.playbackClips) && (mode === 'remote' || !local.playbackClips?.length)) {
      database.prepare('DELETE FROM media_playback_clips WHERE media_id = ?').run(local.id);
      const insert = database.prepare(`INSERT INTO media_playback_clips
        (media_id, song_index, start_seconds, end_seconds, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      const now = new Date().toISOString();
      for (const clip of remote.playbackClips) {
        const songIndex = Number(clip.songIndex);
        if (!Number.isInteger(songIndex) || songIndex < 0) continue;
        const start = clip.startSeconds !== null && clip.startSeconds !== undefined && Number.isFinite(Number(clip.startSeconds)) ? Number(clip.startSeconds) : null;
        const end = clip.endSeconds !== null && clip.endSeconds !== undefined && Number.isFinite(Number(clip.endSeconds)) ? Number(clip.endSeconds) : null;
        insert.run(local.id, songIndex, start, end, Math.max(0, Number(clip.priority) || 0), now, now);
      }
    }
  }
}

function resolvePeerConflict(id, choices) {
  const row = database.prepare("SELECT * FROM peer_sync_conflicts WHERE id = ? AND status = 'open'").get(id);
  if (!row) throw new Error('Sync conflict not found or already resolved.');
  const gig = findGigSync(row.local_gig_id);
  const local = conflictPayloadFromGig(gig);
  const remote = JSON.parse(row.remote_payload);
  const valid = (value, allowed, fallback = 'local') => allowed.includes(value) ? value : fallback;
  const notesChoice = valid(choices.notes, ['local', 'remote', 'merge']);
  const ratingsChoice = valid(choices.ratings, ['local', 'remote', 'merge']);
  const setlistChoice = valid(choices.setlist, ['local', 'remote', 'merge']);
  const mediaChoice = valid(choices.media, ['local', 'remote', 'merge']);
  const chooseText = (field) => notesChoice === 'remote' ? remote[field] : notesChoice === 'merge' ? mergeText(local[field], remote[field]) : local[field];
  const performanceRating = ratingsChoice === 'remote' ? remote.performanceRating : ratingsChoice === 'merge' ? averageRating(local.performanceRating, remote.performanceRating) : local.performanceRating;
  const venueRating = ratingsChoice === 'remote' ? remote.venueRating : ratingsChoice === 'merge' ? averageRating(local.venueRating, remote.venueRating) : local.venueRating;
  const favorite = ratingsChoice === 'remote' ? remote.favorite : ratingsChoice === 'merge' ? Boolean(local.favorite || remote.favorite) : local.favorite;
  const songs = setlistChoice === 'remote' ? remote.songs : setlistChoice === 'merge' ? mergeSongs(local.songs, remote.songs) : local.songs;
  const resolution = { notes: notesChoice, ratings: ratingsChoice, setlist: setlistChoice, media: mediaChoice };
  database.transaction(() => {
    database.prepare(`UPDATE gigs SET notes = ?, performance_notes = ?, venue_notes = ?, performance_rating = ?, venue_rating = ?, favorite = ?, songs = ? WHERE id = ?`).run(
      chooseText('notes'), chooseText('notes'), chooseText('venueNotes'), performanceRating, venueRating, favorite ? 1 : 0, JSON.stringify(songs || []), gig.id
    );
    if (mediaChoice !== 'local') applyRemoteMediaAssignments(gig.id, local.media, remote.media, mediaChoice);
    const resolvedGig = findGigSync(gig.id);
    upsertLocalContribution(resolvedGig);
    database.prepare(`INSERT INTO peer_sync_baselines (shared_gig_id, peer_id, local_hash, remote_hash, synced_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(shared_gig_id, peer_id) DO UPDATE SET
      local_hash=excluded.local_hash, remote_hash=excluded.remote_hash, synced_at=excluded.synced_at`).run(
      row.shared_gig_id, row.peer_id, syncPayloadHash(conflictPayloadFromGig(resolvedGig)), syncPayloadHash(remote), new Date().toISOString()
    );
    database.prepare("UPDATE peer_sync_conflicts SET status = 'resolved', resolved_at = ?, resolution = ? WHERE id = ?").run(new Date().toISOString(), JSON.stringify(resolution), id);
    database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE type = 'peer-sync-conflict' AND shared_gig_id = ? AND peer_id = ?").run(new Date().toISOString(), row.shared_gig_id, row.peer_id);
  })();
  return { ok: true, resolution, gig: findGigSync(gig.id) };
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

function archiveFileReferences() {
  const references = new Map();
  const add = (filename, detail) => {
    if (!filename) return;
    if (!references.has(filename)) references.set(filename, []);
    references.get(filename).push(detail);
  };
  const media = database.prepare(`SELECT m.id, m.gig_id AS gigId, m.filename, m.playback_filename AS playbackFilename,
    m.background_filename AS backgroundFilename, m.external_url AS externalUrl, m.checksum, m.size,
    g.artist, g.venue FROM gig_media m LEFT JOIN gigs g ON g.id = m.gig_id ORDER BY m.created_at`).all();
  for (const item of media) {
    if (!item.externalUrl) add(item.filename, { kind: 'original', mediaId: item.id, gigId: item.gigId, artist: item.artist, venue: item.venue });
    add(item.playbackFilename, { kind: 'playback', mediaId: item.id, gigId: item.gigId, artist: item.artist, venue: item.venue });
    add(item.backgroundFilename, { kind: 'cutout', mediaId: item.id, gigId: item.gigId, artist: item.artist, venue: item.venue });
  }
  for (const row of [...database.prepare('SELECT lookup_name AS owner, image FROM artist_info').all(), ...database.prepare('SELECT lookup_name AS owner, image FROM venue_info').all()]) {
    const filename = localProfileImageFilename(row.image);
    if (filename) add(filename, { kind: 'profile-image', owner: row.owner });
  }
  return { media, references };
}

async function archiveIntegrity() {
  const { media, references } = archiveFileReferences();
  let diskEntries = [];
  try { diskEntries = (await fs.readdir(MEDIA_DIR, { withFileTypes: true })).filter((entry) => entry.isFile()); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const diskFiles = new Map();
  for (const entry of diskEntries) {
    try { diskFiles.set(entry.name, (await fs.stat(path.join(MEDIA_DIR, entry.name))).size); } catch { /* file changed during scan */ }
  }
  const issues = [];
  for (const [filename, owners] of references) {
    if (diskFiles.has(filename)) continue;
    const owner = owners[0];
    issues.push({ id: `missing:${filename}`, type: 'missing', title: filename, detail: owner.kind === 'profile-image' ? `Missing profile image referenced by ${owner.owner}` : `Missing ${owner.kind} file for ${owner.artist || 'unknown artist'} at ${owner.venue || 'unknown venue'}`, href: owner.gigId ? `/edit?id=${encodeURIComponent(owner.gigId)}` : '/health' });
  }
  for (const [filename, size] of diskFiles) {
    if (references.has(filename) || /\.(?:uploading|processing|rotating|trimming)(?:\.|$)/i.test(filename)) continue;
    issues.push({ id: `orphan:${filename}`, type: 'orphan', title: filename, detail: `Unreferenced media file · ${size} bytes`, filename });
  }
  const orphanedRows = media.filter((item) => !item.artist);
  for (const item of orphanedRows) issues.push({ id: `reference:${item.id}`, type: 'reference', title: item.filename || item.id, detail: `Media record points to missing show ${item.gigId}` });
  const duplicates = database.prepare(`SELECT checksum, COUNT(*) AS count, GROUP_CONCAT(id) AS ids, GROUP_CONCAT(gig_id) AS gigIds
    FROM gig_media WHERE checksum IS NOT NULL AND checksum <> '' AND external_url IS NULL GROUP BY checksum HAVING COUNT(*) > 1`).all();
  for (const duplicate of duplicates) issues.push({ id: `duplicate:${duplicate.checksum}`, type: 'duplicate', title: `${duplicate.count} matching uploads`, detail: `These media records share checksum ${duplicate.checksum.slice(0, 12)}…`, mediaIds: duplicate.ids.split(','), href: `/edit?id=${encodeURIComponent(duplicate.gigIds.split(',')[0])}` });
  const foreignKeys = database.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeys.length) issues.push({ id: 'database:foreign-keys', type: 'database', title: 'Broken database relationships', detail: `${foreignKeys.length} foreign-key violation${foreignKeys.length === 1 ? '' : 's'} detected` });
  const quickCheck = database.prepare('PRAGMA quick_check').all().map((row) => Object.values(row)[0]);
  if (quickCheck.some((value) => value !== 'ok')) issues.push({ id: 'database:quick-check', type: 'database', title: 'SQLite integrity warning', detail: quickCheck.join('; ') });
  const counts = issues.reduce((result, issue) => { result[issue.type] = (result[issue.type] || 0) + 1; return result; }, {});
  return {
    healthy: issues.length === 0,
    scannedAt: new Date().toISOString(),
    counts,
    issues,
    summary: { database: quickCheck.every((value) => value === 'ok'), records: media.length, referencedFiles: references.size, diskFiles: diskFiles.size, diskBytes: [...diskFiles.values()].reduce((sum, size) => sum + size, 0) }
  };
}

async function mediaManifest() {
  const integrity = await archiveIntegrity();
  const { media, references } = archiveFileReferences();
  const files = [];
  for (const [filename, owners] of references) {
    try {
      const stat = await fs.stat(path.join(MEDIA_DIR, filename));
      files.push({ filename, size: stat.size, present: true, owners });
    } catch { files.push({ filename, size: null, present: false, owners }); }
  }
  return { format: 'the-master-list-media-manifest-v1', createdAt: new Date().toISOString(), databaseFile: path.basename(DB_FILE), mediaRecords: media.length, files, integrity: { healthy: integrity.healthy, counts: integrity.counts } };
}

async function maintenanceStatus() {
  const databaseSize = await fs.stat(DB_FILE).then((stat) => stat.size).catch(() => 0);
  let backups = [];
  try {
    backups = (await fs.readdir(BACKUP_DIR, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.sqlite')).map((entry) => entry.name).sort().reverse();
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const integrity = await archiveIntegrity();
  return { databaseSize, backupCount: backups.length, latestBackup: backups[0] || null, restorePending: legacyFs.existsSync(PENDING_RESTORE_FILE), backupSchedule: backupSettings(), integrity };
}

async function receiveDatabaseRestore(request) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporary = `${PENDING_RESTORE_FILE}.uploading`;
  const output = legacyFs.createWriteStream(temporary, { mode: 0o600 });
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024 * 1024) throw new Error('Database restore files must be smaller than 2 GB.');
      if (!output.write(chunk)) await new Promise((resolve, reject) => { output.once('drain', resolve); output.once('error', reject); });
    }
    await new Promise((resolve, reject) => { output.end(resolve); output.once('error', reject); });
    const handle = await fs.open(temporary, 'r');
    const header = Buffer.alloc(16);
    try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
    if (size < 100 || !header.equals(Buffer.from('SQLite format 3\0'))) throw new Error('Choose a valid SQLite database file.');
    const candidate = new Database(temporary, { readonly: true, fileMustExist: true });
    try {
      const tables = new Set(candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
      for (const required of ['gigs', 'gig_media', 'profiles', 'instance_identity']) if (!tables.has(required)) throw new Error(`Restore database is missing the ${required} table.`);
      const check = candidate.prepare('PRAGMA quick_check').all().map((row) => Object.values(row)[0]);
      if (check.some((value) => value !== 'ok')) throw new Error(`Restore database failed its integrity check: ${check.join('; ')}`);
    } finally { candidate.close(); }
    await fs.rename(temporary, PENDING_RESTORE_FILE);
    return { staged: true, size, restartRequired: true };
  } catch (error) {
    output.destroy();
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function enrichGigAlbums(gigId, forceMissing = false) {
  const gig = database.prepare('SELECT artist, songs FROM gigs WHERE id = ?').get(gigId);
  if (!gig) throw new Error('Gig not found.');
  const songs = JSON.parse(gig.songs || '[]');
  if (forceMissing) songs.filter((song) => !String(song.album || '').trim() || /^unknown album$/i.test(String(song.album).trim())).forEach((song) => database.prepare('DELETE FROM album_lookup_cache WHERE cache_key = ?').run(`v6::${song.artist || gig.artist}::${song.title}`.toLowerCase()));
  const enriched = await Promise.all(songs.map(async (song) => {
    const currentAlbum = String(song.album || '').trim();
    if (currentAlbum && !/^unknown album$/i.test(currentAlbum)) return song;
    return { ...song, album: await resolveAlbum(song.artist || gig.artist, song.title) || null };
  }));
  database.prepare('UPDATE gigs SET songs = ? WHERE id = ?').run(JSON.stringify(enriched), gigId);
  const counts = {};
  enriched.forEach((song) => { const album = song.album || 'Unknown album'; counts[album] = (counts[album] || 0) + 1; });
  return { songs: enriched, albums: counts };
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

async function resolveAlbum(artist, title) {
  const key = `v6::${artist}::${title}`.toLowerCase();
  const cached = database.prepare('SELECT album, created_at AS createdAt FROM album_lookup_cache WHERE cache_key = ?').get(key);
  if (cached?.album) return cached.album;
  if (cached && Date.now() - new Date(cached.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000) return null;
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
  if (request.method === 'GET' && url.pathname === '/api/healthz') {
    const quickCheck = database.prepare('PRAGMA quick_check').pluck().get();
    const mediaWritable = await fs.access(MEDIA_DIR, legacyFs.constants.W_OK).then(() => true).catch(() => false);
    return sendJson(response, quickCheck === 'ok' && mediaWritable ? 200 : 503, { ok: quickCheck === 'ok' && mediaWritable, database: quickCheck, mediaWritable });
  }

  if (await handleAuthApi(request, response, url)) return;

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
    const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'unread';
    const notifications = database.prepare(`SELECT id, type, peer_id AS peerId, shared_gig_id AS sharedGigId,
      title, body, created_at AS createdAt, read_at AS readAt FROM notifications
      ${scope === 'all' ? '' : 'WHERE read_at IS NULL'} ORDER BY created_at DESC LIMIT 200`).all();
    return sendJson(response, 200, notifications.map((entry) => ({ ...entry, unread: !entry.readAt })));
  }

  if (request.method === 'POST' && url.pathname === '/api/notifications/read-all') {
    requireAccount(request);
    const result = database.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(new Date().toISOString());
    return sendJson(response, 200, { updated: result.changes });
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

  if (request.method === 'GET' && url.pathname === '/api/sync/conflicts') {
    const account = requireAccount(request);
    if (!account.isAdmin) return sendError(response, 403, 'Only the instance owner can resolve sync conflicts.');
    return sendJson(response, 200, peerConflictRows('open'));
  }

  const conflictResolveMatch = url.pathname.match(/^\/api\/sync\/conflicts\/([\w-]+)\/resolve$/);
  if (request.method === 'POST' && conflictResolveMatch) {
    const account = requireAccount(request);
    if (!account.isAdmin) return sendError(response, 403, 'Only the instance owner can resolve sync conflicts.');
    try { return sendJson(response, 200, resolvePeerConflict(conflictResolveMatch[1], await readBody(request))); }
    catch (error) { return sendError(response, 400, error.message); }
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

  if (request.method === 'GET' && url.pathname === '/api/maintenance/status') {
    requireAccount(request);
    return sendJson(response, 200, await maintenanceStatus());
  }

  if (request.method === 'PATCH' && url.pathname === '/api/maintenance/backup-settings') {
    const account = requireAccount(request);
    if (!account.isAdmin) return sendError(response, 403, 'Only the instance owner can change backup settings.');
    const body = await readBody(request);
    const intervalHours = Math.max(1, Math.min(24 * 30, Math.round(Number(body.intervalHours) || 24)));
    const retentionCount = Math.max(1, Math.min(365, Math.round(Number(body.retentionCount) || 14)));
    setAppSetting('backup_enabled', body.enabled === false ? 'false' : 'true');
    setAppSetting('backup_interval_hours', intervalHours);
    setAppSetting('backup_retention_count', retentionCount);
    await pruneScheduledBackups(retentionCount);
    return sendJson(response, 200, backupSettings());
  }

  if (request.method === 'POST' && url.pathname === '/api/maintenance/backup-now') {
    const account = requireAccount(request);
    if (!account.isAdmin) return sendError(response, 403, 'Only the instance owner can run backups.');
    try { return sendJson(response, 201, await createScheduledBackup({ force: true })); }
    catch (error) { return sendError(response, 500, error.message); }
  }

  if (request.method === 'GET' && url.pathname === '/api/maintenance/database') {
    requireAccount(request);
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `the-master-list-${timestamp}.sqlite`;
    const backupPath = path.join(BACKUP_DIR, filename);
    await database.backup(backupPath);
    const stat = await fs.stat(backupPath);
    response.writeHead(200, {
      'Content-Type': 'application/vnd.sqlite3',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    });
    return legacyFs.createReadStream(backupPath).pipe(response);
  }

  if (request.method === 'GET' && url.pathname === '/api/maintenance/manifest') {
    requireAccount(request);
    const filename = `the-master-list-media-manifest-${new Date().toISOString().slice(0, 10)}.json`;
    return sendJson(response, 200, await mediaManifest(), { 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
  }

  if (request.method === 'GET' && url.pathname === '/api/maintenance/integrity') {
    requireAccount(request);
    return sendJson(response, 200, await archiveIntegrity());
  }

  if (request.method === 'POST' && url.pathname === '/api/maintenance/restore') {
    requireAccount(request);
    if (!String(request.headers['content-type'] || '').includes('application/vnd.sqlite3') && !String(request.headers['content-type'] || '').includes('application/octet-stream')) return sendError(response, 415, 'Upload a SQLite database file.');
    try { return sendJson(response, 202, await receiveDatabaseRestore(request)); }
    catch (error) { return sendError(response, /smaller than 2 GB/i.test(error.message) ? 413 : 400, error.message); }
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
  if (request.method === 'GET' && url.pathname === '/api/stats/genres') {
    requireAccount(request);
    return sendJson(response, 200, { genres: await archiveGenreStats() });
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
    return sendJson(response, 200, backgroundJobs.listActive());
  }
  const jobMatch = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/);
  if (request.method === 'GET' && jobMatch) {
    const job = backgroundJobs.get(jobMatch[1]);
    return sendJson(response, job ? 200 : 404, job || { error: 'Background job not found.' });
  }
  if (request.method === 'DELETE' && jobMatch) {
    requireAccount(request);
    const job = backgroundJobs.cancel(jobMatch[1]);
    return sendJson(response, job ? 200 : 404, job || { error: 'Background job not found.' });
  }
  if (request.method === 'POST' && url.pathname === '/api/media/cleanup') {
    requireAccount(request);
    const profileImages = [...database.prepare('SELECT image FROM artist_info').all(), ...database.prepare('SELECT image FROM venue_info').all()].map((row) => localProfileImageFilename(row.image)).filter(Boolean);
    const referenced = new Set([...database.prepare('SELECT filename, playback_filename, background_filename FROM gig_media').all().flatMap((row) => [row.filename, row.playback_filename, row.background_filename].filter(Boolean)), ...profileImages]);
    const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true }); let removed = 0;
    for (const entry of entries) { if (!entry.isFile() || referenced.has(entry.name) || /\.(?:uploading|processing|rotating|trimming)(?:\.|$)/i.test(entry.name)) continue; await fs.rm(path.join(MEDIA_DIR, entry.name), { force: true }); removed += 1; }
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
    const artists = database.prepare('SELECT lookup_name AS lookupName, title, description, bio, image, image_position AS imagePosition, source, is_manual AS isManual FROM artist_info').all();
    const venues = database.prepare('SELECT lookup_name AS lookupName, title, description, bio, image, image_position AS imagePosition, source, is_manual AS isManual, is_closed AS isClosed FROM venue_info').all();
    const geocodes = await readGeocodes();
    const locations = Object.entries(geocodes).filter(([, coordinates]) => Number.isFinite(Number(coordinates?.lat)) && Number.isFinite(Number(coordinates?.lng))).map(([key]) => key);
    return sendJson(response, 200, { artists, venues, locations });
  }

  if (request.method === 'GET' && url.pathname === '/api/artists') {
    const info = await fetchArtistInfo(url.searchParams.get('name'));
    const genres = cachedArtistGenres(info.name)?.genres || [];
    return sendJson(response, 200, { ...info, imagePosition: normaliseImagePosition(info.imagePosition), genres });
  }
  if (request.method === 'GET' && url.pathname === '/api/venues') {
    const info = await fetchVenueInfo(url.searchParams.get('name'), url.searchParams.get('city'));
    const locationKey = `${String(url.searchParams.get('name') || '').trim()}|${String(url.searchParams.get('city') || '').trim()}`.toLowerCase();
    const coordinates = (await readGeocodes())[locationKey] || null;
    return sendJson(response, 200, { ...info, imagePosition: normaliseImagePosition(info.imagePosition), isClosed: Boolean(info.isClosed), coordinates });
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
    const genres = Object.prototype.hasOwnProperty.call(body, 'genres') ? saveArtistGenres(name, body.genres, 'manual') : (cachedArtistGenres(name)?.genres || []);
    database.prepare('INSERT OR REPLACE INTO artist_info (lookup_name, title, description, bio, image, image_position, is_manual, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.imagePosition, info.source, new Date().toISOString());
    await removeReplacedProfileImage(existing?.image, info.image);
    return sendJson(response, 200, { name, ...info, genres });
  }
  if (request.method === 'PATCH' && url.pathname === '/api/venues') {
    requireAccount(request);
    const name = String(url.searchParams.get('name') || '').trim();
    const city = String(url.searchParams.get('city') || '').trim();
    if (!name) return sendError(response, 400, 'A venue name is required.');
    const body = await readBody(request);
    const lookupName = `${name}|${city}`.toLowerCase();
    const existing = database.prepare('SELECT title, description, bio, image, image_position AS imagePosition, is_closed AS isClosed, source FROM venue_info WHERE lookup_name = ?').get(lookupName);
    const geocodes = await readGeocodes();
    let coordinates = geocodes[lookupName] || null;
    const address = String(body.locationAddress || '').trim();
    const latitudeValue = String(body.latitude ?? '').trim();
    const longitudeValue = String(body.longitude ?? '').trim();
    if (address) {
      const query = new URL('https://nominatim.openstreetmap.org/search');
      query.searchParams.set('q', address); query.searchParams.set('format', 'jsonv2'); query.searchParams.set('limit', '1');
      const result = await fetch(query, { headers: { 'User-Agent': 'TheMasterList/0.1 personal-live-music-archive', 'Accept-Language': 'en' } });
      const match = result.ok ? (await result.json())[0] : null;
      if (!match) return sendError(response, 404, 'That address could not be found. Try including the suburb, city and country.');
      coordinates = { lat: Number(match.lat), lng: Number(match.lon) };
    } else if (latitudeValue || longitudeValue) {
      const lat = Number(latitudeValue); const lng = Number(longitudeValue);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return sendError(response, 400, 'Enter valid latitude and longitude coordinates.');
      coordinates = { lat, lng };
    }
    const uploadedImage = await saveProfileImageUpload(body.imageUpload);
    const info = {
      title: String(body.title ?? existing?.title ?? name).trim(),
      description: String(body.description ?? existing?.description ?? '').trim(),
      bio: String(body.bio ?? existing?.bio ?? '').trim(),
      image: uploadedImage || String(body.image ?? existing?.image ?? '').trim() || null,
      imagePosition: normaliseImagePosition(body.imagePosition ?? existing?.imagePosition),
      isClosed: Object.prototype.hasOwnProperty.call(body, 'isClosed') ? [true, 1, '1', 'true', 'on'].includes(body.isClosed) : Boolean(existing?.isClosed),
      source: String(body.source ?? existing?.source ?? '').trim() || null
    };
    database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, image_position, is_manual, is_closed, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.imagePosition, info.isClosed ? 1 : 0, info.source, new Date().toISOString());
    if (coordinates) { geocodes[lookupName] = coordinates; await writeGeocodes(geocodes); }
    await removeReplacedProfileImage(existing?.image, info.image);
    return sendJson(response, 200, { name, city, ...info, coordinates });
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
      const lookupName = `${name}|${city}`.toLowerCase();
      const existing = database.prepare('SELECT image, is_closed AS isClosed FROM venue_info WHERE lookup_name = ?').get(lookupName);
      database.prepare('DELETE FROM venue_info WHERE lookup_name = ?').run(lookupName);
      await removeReplacedProfileImage(existing?.image, null);
      await fetchVenueInfo(name, city);
      if (existing?.isClosed) database.prepare('UPDATE venue_info SET is_closed = 1 WHERE lookup_name = ?').run(lookupName);
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
      const existing = database.prepare('SELECT image, image_position AS imagePosition, is_closed AS isClosed FROM venue_info WHERE lookup_name = ?').get(lookupName);
      const info = {
        title: String(body.title || name).trim(), description: String(body.description || '').trim(), bio: String(body.bio || '').trim(),
        image: String(body.image || '').trim() || null, imagePosition: normaliseImagePosition(existing?.imagePosition), isClosed: Boolean(existing?.isClosed), source: String(body.source || '').trim() || null
      };
      database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, image_position, is_manual, is_closed, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.imagePosition, info.isClosed ? 1 : 0, info.source, new Date().toISOString());
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
    return sendJson(response, 200, await enrichGigAlbums(albumStatsMatch[1], url.searchParams.get('refresh') === '1'));
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
  if (await handleMediaUpload(request, response, url)) return;
  if (await handleMediaMutation(request, response, url)) return;
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

if (require.main === module) mediaRecoveryPromise.finally(() => {
  server.listen(PORT, HOST, () => {
    console.log(`The Master List is running at http://${HOST}:${PORT}`);
    const initialBackupCheck = setTimeout(runScheduledBackupCheck, 10_000);
    initialBackupCheck.unref?.();
    const backupTimer = setInterval(runScheduledBackupCheck, 60 * 60 * 1000);
    backupTimer.unref?.();
  });
});

module.exports = {
  server,
  database,
  paths: { data: DATA_DIR, database: DB_FILE, media: MEDIA_DIR },
  testables: { archiveIntegrity, maintenanceStatus, mediaManifest, backupSettings, createScheduledBackup, peerConflictRows, detectSyncConflict, resolvePeerConflict, estimateFullShowTimings, parsePlaybackChapters, suggestPlaybackPlan, youtubeVideoId }
};
