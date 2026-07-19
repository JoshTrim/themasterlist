const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const directoryPage = require('../public/lib/directory-page');

const escapeHtml = (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const formatGigDate = (value) => value;
const initials = (name) => name.slice(0, 2).toUpperCase();

function controlSet() {
  const listeners = {};
  return {
    filter: { value: '', addEventListener: (name, handler) => { listeners[`filter-${name}`] = handler; } },
    metadata: { value: 'all', options: [{ value: 'all' }, { value: 'incomplete' }], addEventListener: (name, handler) => { listeners[`metadata-${name}`] = handler; } },
    sort: { value: 'name', addEventListener: (name, handler) => { listeners[`sort-${name}`] = handler; } },
    summary: { textContent: '' }, grid: { innerHTML: '', querySelectorAll: () => [] }, listeners
  };
}

describe('artist and venue directory page', () => {
  test('loads directory metadata once and degrades to empty collections', async () => {
    let requests = 0;
    const loader = directoryPage.createMetadataLoader({
      fetchJson: async (endpoint) => { requests += 1; assert.equal(endpoint, '/api/directory/metadata'); throw new Error('offline'); }
    });
    const [first, second] = await Promise.all([loader.load(), loader.load()]);
    assert.equal(requests, 1);
    assert.deepEqual(first, { artists: [], venues: [], locations: [] });
    assert.equal(first, second);
  });

  test('only renders actionable metadata badges and hides source-only venue gaps', () => {
    assert.equal(directoryPage.metadataBadges({ isClosed: false, missingMetadata: [] }, escapeHtml), '');
    const venue = directoryPage.metadataBadges({ isClosed: true, missingMetadata: ['source', 'bio'] }, escapeHtml, { venue: true });
    assert.match(venue, /Permanently closed/);
    assert.match(venue, /Missing biography/);
    assert.doesNotMatch(venue, /source/);
  });

  test('builds escaped artist and venue cards with profile edit links', () => {
    const artist = { name: '<Poppy>', shows: 2, venues: new Set(['one']), averageRating: 4.5, favourites: 1, latestDate: '2026-01-01', description: '', image: '', imagePosition: 'center', missingMetadata: ['bio'] };
    const artistMarkup = directoryPage.artistCardMarkup(artist, { escapeHtml, formatGigDate, initials });
    assert.match(artistMarkup, /&lt;Poppy&gt;/);
    assert.match(artistMarkup, /artist\/edit\?name=%3CPoppy%3E/);
    const venue = { name: 'The Tivoli', city: 'Brisbane', shows: 2, artists: new Set(['Poppy']), latestDate: '2026-01-01', description: '', image: '', imagePosition: 'center', hasLocation: true, isClosed: false, missingMetadata: [] };
    const venueMarkup = directoryPage.venueCardMarkup(venue, { escapeHtml, formatGigDate, initials });
    assert.match(venueMarkup, /city=Brisbane/);
    assert.match(venueMarkup, /Last visited/);
  });

  test('renders and filters the artist directory through its controller', async () => {
    const artists = controlSet();
    const venues = controlSet();
    const entity = { name: 'Poppy', shows: 1, venues: new Set(['one']), averageRating: 5, favourites: 1, latestDate: '2026-01-01', description: '', image: '', imagePosition: 'center', missingMetadata: ['bio'] };
    const directoryUi = {
      buildArtists: () => [entity], buildVenues: () => [], initials,
      visibleEntities: (entities, filters) => filters.metadata === 'complete' ? [] : entities
    };
    const hydrated = [];
    const controller = directoryPage.createController({
      page: 'artists', window: { location: { search: '?metadata=incomplete' } }, getShows: () => [{}], getRemoteShows: () => [],
      loadMetadata: async () => ({ artists: [], venues: [], locations: [] }), directoryUi, escapeHtml, formatGigDate,
      hydrator: { hydrate: (_grid, type) => hydrated.push(type) }, elements: { artists, venues }
    });
    await controller.render();
    assert.equal(artists.metadata.value, 'incomplete');
    assert.equal(artists.summary.textContent, '1 of 1 artist · 1 need review');
    assert.match(artists.grid.innerHTML, /Poppy/);
    assert.deepEqual(hydrated, ['artist']);
  });

  test('deduplicates lazy metadata requests for the same entity', async () => {
    let requests = 0;
    const hydrator = directoryPage.createHydrator({ window: {}, document: {}, fetchJson: async () => { requests += 1; return {}; }, missingFields: () => [], escapeHtml });
    await Promise.all([hydrator.entityInfo('artist', 'Poppy'), hydrator.entityInfo('artist', 'Poppy')]);
    assert.equal(requests, 1);
  });
});
