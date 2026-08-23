const test = require('node:test');
const assert = require('node:assert/strict');
const artifactsPage = require('../public/lib/artifacts-page');

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function control(value = '') { return { value, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } }; }

test('artifact archive model keeps artifact media and sorts newest shows first', () => {
  const model = artifactsPage.buildArtifactModel([
    { id: 'old', date: '2024-01-01', media: [{ id: 'clip', category: 'show' }, { id: 'ticket', category: 'artifact' }] },
    { id: 'new', date: '2026-01-01', media: [{ id: 'shirt', category: 'artifact' }] }
  ]);
  assert.deepEqual(model.map((item) => item.id), ['shirt', 'ticket']);
  assert.equal(model[0].gig.id, 'new');
});

test('artifact archive groups front, back and detail photos into one listing', () => {
  const model = artifactsPage.buildArtifactModel([{ id: 'gig', date: '2026-01-01', media: [
    { id: 'front', category: 'artifact', artifactGroupId: 'shirt', artifactView: 'front' },
    { id: 'back', category: 'artifact', artifactGroupId: 'shirt', artifactView: 'back' },
    { id: 'label', category: 'artifact', artifactGroupId: 'shirt', artifactView: 'detail', artifactViewLabel: 'Label' }
  ] }]);
  assert.equal(model.length, 1);
  assert.deepEqual(model[0].artifactViews.map((item) => item.artifactView), ['front', 'back', 'detail']);
});

test('artifact archive renders metadata and filters without losing show context', () => {
  const query = control(); const type = control('all');
  const elements = { query, type, summary: { textContent: '' }, grid: { innerHTML: '' }, empty: { hidden: true } };
  const shows = [{ id: 'gig', artist: '<Artist>', venue: 'Room', city: 'City', date: '2026-01-02', media: [
    { id: 'shirt', category: 'artifact', artifactType: 'merch', caption: 'Tour shirt', artifactNotes: 'Bought after the encore', url: '/shirt.png', useBackgroundRemoved: true },
    { id: 'ticket', category: 'artifact', artifactType: 'ticket', caption: 'Ticket', url: '/ticket.jpg' }
  ] }];
  const controller = artifactsPage.createController({ page: 'artifacts', getShows: () => shows, escapeHtml, formatGigDate: (date) => date, elements });
  controller.render();
  assert.match(elements.grid.innerHTML, /Tour shirt/);
  assert.match(elements.grid.innerHTML, /Bought after the encore/);
  assert.match(elements.grid.innerHTML, /&lt;Artist&gt;/);
  assert.match(elements.grid.innerHTML, /is-cutout/);
  type.value = 'ticket'; type.listeners.change();
  assert.doesNotMatch(elements.grid.innerHTML, /Tour shirt/);
  assert.match(elements.grid.innerHTML, /Ticket/);
  assert.equal(elements.summary.textContent, '1 artifact · 2 total');
});
