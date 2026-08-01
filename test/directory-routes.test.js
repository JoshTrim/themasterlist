'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createDirectoryRoutes } = require('../lib/routes/directory');

test('directory routes fetch and persist artist and venue metadata', async () => {
  const database = new Database(':memory:'); migrateSchema(database);
  const replies = []; const coordinates = new Map([['hall|brisbane', { lat: -27.4, lng: 153 }]]);
  const geocoding = {
    read: async () => Object.fromEntries(coordinates), get: async (key) => coordinates.get(key) || null,
    search: async () => ({ lat: -27.5, lng: 153.1 }), set: async (key, value) => coordinates.set(key, value)
  };
  let body = {};
  const handle = createDirectoryRoutes({
    database, requireAccount: () => ({}), readBody: async () => body,
    sendJson: (_response, status, payload, headers) => replies.push({ status, payload, headers }), sendError: (_response, status, error) => replies.push({ status, payload: { error } }),
    fetchArtistInfo: async (name) => ({ name, title: name, imagePosition: 'bad' }),
    refetchArtistInfo: async (name, source) => ({ name, title: 'Fetched Artist', bio: 'Fetched bio', source }),
    fetchVenueInfo: async (name, city) => ({ name, city, title: name }),
    cachedArtistGenres: () => ({ genres: ['Rock'] }), saveArtistGenres: (_name, genres) => genres,
    normaliseImagePosition: (value) => ['top', 'center', 'bottom'].includes(value) ? value : 'center',
    profileImages: { save: async () => null, removeReplaced: async () => {} }, geocoding,
    validCoordinates: (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180,
    now: () => '2026-07-18T00:00:00.000Z'
  });

  assert.equal(await handle({ method: 'GET' }, {}, new URL('http://x/api/artists?name=Poppy')), true);
  assert.deepEqual(replies.pop().payload.genres, ['Rock']);

  body = { source: 'https://en.wikipedia.org/wiki/Poppy_(singer)' };
  await handle({ method: 'POST' }, {}, new URL('http://x/api/artists/refetch?name=Poppy'));
  assert.deepEqual(replies.pop(), { status: 200, headers: undefined, payload: {
    name: 'Poppy', title: 'Fetched Artist', bio: 'Fetched bio', source: body.source, imagePosition: 'center', genres: ['Rock']
  } });

  body = { title: 'Poppy', bio: 'Artist bio', genres: ['Metal'], imagePosition: 'top' };
  await handle({ method: 'PATCH' }, {}, new URL('http://x/api/artists?name=Poppy'));
  assert.equal(database.prepare('SELECT bio FROM artist_info WHERE lookup_name = ?').get('poppy').bio, 'Artist bio');
  assert.deepEqual(replies.pop().payload.genres, ['Metal']);

  body = { bio: 'Venue bio', locationAddress: 'Brisbane Hall', isClosed: 'on' };
  await handle({ method: 'PATCH' }, {}, new URL('http://x/api/venues?name=Hall&city=Brisbane'));
  const venue = database.prepare('SELECT bio, is_closed AS isClosed FROM venue_info WHERE lookup_name = ?').get('hall|brisbane');
  assert.deepEqual(venue, { bio: 'Venue bio', isClosed: 1 });
  assert.deepEqual(coordinates.get('hall|brisbane'), { lat: -27.5, lng: 153.1 });

  await handle({ method: 'GET' }, {}, new URL('http://x/api/directory/metadata'));
  assert.equal(replies.pop().payload.venues.length, 1);
  await handle({ method: 'GET' }, {}, new URL('http://x/api/directory/artist-images'));
  const imageManifest = replies.pop();
  assert.equal(imageManifest.payload[0].lookupName, 'poppy');
  assert.match(imageManifest.headers['Cache-Control'], /private, max-age=60/);
  assert.equal(await handle({ method: 'GET' }, {}, new URL('http://x/api/not-directory')), false);
  database.close();
});
