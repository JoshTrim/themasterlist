const http = require('node:http');
const Database = require('better-sqlite3');
const fs = require('node:fs/promises');
const legacyFs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
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
  CREATE TABLE IF NOT EXISTS gig_media (
    id TEXT PRIMARY KEY,
    gig_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE
  )
`);
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
    media: database.prepare('SELECT id, filename, mime_type AS mimeType, size, created_at AS createdAt FROM gig_media WHERE gig_id = ? ORDER BY created_at').all(row.id).map((media) => ({ ...media, url: `/api/media/${media.id}` })),
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
  return false;
}

async function providerResponse(url, options, provider) {
  const result = await fetch(url, options);
  if (result.ok) return result.json();
  const body = await result.json().catch(() => ({}));
  const detail = body.error?.message || body.error_description || body.message || body.error || `HTTP ${result.status}`;
  throw new Error(`${provider}: ${detail}`);
}

async function fetchArtistInfo(name) {
  const requestedName = String(name || '').trim();
  if (!requestedName) throw new Error('An artist name is required.');
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
  if (!response.ok) return { name: requestedName, title: requestedName, bio: '', description: '', image: null, source: null };
  const summary = await response.json();
  return { name: requestedName, title: summary.title || requestedName, description: summary.description || '', bio: summary.extract || '', image: summary.thumbnail?.source || summary.originalimage?.source || null, source: summary.content_urls?.desktop?.page || null };
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

function mediaRows(gigId) {
  return database.prepare('SELECT id, filename, mime_type AS mimeType, size, created_at AS createdAt FROM gig_media WHERE gig_id = ? ORDER BY created_at').all(gigId).map((media) => ({ ...media, url: `/api/media/${media.id}` }));
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

function validateGig(gig) {
  const required = ['artist', 'venue', 'city', 'date'];
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
      const file = await fs.readFile(path.join(MEDIA_DIR, media.filename));
      response.writeHead(200, { 'Content-Type': media.mime_type, 'Content-Length': file.length, 'Cache-Control': 'private, max-age=3600' });
      return response.end(file);
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

  if (request.method === 'GET' && url.pathname === '/api/artists') {
    return sendJson(response, 200, await fetchArtistInfo(url.searchParams.get('name')));
  }

  if (request.method === 'GET' && url.pathname === '/api/gigs') {
    const gigs = await readGigs();
    return sendJson(response, 200, gigs.sort((a, b) => b.date.localeCompare(a.date)));
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
      date: gig.date,
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
  if (mediaCollectionMatch && request.method === 'GET') {
    if (!database.prepare('SELECT id FROM gigs WHERE id = ?').get(mediaCollectionMatch[1])) return sendError(response, 404, 'Gig not found.');
    return sendJson(response, 200, mediaRows(mediaCollectionMatch[1]));
  }
  if (mediaCollectionMatch && request.method === 'POST') {
    const gigId = mediaCollectionMatch[1];
    if (!database.prepare('SELECT id FROM gigs WHERE id = ?').get(gigId)) return sendError(response, 404, 'Gig not found.');
    const body = await readBody(request);
    const mimeType = String(body.mimeType || '');
    const filename = String(body.filename || 'upload').slice(0, 180);
    if (!/^image\/(jpeg|png|gif|webp)$|^video\/(mp4|webm|quicktime)$/.test(mimeType)) return sendError(response, 415, 'Upload an image or video file.');
    const encoded = String(body.data || '').replace(/^data:[^;]+;base64,/, '');
    const file = Buffer.from(encoded, 'base64');
    if (!file.length || file.length > 20 * 1024 * 1024) return sendError(response, 413, 'Each upload must be between 1 byte and 20 MB.');
    await fs.mkdir(MEDIA_DIR, { recursive: true });
    const id = randomUUID();
    const storedFilename = `${id}.${mediaExtension(mimeType, filename)}`;
    await fs.writeFile(path.join(MEDIA_DIR, storedFilename), file);
    database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, gigId, storedFilename, mimeType, file.length, new Date().toISOString());
    return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
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
    if (!artistName || !cityName || !eventDate) return sendError(response, 400, 'Artist, city and date are required.');

    const upstream = new URL(SETLIST_API);
    upstream.searchParams.set('artistName', artistName);
    upstream.searchParams.set('cityName', cityName);
    upstream.searchParams.set('date', eventDate.split('-').reverse().join('-'));
    const headers = { Accept: 'application/json', 'x-api-key': process.env.SETLIST_FM_API_KEY };
    let setlistResponse = await fetch(upstream, { headers });

    // Venue city labels are not always how concertgoers name the place
    // (e.g. Hollywood Bowl is recorded as Los Angeles). Retry by artist/date.
    if (setlistResponse.status === 404) {
      upstream.searchParams.delete('cityName');
      setlistResponse = await fetch(upstream, { headers });
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

server.listen(PORT, () => console.log(`The Master List is running at http://localhost:${PORT}`));

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
