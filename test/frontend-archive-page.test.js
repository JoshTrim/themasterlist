const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const archive = require('../public/lib/archive-page');

describe('show archive page controller', () => {
  test('keeps remote peer shows without duplicating local shared records', () => {
    const gigs = [{ id: 'local', sharedId: 'shared-local' }];
    const sharedShows = [
      { id: 'shared-local', contributions: [{}] },
      { id: 'legacy', contributions: [] },
      { id: 'remote', contributions: [{}] },
      { id: 'other', sourceGigId: 'local', contributions: [{}] }
    ];
    assert.deepEqual(archive.remoteSharedShows(gigs, sharedShows).map((show) => show.id), ['remote']);
  });

  test('builds compact artist initials with a musical fallback', () => {
    assert.equal(archive.artistInitials('The Flaming Lips'), 'TF');
    assert.equal(archive.artistInitials('Poppy'), 'P');
    assert.equal(archive.artistInitials(''), '♪');
  });

  test('renders archive totals, filters and empty state through existing card models', () => {
    const state = { gigs: [], sharedShows: [] };
    const list = {
      children: [], replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); },
      querySelectorAll: () => []
    };
    const elements = {
      count: { textContent: '' }, stats: { innerHTML: '' }, list, empty: { hidden: true },
      queryInput: { value: '', addEventListener() {} }, yearInput: { value: '', addEventListener() {}, replaceChildren() {}, add() {} },
      sortInput: { value: 'newest', addEventListener() {} }, favouriteInput: { checked: false, addEventListener() {} }, template: {}
    };
    let selectionInput;
    const showsModule = {
      archiveStats: () => ({ shows: 0, artists: 0, venues: 0, favourites: 0, songs: 0 }),
      selectArchiveShows: (input) => { selectionInput = input; return { local: [], remote: [] }; },
      compareDates: () => 0
    };
    const controller = archive.createController({
      window: { location: { hash: '' }, confirm: () => true, requestAnimationFrame() {} }, document: {},
      OptionClass: class {}, fetchJson: async () => ({}), escapeHtml: String, formatDate: String,
      showsModule, cardsModule: {}, getState: () => state, onGigs() {}, setMessage() {}, renderAttendeeSummary() {},
      setupSetlist() {}, setupExports() {}, renderMediaGallery() {}, elements
    });
    const result = controller.render();
    assert.deepEqual(result, { local: [], remote: [] });
    assert.equal(elements.count.textContent, '0 shows');
    assert.match(elements.stats.innerHTML, /0 artists/);
    assert.equal(elements.empty.hidden, false);
    assert.equal(selectionInput.sort, 'newest');
  });

  test('populates distinct archive years while preserving the selected filter', () => {
    class OptionStub { constructor(label, value) { this.label = label; this.value = value; } }
    const options = [];
    const yearInput = { value: '2025', replaceChildren(option) { options.splice(0, options.length, option); }, add(option) { options.push(option); }, addEventListener() {} };
    const controller = archive.createController({
      window: {}, document: {}, OptionClass: OptionStub, fetchJson: async () => ({}), escapeHtml: String, formatDate: String,
      showsModule: {}, cardsModule: {}, getState: () => ({ gigs: [{ date: '2025-01-01' }, { date: '2024-02-02' }], sharedShows: [{ date: '2026-03-03', contributions: [{}] }] }),
      onGigs() {}, setMessage() {}, renderAttendeeSummary() {}, setupSetlist() {}, setupExports() {}, renderMediaGallery() {},
      elements: { yearInput, count: {}, stats: {}, list: {}, empty: {}, queryInput: null, sortInput: null, favouriteInput: null, template: {} }
    });
    controller.populateYears();
    assert.deepEqual(options.map((option) => option.value), ['', '2026', '2025', '2024']);
    assert.equal(yearInput.value, '2025');
  });
});
