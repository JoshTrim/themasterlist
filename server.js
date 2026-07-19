const http = require('node:http');
const Database = require('better-sqlite3');
const fs = require('node:fs/promises');
const legacyFs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { randomUUID, createHash } = crypto;
const playback = require('./lib/playback');
const { recognitionKey, youtubeVideoId, isoDurationSeconds, parsePlaybackChapters, estimateFullShowTimings, suggestPlaybackPlan } = playback;
const { normaliseGenres, normaliseImagePosition, normaliseSongs, validateGig, normaliseRating } = require('./lib/validation');
const { createAuth } = require('./lib/auth');
const { sendJson, sendError, redirect, readBody } = require('./lib/http');
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
const { createPeerIdentity } = require('./lib/peer-identity');
const { createPeerTransport } = require('./lib/peer-transport');
const { createPeerSync } = require('./lib/peer-sync');
const { createPeerRoutes } = require('./lib/routes/peers');
const { createSetlistFmProvider } = require('./lib/providers/setlist-fm');
const { createMetadataProvider } = require('./lib/providers/metadata');
const { createSpotifyProvider } = require('./lib/providers/spotify');
const { createYouTubeProvider } = require('./lib/providers/youtube');
const { createAppleMusicProvider } = require('./lib/providers/apple-music');
const { createOAuthService } = require('./lib/oauth');
const { createGeocodingService, validCoordinates } = require('./lib/geocoding');
const { createArchiveHealthService } = require('./lib/archive-health');
const { createArchiveIntegrityService } = require('./lib/archive-integrity');
const { createMaintenanceRoutes } = require('./lib/routes/maintenance');
const { createShowRoutes } = require('./lib/routes/shows');
const { createSetlistRoutes } = require('./lib/routes/setlists');
const { createStatsRoutes } = require('./lib/routes/stats');
const { createArchiveTransferRoutes } = require('./lib/routes/archive-transfer');
const { createDirectoryRoutes } = require('./lib/routes/directory');
const { createPlaybackPlanRoutes } = require('./lib/routes/playback-plans');
const { createApiUsage } = require('./lib/api-usage');
const { createSharedShows } = require('./lib/shared-shows');
const { createProfileImages } = require('./lib/profile-images');
const { createMetadataCache } = require('./lib/metadata-cache');
const { createFileServing } = require('./lib/file-serving');

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
const peerIdentity = createPeerIdentity({ database, crypto, instanceName: () => process.env.INSTANCE_NAME || 'The Master List instance' });
peerIdentity.ensure();
const instanceRow = peerIdentity.row;
const peerRows = peerIdentity.peers;

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
const profileImages = createProfileImages({ fs, path, mediaDir: MEDIA_DIR, randomUUID });
const apiUsage = createApiUsage({ database, request: fetch });
const providerResponse = apiUsage.requestJson;
const setlistProvider = createSetlistFmProvider({ apiKey: process.env.SETLIST_FM_API_KEY, fetch, recordUsage: apiUsage.record, normaliseSongs });
const metadataProvider = createMetadataProvider({ fetch, googleApiKey: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY, googleEngineId: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID });
const spotifyProvider = createSpotifyProvider({ requestJson: providerResponse });
const youtubeProvider = createYouTubeProvider({ requestJson: providerResponse });
const appleMusicProvider = createAppleMusicProvider({ requestJson: providerResponse, developerToken: process.env.APPLE_MUSIC_DEVELOPER_TOKEN, storefront: process.env.APPLE_MUSIC_STOREFRONT || 'au' });
const oauthService = createOAuthService({
  providers: {
    spotify: { name: 'Spotify', clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET, authorizationUrl: 'https://accounts.spotify.com/authorize', tokenUrl: 'https://accounts.spotify.com/api/token', scope: 'playlist-modify-private playlist-modify-public', basicAuth: true },
    youtube: { name: 'YouTube', clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/youtube', authorizationParams: { access_type: 'offline', prompt: 'consent' } }
  }, requestJson: providerResponse, readConnections, writeConnections, randomUUID
});
const metadataCache = createMetadataCache({
  database, provider: metadataProvider, youtubeProvider,
  getAccessToken: (provider) => oauthService.accessToken(provider),
  youtubeConfigured: () => configured('youtube'), normaliseGenres, youtubeVideoId, isoDurationSeconds
});
const {
  cachedArtistGenres, saveArtistGenres, archiveGenreStats, fetchArtistInfo, fetchVenueInfo,
  enrichGigAlbums, searchYouTubeForGig, refreshYouTubePlaybackMetadata
} = metadataCache;
const geocoding = createGeocodingService({ fetch, read: readGeocodes, write: writeGeocodes });
const archiveHealthService = createArchiveHealthService({
  readGigs, readGeocodes: geocoding.read,
  artistInfo: (key) => database.prepare('SELECT bio, image FROM artist_info WHERE lookup_name = ?').get(key),
  venueInfo: (key) => database.prepare('SELECT bio, description, image FROM venue_info WHERE lookup_name = ?').get(key)
});
const archiveIntegrityService = createArchiveIntegrityService({ database, fs, path, mediaDir: MEDIA_DIR, databaseFile: DB_FILE, profileImageFilename: profileImages.filename });
const fileServing = createFileServing({ fs, legacyFs, path, publicDir: PUBLIC_DIR, mediaDir: MEDIA_DIR, database, profileImages, sendError });
const handleMaintenanceRoute = createMaintenanceRoutes({ requireAccount, readBody, sendJson, sendError, status: maintenanceStatus, settings: backupSettings, setSetting: setAppSetting, pruneBackups: pruneScheduledBackups, createBackup: createScheduledBackup, manifest: mediaManifest, integrity: archiveIntegrity, restore: receiveDatabaseRestore });
const handleSetlistRoute = createSetlistRoutes({ provider: setlistProvider, enrichAlbums: enrichGigAlbums, sendJson, sendError });
const handleStatsRoute = createStatsRoutes({ database, requireAccount, sendJson, genreStats: archiveGenreStats, usageDay: apiUsage.day, configured, youtubeQuota: process.env.YOUTUBE_DAILY_QUOTA_UNITS, setlistConfigured: Boolean(process.env.SETLIST_FM_API_KEY && process.env.SETLIST_FM_API_KEY !== 'replace-me') });
const handleDirectoryRoute = createDirectoryRoutes({ database, requireAccount, readBody, sendJson, sendError, fetchArtistInfo, fetchVenueInfo, cachedArtistGenres, saveArtistGenres, normaliseImagePosition, profileImages, geocoding, validCoordinates });
const handlePlaybackPlanRoute = createPlaybackPlanRoutes({ database, requireAccount, readBody, sendJson, sendError, findGig: findGigSync, mediaRows, refreshMetadata: refreshYouTubePlaybackMetadata, suggestPlaybackPlan });
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
const peerTransport = createPeerTransport({ fetch, identity: peerIdentity, AbortController, setTimeout, clearTimeout });
let conflictStore;
const peerSync = createPeerSync({
  database, identity: peerIdentity, transport: peerTransport, findGig: findGigSync,
  normaliseRating, createHash, detectConflict: (...args) => conflictStore.detect(...args)
});
const {
  contributionRows: sharedContributionRows,
  conflictPayloadFromGig,
  conflictPayloadFromSnapshot,
  upsertLocalContribution
} = peerSync;
conflictStore = createConflictStore({ database, payloadFromGig: conflictPayloadFromGig, payloadFromSnapshot: conflictPayloadFromSnapshot, findGig: findGigSync });
const { detect: detectSyncConflict, list: peerConflictRows } = conflictStore;
const sharedShows = createSharedShows({
  database, peerRows, instanceRow, findGig: findGigSync, contributionRows: sharedContributionRows,
  upsertLocalContribution, conflictPayloadFromGig, normaliseRating
});
const handleShowRoute = createShowRoutes({ database, readGigs, readBody, sendJson, sendError, validateGig, normaliseRating, normaliseAttendees: sharedShows.normaliseAttendees, randomUUID });
const handleArchiveTransfer = createArchiveTransferRoutes({ database, requireAccount, readBody, readGigs, sendJson, sendError, validateGig, normaliseAttendees: sharedShows.normaliseAttendees, randomUUID });
const handlePeerRoute = createPeerRoutes({
  database, identity: peerIdentity, transport: peerTransport, sync: peerSync,
  requireAccount, readBody, sendJson, sendError, appOrigin,
  instanceUrl: () => process.env.INSTANCE_URL || '', randomUUID
});

const mediaRecoveryPromise = recoverMediaWork({ database, fs, path, mediaDir: MEDIA_DIR }).then((result) => {
  if (Object.values(result).some(Boolean)) console.log('[media] recovered interrupted work:', result);
}).catch((error) => console.error('[media] recovery failed:', error.message));

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
  if (provider === 'spotify' || provider === 'youtube') return oauthService.configured(provider);
  if (provider === 'apple-music') return Boolean(process.env.APPLE_MUSIC_DEVELOPER_TOKEN);
  if (provider === 'audd') return Boolean(process.env.AUDD_API_TOKEN);
  return false;
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

async function mapLocations() {
  return geocoding.locationsForGigs(await readGigs());
}

async function archiveHealth() {
  return archiveHealthService.report();
}

async function archiveIntegrity() {
  return archiveIntegrityService.report();
}

async function mediaManifest() {
  return archiveIntegrityService.manifest();
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

async function getAccessToken(provider) {
  return oauthService.accessToken(provider);
}

async function exportSpotify(gig) {
  const accessToken = await getAccessToken('spotify');
  return spotifyProvider.exportPlaylist({ gig, accessToken, details: playlistDetails(gig) });
}

async function exportYouTube(gig) {
  const accessToken = await getAccessToken('youtube');
  return youtubeProvider.exportPlaylist({ gig, accessToken, details: playlistDetails(gig) });
}

async function exportAppleMusic(gig, musicUserToken) {
  return appleMusicProvider.exportPlaylist({ gig, musicUserToken, details: playlistDetails(gig) });
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
    return redirect(response, oauthService.begin(provider, callbackUrl));
  }

  if (url.pathname === callbackPath) {
    const result = await oauthService.complete(provider, { state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: url.searchParams.get('error') });
    return redirect(response, result.error ? `/?integrationError=${result.error}` : `/?connected=${provider}`);
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

  if (await handlePeerRoute(request, response, url)) return;

  request.account = accountsConfigured() ? requireAccount(request) : null;

  if (request.method === 'GET' && url.pathname === '/api/sync/conflicts') {
    const account = requireAccount(request);
    if (!account.isAdmin) return sendError(response, 403, 'Only the instance owner can resolve sync conflicts.');
    return sendJson(response, 200, peerConflictRows('open'));
  }

  const conflictResolveMatch = url.pathname.match(/^\/api\/sync\/conflicts\/([\w-]+)\/resolve$/);
  if (request.method === 'POST' && conflictResolveMatch) {
    const account = requireAccount(request);
    if (!account.isAdmin) return sendError(response, 403, 'Only the instance owner can resolve sync conflicts.');
    try { return sendJson(response, 200, sharedShows.resolveConflict(conflictResolveMatch[1], await readBody(request))); }
    catch (error) { return sendError(response, 400, error.message); }
  }

  if (await fileServing.handleStoredFile(request, response, url)) return;

  if (request.method === 'GET' && url.pathname === '/api/profiles') {
    if (!accountsConfigured()) return sendJson(response, 200, []);
    requireAccount(request);
    return sendJson(response, 200, sharedShows.profiles());
  }

  if (request.method === 'POST' && url.pathname === '/api/profiles') {
    return sendError(response, 403, 'Create accounts with an invite link.');
  }

  if (request.method === 'GET' && url.pathname === '/api/shared/shows') {
    if (!accountsConfigured()) return sendJson(response, 200, []);
    requireAccount(request);
    return sendJson(response, 200, sharedShows.rows());
  }

  if (request.method === 'POST' && url.pathname === '/api/shared/shows') {
    const account = requireAccount(request);
    const body = await readBody(request);
    return sendJson(response, 201, sharedShows.create(body.sourceGigId, account.id));
  }

  const attendeeMatch = url.pathname.match(/^\/api\/shared\/shows\/([\w-]+)\/attendees$/);
  if (request.method === 'POST' && attendeeMatch) {
    requireAccount(request);
    const body = await readBody(request);
    try { return sendJson(response, 200, sharedShows.addAttendee(attendeeMatch[1], body.profileId)); }
    catch (error) { if (/Shared show not found/i.test(error.message)) return sendError(response, 404, error.message); throw error; }
  }

  const reviewMatch = url.pathname.match(/^\/api\/shared\/shows\/([\w-]+)\/reviews$/);
  if (request.method === 'PATCH' && reviewMatch) {
    const account = requireAccount(request);
    const body = await readBody(request);
    try { return sendJson(response, 200, sharedShows.updateReview(reviewMatch[1], account.id, body)); }
    catch (error) { if (/Shared show not found/i.test(error.message)) return sendError(response, 404, error.message); throw error; }
  }

  if (request.method === 'POST' && url.pathname === '/api/map/locations') {
    const locations = await mapLocations();
    return sendJson(response, 200, { locations });
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations') {
    const connections = await oauthService.connectionStatus();
    return sendJson(response, 200, {
      spotify: connections.spotify,
      youtube: connections.youtube,
      appleMusic: { configured: configured('apple-music'), developerToken: process.env.APPLE_MUSIC_DEVELOPER_TOKEN || null }
    });
  }

  if (await handleMaintenanceRoute(request, response, url)) return;

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


  if (request.method === 'GET' && url.pathname === '/api/backup') {
    requireAccount(request);
    const media = database.prepare('SELECT * FROM gig_media ORDER BY created_at').all();
    const files = [];
    for (const item of media) {
      try { files.push({ ...item, data: (await fs.readFile(path.join(MEDIA_DIR, item.filename))).toString('base64') }); } catch { /* keep manifest entry if a file is missing */ }
    }
    const profileImageFiles = [...new Set([...database.prepare('SELECT image FROM artist_info').all(), ...database.prepare('SELECT image FROM venue_info').all()].map((row) => profileImages.filename(row.image)).filter(Boolean))];
    for (const filename of profileImageFiles) {
      try { files.push({ kind: 'profile-image', filename, data: (await fs.readFile(path.join(MEDIA_DIR, filename))).toString('base64') }); } catch { /* database backup still retains the missing image reference */ }
    }
    return sendJson(response, 200, { format: 'the-master-list-backup-v1', createdAt: new Date().toISOString(), database: (await fs.readFile(DB_FILE)).toString('base64'), media: files });
  }

  if (await handleArchiveTransfer(request, response, url)) return;
  if (await handleStatsRoute(request, response, url)) return;
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
    const profileImageFiles = [...database.prepare('SELECT image FROM artist_info').all(), ...database.prepare('SELECT image FROM venue_info').all()].map((row) => profileImages.filename(row.image)).filter(Boolean);
    const referenced = new Set([...database.prepare('SELECT filename, playback_filename, background_filename FROM gig_media').all().flatMap((row) => [row.filename, row.playback_filename, row.background_filename].filter(Boolean)), ...profileImageFiles]);
    const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true }); let removed = 0;
    for (const entry of entries) { if (!entry.isFile() || referenced.has(entry.name) || /\.(?:uploading|processing|rotating|trimming)(?:\.|$)/i.test(entry.name)) continue; await fs.rm(path.join(MEDIA_DIR, entry.name), { force: true }); removed += 1; }
    return sendJson(response, 200, { removed });
  }

  if (await handleDirectoryRoute(request, response, url)) return;

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
      await profileImages.removeReplaced(existing?.image, null);
      await fetchArtistInfo(name);
    } else if (type === 'venue') {
      const name = String(body.name || '').trim(); const city = String(body.city || '').trim();
      if (!name) return sendError(response, 400, 'Venue name is required.');
      const lookupName = `${name}|${city}`.toLowerCase();
      const existing = database.prepare('SELECT image, is_closed AS isClosed FROM venue_info WHERE lookup_name = ?').get(lookupName);
      database.prepare('DELETE FROM venue_info WHERE lookup_name = ?').run(lookupName);
      await profileImages.removeReplaced(existing?.image, null);
      await fetchVenueInfo(name, city);
      if (existing?.isClosed) database.prepare('UPDATE venue_info SET is_closed = 1 WHERE lookup_name = ?').run(lookupName);
    } else if (type === 'location') {
      const key = String(body.key || '').toLowerCase();
      await geocoding.remove(key);
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
      await profileImages.removeReplaced(existing?.image, info.image);
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
      await profileImages.removeReplaced(existing?.image, info.image);
    } else if (type === 'location') {
      const key = String(body.key || '').toLowerCase(); const address = String(body.address || '').trim();
      let lat = Number(body.lat); let lng = Number(body.lng);
      if (!key) return sendError(response, 400, 'A venue location is required.');
      if (address) {
        const coordinates = await geocoding.search(address);
        if (!coordinates) return sendError(response, 404, 'That address could not be found. Try including the suburb, city and country.');
        ({ lat, lng } = coordinates);
      }
      if (!validCoordinates(lat, lng)) return sendError(response, 400, 'Enter an address or valid latitude and longitude coordinates.');
      await geocoding.set(key, { lat, lng });
    } else return sendError(response, 400, 'Manual entry is not available for this issue type.');
    return sendJson(response, 200, await archiveHealth());
  }

  if (await handleShowRoute(request, response, url)) return;
  if (await handleSetlistRoute(request, response, url)) return;

  if (await handleMediaUpload(request, response, url)) return;
  if (await handleMediaMutation(request, response, url)) return;
  if (await handlePlaybackPlanRoute(request, response, url)) return;
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


  return sendError(response, 404, 'Not found');
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else if (url.pathname.startsWith('/auth/')) await handleAuth(request, response, url);
    else await fileServing.serveStatic(request, response, url.pathname);
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
  ready: mediaRecoveryPromise,
  paths: { data: DATA_DIR, database: DB_FILE, media: MEDIA_DIR },
  testables: { archiveIntegrity, maintenanceStatus, mediaManifest, backupSettings, createScheduledBackup, peerConflictRows, detectSyncConflict, resolvePeerConflict: sharedShows.resolveConflict, estimateFullShowTimings, parsePlaybackChapters, suggestPlaybackPlan, youtubeVideoId }
};
