const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { validCoordinates, createGeocodingService } = require('../lib/geocoding');

function harness(results = []) {
  let values = {};
  let clock = 1_000;
  const waits = [];
  const requests = [];
  const service = createGeocodingService({
    fetch: async (url, options) => { requests.push({ url: new URL(url), options }); const result = results.shift(); return { ok: Boolean(result), json: async () => result ? [result] : [] }; },
    read: async () => structuredClone(values), write: async (next) => { values = structuredClone(next); },
    now: () => clock, wait: async (milliseconds) => { waits.push(milliseconds); clock += milliseconds; }
  });
  return { service, waits, requests, values: () => values, advance: (milliseconds) => { clock += milliseconds; } };
}

describe('geocoding service', () => {
  test('validates geographic coordinate bounds', () => {
    assert.equal(validCoordinates(-27.4, 153), true);
    assert.equal(validCoordinates(91, 153), false);
    assert.equal(validCoordinates(-27, -181), false);
  });

  test('searches Nominatim with identification headers and throttles requests', async () => {
    const state = harness([{ lat: '-27.4', lon: '153.0' }, { lat: '-33.8', lon: '151.2' }]);
    assert.deepEqual(await state.service.search('The Tivoli Brisbane'), { lat: -27.4, lng: 153 });
    assert.deepEqual(await state.service.search('Sydney Opera House'), { lat: -33.8, lng: 151.2 });
    assert.deepEqual(state.waits, [1_000]);
    assert.equal(state.requests[0].url.searchParams.get('limit'), '1');
    assert.match(state.requests[0].options.headers['User-Agent'], /TheMasterList/);
  });

  test('stores, retrieves and removes normalized venue keys', async () => {
    const state = harness();
    await state.service.set('Venue|Brisbane', { lat: -27.4, lng: 153 });
    assert.deepEqual(await state.service.get('venue|brisbane'), { lat: -27.4, lng: 153 });
    await state.service.remove('VENUE|BRISBANE');
    assert.equal(await state.service.get('venue|brisbane'), null);
  });

  test('maps each uncached venue once and retains failed lookups', async () => {
    const state = harness([{ lat: '-27.4', lon: '153' }, null]);
    const gigs = [
      { id: 'one', artist: 'A', venue: 'Venue', city: 'Brisbane', date: '2026-01-01' },
      { id: 'two', artist: 'B', venue: 'Venue', city: 'Brisbane', date: '2026-02-01' },
      { id: 'three', artist: 'C', venue: 'Missing', city: 'Brisbane', date: '2026-03-01' }
    ];
    const locations = await state.service.locationsForGigs(gigs);
    assert.equal(state.requests.length, 2);
    assert.equal(locations[0].gigs.length, 2);
    assert.equal(state.values()['missing|brisbane'], null);
    await state.service.locationsForGigs(gigs);
    assert.equal(state.requests.length, 2);
  });
});
