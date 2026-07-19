const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const youtubeSearch = require('../public/lib/youtube-show-search');

function classList() {
  const values = new Set();
  return { add: (name) => values.add(name), remove: (name) => values.delete(name), contains: (name) => values.has(name) };
}

function fixture(gig, fetchJson) {
  const searchButton = { disabled: false, textContent: '', addEventListener(_type, handler) { this.handler = handler; } };
  const results = { innerHTML: '', replaceChildren() { this.innerHTML = ''; }, querySelectorAll: () => [] };
  const message = { textContent: '', classList: classList() };
  const renders = [];
  const controller = youtubeSearch.createController({
    fetchJson, escapeHtml: (value) => String(value).replaceAll('&', '&amp;'),
    getGigs: () => gig ? [gig] : [], showId: gig?.id || 'missing',
    renderMediaGallery: (...args) => renders.push(args),
    elements: { searchButton, results, message, gallery: { id: 'gallery' } }
  });
  controller.bind();
  return { controller, searchButton, results, message, renders };
}

describe('show YouTube search controller', () => {
  test('renders escaped event matches and empty result groups', () => {
    const markup = youtubeSearch.resultsMarkup([
      { index: 1, title: 'Song & encore', results: [{ id: 'abc 123', title: '<Live>', channel: 'Band', thumbnail: 'thumb', description: 'Venue & date' }] },
      { index: 2, title: 'No video', results: [] }
    ], (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'));
    assert.match(markup, /Song &amp; encore/);
    assert.match(markup, /&lt;Live>/);
    assert.match(markup, /watch\?v=abc%20123/);
    assert.match(markup, /No matching videos found/);
  });

  test('requires a setlist before making an API request', async () => {
    let requests = 0;
    const view = fixture({ id: 'g1', songs: [] }, async () => { requests += 1; });
    const matches = await view.controller.search();
    assert.deepEqual(matches, []);
    assert.equal(requests, 0);
    assert.equal(view.message.textContent, 'Add a setlist before searching YouTube.');
  });

  test('searches the current show and restores the search control', async () => {
    const view = fixture({ id: 'g1', songs: [{ title: 'Opening' }] }, async (url, options) => {
      assert.equal(url, '/api/gigs/g1/youtube-search');
      assert.equal(options.method, 'POST');
      return { matches: [{ index: 0, title: 'Opening', results: [] }] };
    });
    const matches = await view.searchButton.handler();
    assert.equal(matches.length, 1);
    assert.match(view.results.innerHTML, /Opening/);
    assert.equal(view.searchButton.disabled, false);
    assert.equal(view.searchButton.textContent, 'Find YouTube videos');
    assert.equal(view.message.classList.contains('error'), false);
  });

  test('attaches a selected result and refreshes ordinary media', async () => {
    const gig = { id: 'g1', songs: [{ title: 'Opening' }], media: [{ id: 'artifact', category: 'artifact' }] };
    const added = { id: 'youtube', mimeType: 'video/youtube' };
    const view = fixture(gig, async (url, options) => {
      assert.equal(url, '/api/gigs/g1/media');
      assert.deepEqual(JSON.parse(options.body), { externalUrl: 'https://youtu.be/abc', caption: 'Opening live', sourceDescription: 'At the venue', songIndex: 0 });
      return added;
    });
    const result = { dataset: { youtubeDescription: 'At the venue' }, querySelector: () => ({ textContent: 'Opening live' }) };
    const match = { dataset: { songIndex: '0' } };
    const button = {
      disabled: false, textContent: '', dataset: { youtubeUrl: 'https://youtu.be/abc' },
      closest: (selector) => selector === '.youtube-match' ? match : result
    };
    assert.equal(await view.controller.addResult(gig, button), added);
    assert.deepEqual(gig.media, [{ id: 'artifact', category: 'artifact' }, added]);
    assert.deepEqual(view.renders[0][1], [added]);
    assert.equal(button.textContent, 'Added');
  });
});
