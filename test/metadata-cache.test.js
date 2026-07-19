'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { normaliseGenres } = require('../lib/validation');
const { youtubeVideoId, isoDurationSeconds } = require('../lib/playback');
const { createMetadataCache } = require('../lib/metadata-cache');

function fixture(overrides = {}) {
  const database = new Database(':memory:');
  migrateSchema(database);
  const calls = { artistInfo: 0, venueInfo: 0, album: 0, search: 0, metadata: 0 };
  const provider = {
    artistGenre: async () => 'Rock',
    artistInfo: async (name) => { calls.artistInfo += 1; return { name, title: name, description: 'auto', bio: 'auto', image: null, source: 'provider' }; },
    venueInfo: async (name, city) => { calls.venueInfo += 1; return { name, city, title: name, description: 'auto', bio: 'auto', image: null, source: 'provider' }; },
    album: async () => { calls.album += 1; return 'Found Album'; },
    ...overrides.provider
  };
  const youtubeProvider = {
    searchLiveVideos: async () => { calls.search += 1; return [{ id: 'video' }]; },
    videoMetadata: async () => { calls.metadata += 1; return []; },
    ...overrides.youtubeProvider
  };
  const service = createMetadataCache({
    database, provider, youtubeProvider, normaliseGenres, youtubeVideoId, isoDurationSeconds,
    getAccessToken: async () => 'token', youtubeConfigured: () => true,
    now: overrides.now || (() => new Date('2026-07-19T00:00:00.000Z'))
  });
  return { database, calls, service };
}

test('manual artist and venue metadata is returned without automated replacement', async (context) => {
  const { database, calls, service } = fixture();
  context.after(() => database.close());
  database.prepare('INSERT INTO artist_info (lookup_name,title,description,bio,image,is_manual,source,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('artist', 'My Artist', 'manual description', 'manual bio', 'manual.jpg', 1, 'manual', 'now');
  database.prepare('INSERT INTO venue_info (lookup_name,title,description,bio,image,is_manual,source,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('hall|city', 'My Hall', 'manual description', 'manual bio', 'hall.jpg', 1, 'manual', 'now');

  assert.equal((await service.fetchArtistInfo('Artist')).bio, 'manual bio');
  assert.equal((await service.fetchVenueInfo('Hall', 'City')).bio, 'manual bio');
  assert.deepEqual({ artistInfo: calls.artistInfo, venueInfo: calls.venueInfo }, { artistInfo: 0, venueInfo: 0 });
});

test('album enrichment fills only missing metadata and preserves manual album choices', async (context) => {
  const { database, calls, service } = fixture();
  context.after(() => database.close());
  database.prepare('INSERT INTO gigs (id,artist,venue,city,date,songs,created_at) VALUES (?,?,?,?,?,?,?)')
    .run('gig', 'Artist', 'Hall', 'City', '2026-01-01', JSON.stringify([{ title: 'Known', album: 'Manual Album' }, { title: 'Missing' }]), 'now');

  const result = await service.enrichGigAlbums('gig');
  assert.deepEqual(result.songs.map((song) => song.album), ['Manual Album', 'Found Album']);
  assert.equal(calls.album, 1);
});

test('album misses use the seven-day negative cache', async (context) => {
  const { database, calls, service } = fixture({ provider: { album: async () => { calls.album += 1; return null; } } });
  context.after(() => database.close());
  assert.equal(await service.resolveAlbum('Artist', 'Song'), null);
  assert.equal(await service.resolveAlbum('Artist', 'Song'), null);
  assert.equal(calls.album, 1);
});

test('YouTube search results are reused for a day', async (context) => {
  const { database, calls, service } = fixture();
  context.after(() => database.close());
  const gig = { id: 'gig', artist: 'Artist', venue: 'Hall', date: '2026-01-01', songs: [{ title: 'Song' }] };
  assert.deepEqual(await service.searchYouTubeForGig(gig), await service.searchYouTubeForGig(gig));
  assert.equal(calls.search, 1);
});

test('YouTube refresh preserves a user caption while updating source metadata', async (context) => {
  const { database, service } = fixture({ youtubeProvider: { videoMetadata: async () => [{ id: 'abc123', snippet: { title: 'Provider title', description: 'Details' }, contentDetails: { duration: 'PT2M' } }] } });
  context.after(() => database.close());
  database.prepare('INSERT INTO gigs (id,artist,venue,city,date,songs,created_at) VALUES (?,?,?,?,?,?,?)').run('gig', 'Artist', 'Hall', 'City', '2026-01-01', '[]', 'now');
  database.prepare('INSERT INTO gig_media (id,gig_id,filename,mime_type,caption,external_url,size,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('media', 'gig', 'youtube', 'video/youtube', 'My caption', 'https://youtube.com/watch?v=abc123', 0, 'now');
  await service.refreshYouTubePlaybackMetadata('gig', [{ id: 'media', mimeType: 'video/youtube', caption: 'My caption', externalUrl: 'https://youtube.com/watch?v=abc123' }]);
  const row = database.prepare('SELECT caption,source_description AS description,source_duration AS duration FROM gig_media WHERE id=?').get('media');
  assert.deepEqual(row, { caption: 'My caption', description: 'Details', duration: 120 });
});
