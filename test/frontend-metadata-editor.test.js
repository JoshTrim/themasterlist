const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../public/lib/metadata-editor');

function field(value = '') {
  return { value, checked: false, files: [], listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; } };
}

function formFixture({ venue = false } = {}) {
  const submit = { disabled: false };
  const elements = {
    title: field(), description: field(), bio: field(), image: field(), source: field(),
    genres: field(), imagePosition: field(), imageFile: field()
  };
  if (venue) Object.assign(elements, { isClosed: field(), locationAddress: field(), latitude: field(), longitude: field() });
  return {
    elements, dataset: {}, listeners: {}, submit,
    addEventListener(name, handler) { this.listeners[name] = handler; },
    querySelector() { return submit; }
  };
}

function previewFixture() {
  const frame = { classes: new Set(), classList: { toggle(name, active) { active ? frame.classes.add(name) : frame.classes.delete(name); } } };
  return { hidden: false, src: '', style: {}, closest: () => frame, removeAttribute(name) { if (name === 'src') this.src = ''; }, frame };
}

function messageFixture() {
  const classes = new Set();
  return { textContent: '', classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) } };
}

describe('metadata editor', () => {
  test('serializes image uploads and venue-only fields', async () => {
    const form = formFixture({ venue: true });
    const file = { name: 'venue.png', type: 'image/png' };
    form.elements.imageFile.files = [file];
    form.elements.isClosed.checked = true;
    class FormDataStub { entries() { return [['title', 'Venue'], ['imageFile', file], ['latitude', '-27.4']][Symbol.iterator](); } }
    class ReaderStub { readAsDataURL() { this.result = 'data:image/png;base64,YWJj'; this.onload(); } }
    const payload = await editor.formPayload(form, { validateImage: () => {}, FormDataClass: FormDataStub, FileReaderClass: ReaderStub });
    assert.deepEqual(payload, { title: 'Venue', latitude: '-27.4', isClosed: true, imageUpload: { filename: 'venue.png', mimeType: 'image/png', data: 'YWJj' } });
  });

  test('populates fields, coordinates and the image preview without losing metadata', () => {
    const form = formFixture({ venue: true });
    const preview = previewFixture();
    const info = { title: 'The Tivoli', description: 'Description', bio: 'Bio', image: '/venue.jpg', source: 'Source', genres: ['Rock', 'Pop'], isClosed: true, imagePosition: 'top', coordinates: { lat: -27.4, lng: 153 } };
    editor.populateForm(form, preview, info, { createObjectURL: () => '', revokeObjectURL: () => {} });
    editor.populateVenueLocation(form, info);
    assert.equal(form.elements.title.value, 'The Tivoli');
    assert.equal(form.elements.genres.value, 'Rock, Pop');
    assert.equal(form.elements.isClosed.checked, true);
    assert.equal(form.elements.latitude.value, -27.4);
    assert.equal(preview.src, '/venue.jpg');
    assert.equal(preview.style.objectPosition, 'top');
    assert.ok(preview.frame.classes.has('has-image'));
  });

  test('renders previous and next editor navigation around the current entity', () => {
    const container = { hidden: true, innerHTML: '' };
    editor.renderStepper(container, { entries: [{ name: 'Alpha', city: '' }, { name: 'Beta', city: '' }, { name: 'Gamma', city: '' }], type: 'artist', name: 'Beta', escapeHtml: String });
    assert.equal(container.hidden, false);
    assert.match(container.innerHTML, /name=Alpha/);
    assert.match(container.innerHTML, /2 \/ 3/);
    assert.match(container.innerHTML, /name=Gamma/);
  });

  test('loads and saves through the controller while restoring submit state', async () => {
    const form = formFixture();
    const preview = previewFixture();
    const message = messageFixture();
    const heading = { textContent: '' };
    const backLink = { href: '' };
    const stepper = { hidden: false, innerHTML: '' };
    const requests = [];
    class FormDataStub { entries() { return [['title', 'Updated']][Symbol.iterator](); } }
    const controller = editor.createController({
      page: 'artist-edit', routePage: 'artist-edit', type: 'artist', name: 'Poppy',
      form, preview, message, stepper, heading, backLink,
      fetchJson: async (url, options) => { requests.push([url, options]); return { title: options ? 'Updated' : 'Poppy', genres: [], image: '' }; },
      validateImage: () => {}, getEntries: () => [{ name: 'Poppy', city: '' }], escapeHtml: String,
      urls: { createObjectURL: () => '', revokeObjectURL: () => {} }, FormDataClass: FormDataStub
    });
    await controller.load();
    assert.equal(heading.textContent, 'Edit Poppy');
    assert.equal(backLink.href, '/artist?name=Poppy');
    await controller.save();
    assert.equal(requests[1][1].method, 'PATCH');
    assert.deepEqual(JSON.parse(requests[1][1].body), { title: 'Updated' });
    assert.equal(message.textContent, 'Artist info saved.');
    assert.equal(form.submit.disabled, false);
  });
});
