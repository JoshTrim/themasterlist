const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSetlistRoutes } = require('../lib/routes/setlists');

test('setlist routes dispatch searches and forced album refreshes', async () => {
  const calls = []; const replies = [];
  const handle = createSetlistRoutes({ provider: { search: async (query) => { calls.push(query); return { total: 0, setlists: [] }; } }, enrichAlbums: async (...args) => { calls.push(args); return { songs: [] }; }, sendJson: (_r, status, payload) => replies.push({ status, payload }), sendError: () => {} });
  await handle({ method: 'GET' }, {}, new URL('http://x/api/setlists/search?artistName=Poppy&cityName=Brisbane'));
  await handle({ method: 'GET' }, {}, new URL('http://x/api/gigs/gig-1/album-stats?refresh=1'));
  assert.deepEqual(calls, [{ artistName: 'Poppy', cityName: 'Brisbane', eventDate: undefined }, ['gig-1', true]]);
  assert.equal(replies.length, 2);
});
