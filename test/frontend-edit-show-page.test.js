const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const editPage = require('../public/lib/edit-show-page');
const workflow = require('../public/lib/show-form-controller');

class FormDataStub {
  constructor(form) { this.form = form; }
  entries() { return this.form.entries[Symbol.iterator](); }
}

function classList() {
  const values = new Set();
  return { add: (name) => values.add(name), remove: (name) => values.delete(name), toggle: (name, active) => active ? values.add(name) : values.delete(name), contains: (name) => values.has(name) };
}

function fixture() {
  const submit = { disabled: false };
  const elements = { artist: { value: '', addEventListener() {} }, date: { value: '', addEventListener() {} }, venue: { value: '', addEventListener() {} }, city: { value: '', addEventListener() {} } };
  const form = { entries: [], elements, querySelector: () => submit, addEventListener() {} };
  const message = { textContent: '', classList: classList() };
  return { submit, form, message, mediaInput: { value: '' }, duplicateWarning: {}, elements: { form, message, mediaInput: { value: '' }, duplicateWarning: {} } };
}

function buildController(view, overrides = {}) {
  let gigs = [{ id: 'g1', artist: 'Poppy', date: '2026-01-20', venue: 'The Tivoli', city: 'Brisbane', songs: [{ title: 'Song' }], attendees: [{ id: 'owner' }], media: [] }];
  const calls = [];
  const controller = editPage.createController({
    page: 'edit', gigId: 'g1', FormDataClass: FormDataStub, workflow,
    editor: { createEditPayload: (values, extra) => ({ ...values, ...extra }) },
    trackEditor: { load: (songs) => calls.push(['tracks', songs]), sync: () => [{ title: 'Changed song' }] },
    getGigs: () => gigs, onGigs: (next) => { gigs = next; }, setupImmediateUpload: (gig) => calls.push(['upload', gig.id]),
    showDuplicateWarning: (...args) => calls.push(['duplicate', ...args]), confirmDuplicateSave: () => true,
    ensureAttendeePicker: () => ({ id: 'picker' }), renderAttendees: (_picker, attendees) => calls.push(['attendees', attendees]),
    readAttendees: () => [{ id: 'owner' }], renderMediaWorkspace: (_gig, media) => calls.push(['media', media]),
    getMediaFiles: () => [], uploadFiles: async () => {}, addExternalMedia: async () => {}, renderArchive: () => calls.push(['archive']),
    fetchJson: async (url, options) => url.endsWith('/media') ? [{ id: 'm1' }] : { ...gigs[0], ...JSON.parse(options.body) },
    elements: view.elements, ...overrides
  });
  return { controller, calls, getGigs: () => gigs };
}

describe('edit show page controller', () => {
  test('serializes the current form without unrelated controller state', () => {
    const view = fixture();
    view.form.entries = [['artist', 'Poppy'], ['city', 'Brisbane']];
    assert.deepEqual(editPage.formValues(view.form, FormDataStub), { artist: 'Poppy', city: 'Brisbane' });
  });

  test('hydrates show fields, tracks, attendees and media once rendered', () => {
    const view = fixture();
    const { controller, calls } = buildController(view);
    const gig = controller.render();
    assert.equal(gig.id, 'g1');
    assert.equal(view.form.elements.artist.value, 'Poppy');
    assert.equal(view.form.elements.venue.value, 'The Tivoli');
    assert.deepEqual(calls.map((call) => call[0]), ['upload', 'duplicate', 'tracks', 'media', 'attendees']);
  });

  test('reports a missing edit target without initializing uploads', () => {
    const view = fixture();
    const { controller, calls } = buildController(view, { gigId: 'missing' });
    assert.equal(controller.render(), null);
    assert.equal(calls.length, 0);
    assert.equal(view.message.textContent, 'Show not found.');
    assert.equal(view.message.classList.contains('error'), true);
  });

  test('persists fields, track metadata and attendees before refreshing media and archive state', async () => {
    const view = fixture();
    view.form.entries = [['artist', 'Poppy'], ['city', 'Brisbane'], ['venue', 'The Tivoli'], ['date', '2026-01-20']];
    const { controller, calls, getGigs } = buildController(view);
    controller.render();
    const result = await controller.submit();
    assert.equal(result.saved.songs[0].title, 'Changed song');
    assert.equal(getGigs()[0].songs[0].title, 'Changed song');
    assert.equal(view.message.textContent, 'Show saved.');
    assert.equal(view.elements.mediaInput.value, '');
    assert.equal(view.submit.disabled, false);
    assert.equal(calls.at(-1)[0], 'archive');
  });

  test('leaves the record unchanged when duplicate confirmation is declined', async () => {
    const view = fixture();
    const { controller } = buildController(view, { confirmDuplicateSave: () => false });
    controller.render();
    assert.equal(await controller.submit(), null);
    assert.equal(view.submit.disabled, false);
  });
});
