const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const locationsPage = require('../public/lib/locations-page');

const escapeHtml = (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function classList() { const values = new Set(); return { add: (name) => values.add(name), remove: (name) => values.delete(name), contains: (name) => values.has(name) }; }

describe('city and map pages', () => {
  const gigs = [
    { artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane' },
    { artist: 'NIN', venue: 'The Tivoli', city: 'Brisbane' },
    { artist: 'Poppy', venue: 'Riverstage', city: 'Brisbane' },
    { artist: 'NIN', venue: 'Elsewhere', city: 'Sydney' }
  ];

  test('groups city venues case-insensitively with show counts', () => {
    assert.deepEqual(locationsPage.cityVenues(gigs, 'BRISBANE'), [
      { venue: 'The Tivoli', city: 'Brisbane', shows: 2 },
      { venue: 'Riverstage', city: 'Brisbane', shows: 1 }
    ]);
  });

  test('escapes venue and artist map markup while preserving links', () => {
    const venue = locationsPage.cityVenueMarkup({ venue: '<Tivoli>', city: 'Brisbane', shows: 2 }, escapeHtml);
    assert.match(venue, /&lt;Tivoli&gt;/);
    assert.match(venue, /name=%3CTivoli%3E/);
    const popup = locationsPage.popupMarkup({ venue: 'The Tivoli', city: 'Brisbane', gigs: [{ artist: '<Poppy>', date: '' }] }, escapeHtml);
    assert.match(popup, /&lt;Poppy&gt;/);
    assert.match(popup, /Date unknown/);
  });

  test('renders a city page from its URL query', () => {
    const elements = { heading: { textContent: '' }, subtitle: { textContent: '' }, venues: { innerHTML: '' } };
    const controller = locationsPage.createCityController({ page: 'city', window: { location: { search: '?name=Brisbane' } }, getGigs: () => gigs, escapeHtml, elements });
    controller.render();
    assert.equal(elements.heading.textContent, 'Brisbane');
    assert.equal(elements.subtitle.textContent, '2 venues in this area');
    assert.match(elements.venues.innerHTML, /2 shows/);
  });

  test('does not load map dependencies before a show exists', async () => {
    let loaded = false;
    const elements = { button: { disabled: false, textContent: '', addEventListener() {} }, message: { textContent: '', classList: classList() }, mapElement: { hidden: true } };
    const controller = locationsPage.createMapController({ page: 'map', getGigs: () => [], loadLeaflet: async () => { loaded = true; }, getLeaflet: () => ({}), fetchJson: async () => ({}), escapeHtml, elements });
    await controller.load();
    assert.equal(loaded, false);
    assert.match(elements.message.textContent, /Add a show first/);
  });

  test('loads Leaflet, places markers and restores refresh controls', async () => {
    const calls = { markers: 0, setView: 0, invalidated: 0 };
    const map = { setView: () => { calls.setView += 1; }, fitBounds() {}, invalidateSize: () => { calls.invalidated += 1; } };
    const layer = { clearLayers() {} };
    const L = {
      map: () => map,
      tileLayer: () => ({ addTo: () => ({}) }),
      layerGroup: () => ({ addTo: () => layer }),
      circleMarker: () => ({ bindPopup: () => ({ addTo: () => { calls.markers += 1; } }) })
    };
    const elements = { button: { disabled: false, textContent: '', addEventListener() {} }, message: { textContent: '', classList: classList() }, mapElement: { hidden: true } };
    const controller = locationsPage.createMapController({
      page: 'map', getGigs: () => gigs, loadLeaflet: async () => {}, getLeaflet: () => L,
      fetchJson: async () => ({ locations: [{ venue: 'The Tivoli', city: 'Brisbane', lat: -27, lng: 153, gigs: [{ artist: 'Poppy', date: '2026-01-01' }] }] }),
      escapeHtml, setTimeoutFn: (callback) => callback(), elements
    });
    await controller.load();
    assert.equal(calls.markers, 1);
    assert.equal(calls.setView, 1);
    assert.equal(calls.invalidated, 1);
    assert.equal(elements.mapElement.hidden, false);
    assert.equal(elements.button.textContent, 'Refresh map');
    assert.equal(elements.button.disabled, false);
  });
});
