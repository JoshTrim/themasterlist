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
  test('builds anniversaries, milestones, recurring tracks, deep cuts and recent media', () => {
    const archive = Array.from({ length: 10 }, (_, index) => ({
      id: `g${index + 1}`, artist: index < 5 ? 'Poppy' : `Artist ${index}`, venue: index < 5 ? 'The Tivoli' : `Venue ${index}`,
      city: 'Brisbane', date: `${2015 + index}-07-19`, songs: [{ title: 'Recurring song' }, { title: `Unique ${index}` }],
      media: index === 9 ? [{ id: 'photo', mimeType: 'image/jpeg', url: '/photo', createdAt: '2026-07-18T00:00:00Z' }] : []
    }));
    const discovery = overview.buildDiscovery(archive, new Date(2026, 6, 19));
    assert.equal(discovery.onThisDay.length, 10);
    assert.deepEqual(discovery.mostPlayed[0], { artist: 'Poppy', title: 'Recurring song', count: 5, shows: archive.slice(0, 5) });
    assert.equal(discovery.deepCuts.length, 6);
    assert.ok(discovery.milestones.some((entry) => entry.label === '10th show'));
    assert.ok(discovery.milestones.some((entry) => entry.label === '5th Poppy show'));
    assert.ok(discovery.milestones.some((entry) => entry.label === '5th visit'));
    assert.equal(discovery.recentMedia[0].gig.id, 'g10');
  });
  test('renders discovery sections and spins memory roulette without navigating', async () => {
    const rouletteButton = { addEventListener(_type, handler) { this.handler = handler; } }; const rouletteResult = { innerHTML: '' };
    const discovery = { innerHTML: '', querySelector(selector) { return selector === '.roulette-spin' ? rouletteButton : selector === '.roulette-result' ? rouletteResult : null; } };
    const dashboard = { innerHTML: '' }; const genreNote = { textContent: '' }; const genreChart = { innerHTML: '' };
    const records = [
      { id: 'one', artist: '<Poppy>', venue: 'Hall', city: 'Brisbane', date: '2024-07-19', favorite: false, songs: [{ title: 'Track' }], media: [] },
      { id: 'two', artist: 'NIN', venue: 'Stage', city: 'Brisbane', date: '2025-01-01', favorite: false, songs: [{ title: 'Track' }], media: [] }
    ];
    let randomCall = 0;
    const controller = overview.createController({ page: 'overview', getGigs: () => records, getRemoteShows: () => [], now: () => new Date(2026, 6, 19), random: () => randomCall++ ? 0.99 : 0,
      loadMetadata: async () => ({ artists: [], venues: [], locations: [] }), missingFields: () => ['missing'], fetchJson: async (url) => url === '/api/stats' ? overview.buildLocalStats(records) : { genres: [] },
      escapeHtml: (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'), formatDate: (value) => value,
      elements: { dashboard, discovery, genres: {}, genreNote, genreChart } });
    await controller.render();
    assert.match(discovery.innerHTML, /On this day/);
    assert.match(discovery.innerHTML, /&lt;Poppy&gt;/);
    assert.match(discovery.innerHTML, /Most played live/);
    rouletteButton.handler();
    assert.match(rouletteResult.innerHTML, /NIN/);
  });
  test('keeps local dashboard output when the stats API fails and renders genre data', async () => {
    const dashboard = { innerHTML: '' }; const genreNote = { textContent: '' }; const genreChart = { innerHTML: '' };
    const controller = overview.createController({ page: 'overview', getGigs: () => gigs, getRemoteShows: () => [], loadMetadata: async () => ({ artists: [], venues: [], locations: [] }), missingFields: () => ['missing'], fetchJson: async (url) => { if (url === '/api/stats') throw new Error('offline'); return { genres: [{ genre: 'Rock', shows: 2, percentage: 100 }] }; }, escapeHtml: String, elements: { dashboard, genres: {}, genreNote, genreChart } });
    await controller.render();
    assert.match(dashboard.innerHTML, /3<\/strong> shows/); assert.match(genreChart.innerHTML, /Rock/); assert.match(genreNote.textContent, /2 shows/);
  });
});
