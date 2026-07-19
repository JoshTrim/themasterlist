'use strict';

const ALBUM_CACHE_VERSION = 'v6';
const ALBUM_MISS_TTL = 7 * 24 * 60 * 60 * 1000;
const YOUTUBE_SEARCH_TTL = 24 * 60 * 60 * 1000;
const YOUTUBE_METADATA_TTL = 30 * 24 * 60 * 60 * 1000;

function createMetadataCache({
  database, provider, youtubeProvider, getAccessToken, youtubeConfigured,
  normaliseGenres, youtubeVideoId, isoDurationSeconds, now = () => new Date()
}) {
  const timestamp = () => now().toISOString();

  function cachedArtistGenres(name) {
    const key = String(name || '').trim().toLowerCase();
    const row = database.prepare('SELECT genres, source, updated_at AS updatedAt FROM artist_genres WHERE lookup_name = ?').get(key);
    if (!row) return null;
    try { return { genres: normaliseGenres(JSON.parse(row.genres || '[]')), source: row.source, updatedAt: row.updatedAt }; }
    catch { return { genres: [], source: row.source, updatedAt: row.updatedAt }; }
  }

  function saveArtistGenres(name, genres, source = 'manual') {
    const artistName = String(name || '').trim();
    const values = normaliseGenres(genres);
    database.prepare('INSERT OR REPLACE INTO artist_genres (lookup_name, artist_name, genres, source, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(artistName.toLowerCase(), artistName, JSON.stringify(values), source, timestamp());
    return values;
  }

  async function fetchArtistGenres(name) {
    const artistName = String(name || '').trim();
    if (!artistName) return [];
    const cached = cachedArtistGenres(artistName);
    if (cached) return cached.genres;
    let genres = [];
    try { genres = normaliseGenres(await provider.artistGenre(artistName)); }
    catch { /* Cache an empty result so overview remains fast while offline. */ }
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
    return [...totals].map(([genre, shows]) => ({
      genre, shows: Math.round(shows * 10) / 10,
      percentage: Math.round((shows / totalShows) * 1000) / 10
    })).sort((a, b) => b.percentage - a.percentage || a.genre.localeCompare(b.genre));
  }

  async function fetchArtistInfo(name) {
    const requestedName = String(name || '').trim();
    if (!requestedName) throw new Error('An artist name is required.');
    const lookupName = requestedName.toLowerCase();
    const cached = database.prepare('SELECT title, description, bio, image, image_position AS imagePosition, is_manual AS isManual, source FROM artist_info WHERE lookup_name = ?').get(lookupName);
    if (cached) return { name: requestedName, ...cached };
    const info = await provider.artistInfo(requestedName);
    database.prepare('INSERT OR REPLACE INTO artist_info (lookup_name, title, description, bio, image, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(lookupName, info.title, info.description, info.bio, info.image, info.source, timestamp());
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
    const info = await provider.venueInfo(requestedName, requestedCity);
    database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(lookupName, info.title, info.description, info.bio, info.image, info.source, timestamp());
    return info;
  }

  const albumKey = (artist, title) => `${ALBUM_CACHE_VERSION}::${artist}::${title}`.toLowerCase();

  async function resolveAlbum(artist, title) {
    const key = albumKey(artist, title);
    const cached = database.prepare('SELECT album, created_at AS createdAt FROM album_lookup_cache WHERE cache_key = ?').get(key);
    if (cached?.album) return cached.album;
    if (cached && now().getTime() - new Date(cached.createdAt).getTime() < ALBUM_MISS_TTL) return null;
    const album = await provider.album(artist, title);
    database.prepare('INSERT OR REPLACE INTO album_lookup_cache (cache_key, album, created_at) VALUES (?, ?, ?)').run(key, album, timestamp());
    return album;
  }

  async function enrichGigAlbums(gigId, forceMissing = false) {
    const gig = database.prepare('SELECT artist, songs FROM gigs WHERE id = ?').get(gigId);
    if (!gig) throw new Error('Gig not found.');
    const songs = JSON.parse(gig.songs || '[]');
    const missing = (song) => !String(song.album || '').trim() || /^unknown album$/i.test(String(song.album).trim());
    if (forceMissing) songs.filter(missing).forEach((song) => database.prepare('DELETE FROM album_lookup_cache WHERE cache_key = ?').run(albumKey(song.artist || gig.artist, song.title)));
    const enriched = await Promise.all(songs.map(async (song) => missing(song)
      ? { ...song, album: await resolveAlbum(song.artist || gig.artist, song.title) || null }
      : song));
    database.prepare('UPDATE gigs SET songs = ? WHERE id = ?').run(JSON.stringify(enriched), gigId);
    const albums = {};
    enriched.forEach((song) => { const album = song.album || 'Unknown album'; albums[album] = (albums[album] || 0) + 1; });
    return { songs: enriched, albums };
  }

  async function searchYouTubeForGig(gig) {
    const accessToken = await getAccessToken('youtube');
    const matches = [];
    for (const [index, song] of gig.songs.entries()) {
      const cacheKey = `${gig.id}:${index}:${gig.artist}:${gig.venue}:${gig.date || ''}:embed-v3`;
      const cached = database.prepare('SELECT results, created_at AS createdAt FROM youtube_search_cache WHERE cache_key = ?').get(cacheKey);
      if (cached && now().getTime() - Date.parse(cached.createdAt) < YOUTUBE_SEARCH_TTL) {
        matches.push({ index, title: song.title, results: JSON.parse(cached.results) });
        continue;
      }
      const results = await youtubeProvider.searchLiveVideos({ gig, song, accessToken });
      database.prepare('INSERT INTO youtube_search_cache (cache_key, results, created_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET results = excluded.results, created_at = excluded.created_at')
        .run(cacheKey, JSON.stringify(results), timestamp());
      matches.push({ index, title: song.title, results });
    }
    return matches;
  }

  async function refreshYouTubePlaybackMetadata(_gigId, media) {
    const staleBefore = now().getTime() - YOUTUBE_METADATA_TTL;
    const pending = media.filter((item) => item.mimeType === 'video/youtube' && youtubeVideoId(item.externalUrl || item.url) && (!item.sourceMetadataAt || Date.parse(item.sourceMetadataAt) < staleBefore));
    if (!pending.length) return null;
    if (!youtubeConfigured()) return 'YouTube metadata is not configured; title and AudD matching were used instead.';
    try {
      const accessToken = await getAccessToken('youtube');
      const byVideoId = new Map(pending.map((item) => [youtubeVideoId(item.externalUrl || item.url), item]));
      const videos = await youtubeProvider.videoMetadata({ videoIds: [...byVideoId.keys()], accessToken });
      const updatedAt = timestamp();
      const update = database.prepare('UPDATE gig_media SET caption = ?, source_description = ?, source_duration = ?, source_metadata_at = ? WHERE id = ?');
      const markChecked = database.prepare('UPDATE gig_media SET source_metadata_at = ? WHERE id = ?');
      const seen = new Set();
      videos.forEach((video) => {
        const item = byVideoId.get(video.id);
        if (!item) return;
        seen.add(video.id);
        const caption = !item.caption || item.caption === 'YouTube video' ? video.snippet?.title || item.caption : item.caption;
        update.run(caption, video.snippet?.description || '', isoDurationSeconds(video.contentDetails?.duration), updatedAt, item.id);
      });
      pending.forEach((item) => { if (!seen.has(youtubeVideoId(item.externalUrl || item.url))) markChecked.run(updatedAt, item.id); });
      return null;
    } catch (error) { return `YouTube metadata could not be refreshed: ${error.message}`; }
  }

  return { cachedArtistGenres, saveArtistGenres, fetchArtistGenres, archiveGenreStats, fetchArtistInfo, fetchVenueInfo, resolveAlbum, enrichGigAlbums, searchYouTubeForGig, refreshYouTubePlaybackMetadata };
}

module.exports = { createMetadataCache };
