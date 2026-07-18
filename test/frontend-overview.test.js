const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const overview = require('../public/lib/overview-page');

describe('overview statistics', () => {
  const gigs = [
    { artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', favorite: true, songs: [{}, {}] },
    { artist: 'Poppy', venue: 'Riverstage', city: 'Brisbane', favorite: false, songs: [{}] },
    { artist: 'NIN', venue: 'Riverstage', city: 'Brisbane', favorite: true, songs: [] }
  ];
  test('builds local totals and ranked artists and venues', () => {
    const stats = overview.buildLocalStats(gigs);
    assert.deepEqual({ shows: stats.shows, artists: stats.artists, venues: stats.venues, cities: stats.cities, songs: stats.songs, favourites: stats.favourites }, { shows: 3, artists: 2, venues: 2, cities: 1, songs: 3, favourites: 2 });
    assert.deepEqual(stats.topArtists[0], ['Poppy', 2]); assert.deepEqual(stats.topVenues[0], ['Riverstage', 'Brisbane', 2]);
  });
  test('calculates metadata completion across local and remote shows', () => {
    const metadata = { artists: [{ lookupName: 'poppy', image: 'x' }], venues: [{ lookupName: 'the tivoli|brisbane', image: 'x' }], locations: ['the tivoli|brisbane'] };
    const missing = (_type, info, located = true) => info && located ? [] : ['missing'];
    const completion = overview.buildCompletion(gigs, metadata, missing);
    assert.deepEqual(completion.artists, { complete: 1, total: 2, percentage: 50 });
    assert.deepEqual(completion.venues, { complete: 1, total: 2, percentage: 50 });
  });
  test('keeps local dashboard output when the stats API fails and renders genre data', async () => {
    const dashboard = { innerHTML: '' }; const genreNote = { textContent: '' }; const genreChart = { innerHTML: '' };
    const controller = overview.createController({ page: 'overview', getGigs: () => gigs, getRemoteShows: () => [], loadMetadata: async () => ({ artists: [], venues: [], locations: [] }), missingFields: () => ['missing'], fetchJson: async (url) => { if (url === '/api/stats') throw new Error('offline'); return { genres: [{ genre: 'Rock', shows: 2, percentage: 100 }] }; }, escapeHtml: String, elements: { dashboard, genres: {}, genreNote, genreChart } });
    await controller.render();
    assert.match(dashboard.innerHTML, /3<\/strong> shows/); assert.match(genreChart.innerHTML, /Rock/); assert.match(genreNote.textContent, /2 shows/);
  });
});
