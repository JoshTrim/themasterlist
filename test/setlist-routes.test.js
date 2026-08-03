const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSetlistRoutes } = require('../lib/routes/setlists');

test('setlist routes dispatch artist, event and forced album searches', async () => {
  const calls = []; const replies = [];
  const handle = createSetlistRoutes({ provider: { search: async (query) => { calls.push(query); return { total: 0, setlists: [] }; }, searchEvent: async (query) => { calls.push(query); return { total: 0, setlists: [] }; } }, enrichAlbums: async (...args) => { calls.push(args); return { songs: [] }; }, sendJson: (_r, status, payload) => replies.push({ status, payload }), sendError: () => {} });
  await handle({ method: 'GET' }, {}, new URL('http://x/api/setlists/search?artistName=Poppy&cityName=Brisbane'));
  await handle({ method: 'GET' }, {}, new URL('http://x/api/setlists/event?venueId=venue-1&eventDate=2026-01-20'));
  await handle({ method: 'GET' }, {}, new URL('http://x/api/gigs/gig-1/album-stats?refresh=1'));
  assert.deepEqual(calls, [{ artistName: 'Poppy', cityName: 'Brisbane', eventDate: undefined }, { venueId: 'venue-1', venueName: undefined, cityName: undefined, eventDate: '2026-01-20' }, ['gig-1', true]]);
  assert.equal(replies.length, 3);
});
