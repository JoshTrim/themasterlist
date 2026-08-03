const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createSetlistFmProvider, SetlistProviderError } = require('../lib/providers/setlist-fm');

function jsonResponse(status, body = {}) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

describe('setlist.fm provider', () => {
  test('normalises search parameters and provider results', async () => {
    const requests = [];
    const usage = [];
    const provider = createSetlistFmProvider({
      apiKey: 'secret',
      fetch: async (url, options) => {
        requests.push({ url: new URL(url), options });
        return jsonResponse(200, { total: 1, setlist: [{ id: 'one', artist: { name: 'Poppy' }, venue: { name: 'The Tivoli', city: { name: 'Brisbane' } }, eventDate: '18-07-2026', url: 'https://setlist.fm/one', sets: {} }] });
      },
      recordUsage: (...entry) => usage.push(entry),
      normaliseSongs: () => [{ title: 'Concrete' }]
    });

    const result = await provider.search({ artistName: 'Poppy', cityName: 'Brisbane', eventDate: '2026-07-18' });
    assert.equal(requests[0].url.searchParams.get('date'), '18-07-2026');
    assert.equal(requests[0].options.headers['x-api-key'], 'secret');
    assert.deepEqual(usage, [['setlist.fm', 'search/setlists', 1, 200]]);
    assert.deepEqual(result.setlists[0].songs, [{ title: 'Concrete' }]);
  });

  test('retries without the city when setlist.fm cannot match its label', async () => {
    const requests = [];
    const provider = createSetlistFmProvider({
      apiKey: 'secret',
      fetch: async (url) => { requests.push(new URL(url)); return jsonResponse(404); },
      normaliseSongs: () => []
    });
    assert.deepEqual(await provider.search({ artistName: 'Artist', cityName: 'Hollywood', eventDate: '2026-01-02' }), { total: 0, setlists: [] });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].searchParams.get('cityName'), 'Hollywood');
    assert.equal(requests[1].searchParams.has('cityName'), false);
  });

  test('finds all setlists at the selected venue and date', async () => {
    let requested;
    const provider = createSetlistFmProvider({
      apiKey: 'secret',
      fetch: async (url) => { requested = new URL(url); return jsonResponse(200, { total: 1, setlist: [{ id: 'support', artist: { name: 'Support' }, venue: { id: 'venue-1', name: 'Hall', city: { name: 'City' } }, eventDate: '18-07-2026', sets: {} }] }); },
      normaliseSongs: () => [{ title: 'Opening song' }]
    });
    const result = await provider.searchEvent({ venueId: 'venue-1', eventDate: '2026-07-18' });
    assert.equal(requested.searchParams.get('venueId'), 'venue-1');
    assert.equal(requested.searchParams.get('date'), '18-07-2026');
    assert.equal(result.setlists[0].artist, 'Support');
  });

  test('reports configuration, upstream and network failures consistently', async () => {
    const missing = createSetlistFmProvider({ apiKey: '', fetch: async () => jsonResponse(200), normaliseSongs: () => [] });
    await assert.rejects(missing.search({ artistName: 'A', cityName: 'B' }), (error) => error instanceof SetlistProviderError && error.status === 503);

    const upstream = createSetlistFmProvider({ apiKey: 'secret', fetch: async () => jsonResponse(429), normaliseSongs: () => [] });
    await assert.rejects(upstream.search({ artistName: 'A', cityName: 'B' }), (error) => error.status === 429);

    const usage = [];
    const offline = createSetlistFmProvider({ apiKey: 'secret', fetch: async () => { throw new Error('offline'); }, recordUsage: (...entry) => usage.push(entry), normaliseSongs: () => [] });
    await assert.rejects(offline.search({ artistName: 'A', cityName: 'B' }), /could not be reached/);
    assert.deepEqual(usage, [['setlist.fm', 'search/setlists', 1, null]]);
  });
});
