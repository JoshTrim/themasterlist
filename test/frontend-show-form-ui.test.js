const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const showEditor = require('../public/lib/show-editor');
const showFormUi = require('../public/lib/show-form-ui');

function classList() {
  const values = new Set();
  return { toggle: (name, active) => active ? values.add(name) : values.delete(name), contains: (name) => values.has(name) };
}

function fixture(overrides = {}) {
  const lists = Object.fromEntries(['artist-options', 'venue-options', 'city-options'].map((id) => [id, { innerHTML: '' }]));
  const stars = [1, 2, 3, 4, 5].map((value) => ({ value: String(value), classList: classList(), attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, addEventListener(_type, handler) { this.handler = handler; } }));
  const ratingInput = { value: '' };
  const picker = { closest: () => ({ querySelector: () => ratingInput }), querySelectorAll: () => stars };
  const favorite = {
    attrs: { 'aria-pressed': 'false' }, heart: { textContent: '♡' },
    setAttribute(name, value) { this.attrs[name] = value; }, getAttribute(name) { return this.attrs[name]; },
    querySelector: () => favorite.heart, addEventListener(_type, handler) { this.handler = handler; }
  };
  const message = { textContent: '', classList: classList() };
  const addForm = { elements: { favorite: { value: '' } } };
  const document = {
    querySelector: (selector) => lists[selector.slice(1)] || null,
    querySelectorAll: (selector) => selector === '.star-picker' ? [picker] : [],
    createElement: () => ({})
  };
  const state = {
    gigs: overrides.gigs || [], sharedShows: overrides.sharedShows || [], peers: overrides.peers || [],
    account: overrides.account || { id: 'owner', name: 'Archive Owner' }
  };
  const controller = showFormUi.createController({
    document, window: { confirm: overrides.confirm || (() => true) }, editor: showEditor,
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;'), formatGigDate: (date) => `date:${date}`,
    getGigs: () => state.gigs, getSharedShows: () => state.sharedShows,
    getPeers: () => state.peers, getAccount: () => state.account,
    elements: { addForm, favoriteChoice: favorite, message, editForm: null, editAttendeePicker: null }
  });
  controller.bind();
  return { controller, lists, picker, stars, ratingInput, favorite, addForm, message };
}

describe('show form UI controller', () => {
  test('populates sorted, deduplicated archive suggestions safely', () => {
    const view = fixture({ gigs: [{ artist: 'Zed', venue: 'Hall & Bar', city: 'Brisbane' }, { artist: 'Alpha', venue: 'Hall & Bar', city: 'Brisbane' }] });
    view.controller.populateAutofill();
    assert.equal(view.lists['artist-options'].innerHTML, '<option value="Alpha"></option><option value="Zed"></option>');
    assert.equal(view.lists['venue-options'].innerHTML, '<option value="Hall &amp; Bar"></option>');
    assert.equal(view.lists['city-options'].innerHTML, '<option value="Brisbane"></option>');
  });

  test('updates rating and favourite controls with their form values', () => {
    const view = fixture();
    view.controller.setRatingPicker(view.picker, 3);
    assert.equal(view.ratingInput.value, 3);
    assert.equal(view.stars[2].classList.contains('selected'), true);
    assert.equal(view.stars[3].classList.contains('selected'), false);
    view.favorite.handler();
    assert.equal(view.addForm.elements.favorite.value, 'true');
    assert.equal(view.favorite.heart.textContent, '♥');
  });

  test('renders duplicate details and delegates the explicit confirmation', () => {
    let confirmations = 0;
    const existing = { id: 'g1', artist: 'Band', venue: 'Hall', city: 'City', date: '2026-01-01' };
    const view = fixture({ gigs: [existing], confirm: () => { confirmations += 1; return false; } });
    const warning = { hidden: true, innerHTML: '' };
    const values = { artist: 'band', venue: 'hall', city: 'city', date: '2026-01-01' };
    assert.equal(view.controller.confirmDuplicateSave(warning, values), false);
    assert.equal(confirmations, 1);
    assert.equal(warning.hidden, false);
    assert.match(warning.innerHTML, /Possible duplicate show/);
    assert.match(warning.innerHTML, /\/show\?id=g1/);
  });

  test('renders paired attendees and reads checked selections', () => {
    const view = fixture({ peers: [{ peerId: 'peer', name: 'Friend' }] });
    const options = { innerHTML: '' };
    const inputs = [{ checked: true, value: 'peer', dataset: { attendeeType: 'peer' } }];
    const container = { querySelector: () => options, querySelectorAll: () => inputs };
    view.controller.renderAttendees(container, [{ id: 'peer' }]);
    assert.match(options.innerHTML, /Archive Owner \(you\)/);
    assert.match(options.innerHTML, /Friend/);
    assert.deepEqual(view.controller.readAttendees(container), [{ id: 'peer', type: 'peer' }]);
  });
});
