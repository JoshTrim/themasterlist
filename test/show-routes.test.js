const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createGigRepository } = require('../lib/gigs');
const { createShowRoutes } = require('../lib/routes/shows');
const { validateGig, normaliseRating } = require('../lib/validation');

test('show routes create, update, list and delete without replacing track metadata', async () => {
  const database = new Database(':memory:'); migrateSchema(database);
  const repository = createGigRepository({ database, mediaRows: () => [] });
  let body = { artist: ' Artist ', venue: ' Venue ', city: ' Brisbane ', date: '2026-01-01', songs: [{ title: 'Song', album: 'Album', info: 'keep' }] };
  const replies = [];
  let id = 0;
  const handle = createShowRoutes({ database, readGigs: repository.readAll, readBody: async () => body, sendJson: (_r, status, payload) => replies.push({ status, payload }), sendError: (_r, status, error) => replies.push({ status, error }), validateGig, normaliseRating, normaliseAttendees: (items) => items || [], randomUUID: () => `id-${++id}`, now: () => '2026-01-01T00:00:00.000Z' });
  await handle({ method: 'POST', account: {} }, {}, new URL('http://x/api/gigs'));
  assert.equal(replies[0].status, 201); assert.equal(replies[0].payload.artist, 'Artist');
  body = { songs: [{ title: 'Renamed' }] };
  await handle({ method: 'PATCH', account: {} }, {}, new URL('http://x/api/gigs/id-1'));
  assert.equal(replies[1].payload.songs[0].album, 'Album'); assert.equal(replies[1].payload.songs[0].info, 'keep');
  await handle({ method: 'GET' }, {}, new URL('http://x/api/gigs'));
  assert.equal(replies[2].payload.length, 1);
  await handle({ method: 'DELETE' }, {}, new URL('http://x/api/gigs/id-1'));
  assert.deepEqual(replies[3], { status: 200, payload: { ok: true } }); database.close();
});
