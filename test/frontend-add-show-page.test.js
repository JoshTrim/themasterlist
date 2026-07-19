const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const addShow = require('../public/lib/add-show-page');
const workflow = require('../public/lib/show-form-controller');

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
class FormDataStub {
  constructor(form) { this.form = form; }
  entries() { return this.form.entries[Symbol.iterator](); }
}

function classList() {
  const values = new Set();
  return { add: (name) => values.add(name), remove: (name) => values.delete(name), toggle: (name, active) => active ? values.add(name) : values.delete(name), contains: (name) => values.has(name) };
}

function fixture(entries = [['artist', 'Poppy'], ['city', 'Brisbane'], ['venue', 'The Tivoli'], ['date', '2026-01-01']]) {
  const submit = { disabled: false };
  const form = {
    entries, elements: { artist: { value: '' }, city: { value: '' }, venue: { value: '' }, date: { value: '' } },
    resetCalled: false, reset() { this.resetCalled = true; }, querySelector: () => submit, addEventListener() {}
  };
  Object.entries(Object.fromEntries(entries)).forEach(([name, value]) => { if (form.elements[name]) form.elements[name].value = value; });
  const results = { hidden: true, innerHTML: '', querySelectorAll: () => [] };
  return {
    form, submit, results,
    elements: { form, results, message: { textContent: '', classList: classList() }, duplicateWarning: { hidden: false }, findButton: { addEventListener() {} } }
  };
}

function controllerFor(view, overrides = {}) {
  return addShow.createController({
    URLSearchParamsClass: URLSearchParams, FormDataClass: FormDataStub, fetchJson: async () => ({ setlists: [] }), escapeHtml,
    editor: { createAddPayload: (gig, extra) => ({ ...gig, songs: extra.setlist?.songs || [], attendees: extra.attendees }) }, workflow,
    getAttendees: () => [{ id: 'owner' }], getMediaFiles: () => [], isMobile: () => false,
    confirmDuplicateSave: () => true, showDuplicateWarning() {}, queueMobileUploads: async () => {}, uploadFiles: async () => {}, addExternalMedia: async () => {},
    onSaved() {}, afterSaved: async () => {}, resetReviewForm() {}, elements: view.elements, ...overrides
  });
}

describe('add show page controller', () => {
  test('normalizes setlist.fm dates and escapes result markup', () => {
    assert.equal(addShow.setlistDateToInput('20-01-2026'), '2026-01-20');
    assert.equal(addShow.setlistDateToInput('unknown'), '');
    const markup = addShow.matchesMarkup([{ venue: '<Hall>', city: 'B&NE', date: '', songs: [{}, {}] }], escapeHtml);
    assert.match(markup, /&lt;Hall>/);
    assert.match(markup, /B&amp;NE/);
    assert.match(markup, /2 songs/);
  });

  test('requires artist and city before searching', async () => {
    const view = fixture([['artist', ''], ['city', '']]);
    let requested = false;
    const controller = controllerFor(view, { fetchJson: async () => { requested = true; return {}; } });
    assert.deepEqual(await controller.searchSetlists(), []);
    assert.equal(requested, false);
    assert.match(view.elements.message.textContent, /artist and city/);
    assert.equal(view.elements.message.classList.contains('error'), true);
  });

  test('searches setlist.fm and selects a result into the form', async () => {
    const view = fixture();
    const button = { dataset: { match: '0' }, classList: classList(), addEventListener(_type, handler) { this.handler = handler; } };
    view.results.querySelectorAll = (selector) => selector === '[data-match]' || selector === '.match' ? [button] : [];
    const setlist = { venue: 'Fortitude Music Hall', city: 'Brisbane', date: '20-01-2026', songs: [{ name: 'Song' }] };
    let requestUrl = '';
    const controller = controllerFor(view, { fetchJson: async (url) => { requestUrl = url; return { setlists: [setlist] }; } });
    await controller.searchSetlists();
    assert.match(requestUrl, /artistName=Poppy/);
    assert.equal(view.results.hidden, false);
    button.handler();
    assert.equal(controller.getSelectedSetlist(), setlist);
    assert.equal(view.form.elements.venue.value, 'Fortitude Music Hall');
    assert.equal(view.form.elements.date.value, '2026-01-20');
    assert.equal(button.classList.contains('selected'), true);
  });

  test('creates a show, resets transient state and runs post-save refreshes', async () => {
    const view = fixture();
    let saved;
    let afterSaved = false;
    let reviewReset = false;
    const controller = controllerFor(view, {
      fetchJson: async (url, options) => ({ id: 'gig-1', ...JSON.parse(options.body) }),
      onSaved: (record) => { saved = record; }, afterSaved: async () => { afterSaved = true; }, resetReviewForm: () => { reviewReset = true; }
    });
    const result = await controller.submit();
    assert.equal(result.saved.id, 'gig-1');
    assert.equal(saved.artist, 'Poppy');
    assert.equal(view.form.resetCalled, true);
    assert.equal(reviewReset, true);
    assert.equal(afterSaved, true);
    assert.equal(view.results.hidden, true);
    assert.equal(view.elements.duplicateWarning.hidden, true);
    assert.equal(view.submit.disabled, false);
    assert.equal(view.elements.message.textContent, 'Show saved to The Master List.');
  });

  test('does not persist when duplicate confirmation is declined', async () => {
    const view = fixture();
    let requested = false;
    const controller = controllerFor(view, { confirmDuplicateSave: () => false, fetchJson: async () => { requested = true; return {}; } });
    assert.equal(await controller.submit(), null);
    assert.equal(requested, false);
  });
});
