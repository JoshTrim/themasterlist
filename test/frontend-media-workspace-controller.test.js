const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const workspace = require('../public/lib/media-workspace-controller');

function classList() {
  const values = new Set();
  return { toggle: (name, active) => active ? values.add(name) : values.delete(name), contains: (name) => values.has(name) };
}

function fixture() {
  const cards = [
    { dataset: { processingState: 'ready' }, hidden: false },
    { dataset: { processingState: 'failed' }, hidden: false }
  ];
  const buttons = ['all', 'ready', 'failed'].map((value) => ({ dataset: { mediaFilter: value }, classList: classList(), addEventListener(_type, handler) { this.handler = handler; } }));
  const gallery = { querySelectorAll: (selector) => selector === '.media-item' ? cards : [] };
  const filters = { querySelectorAll: () => buttons };
  return {
    cards, buttons,
    elements: { gallery, stats: { innerHTML: '' }, filters, empty: { hidden: true }, refreshButton: { disabled: false, textContent: '', addEventListener(_type, handler) { this.handler = handler; } } }
  };
}

function controllerFor(view, overrides = {}) {
  const renders = [];
  const controller = workspace.createController({
    document: {}, fetchJson: async () => [], escapeHtml: String, formatSize: (value) => `${value} B`,
    mediaUi: { workspaceTotals: (media) => ({ all: media.length, processing: 0, failed: 0, unassigned: 0, ready: media.length }), workspaceState: () => ({ key: 'ready', label: 'Ready', detail: 'Ready' }) },
    mediaJobs: {}, updateJob() {}, pollRecognition: async () => {},
    renderGallery: (target, media, options) => renders.push([target, media, options]), renderPlaybackEditor() {}, elements: view.elements,
    ...overrides
  });
  return { controller, renders };
}

describe('edit media workspace controller', () => {
  test('renders compact processing totals', () => {
    assert.equal(workspace.statsMarkup({ all: 5, processing: 1, failed: 2, unassigned: 1, ready: 3 }), '<span><b>5</b>Total</span><span><b>1</b>Processing</span><span><b>2</b>Needs attention</span><span><b>1</b>Unassigned</span><span><b>3</b>Ready</span>');
  });

  test('filters media cards and updates empty and active states', () => {
    const view = fixture();
    const { controller } = controllerFor(view);
    controller.bind();
    view.buttons.find((button) => button.dataset.mediaFilter === 'ready').handler();
    assert.equal(controller.getFilter(), 'ready');
    assert.equal(view.cards[0].hidden, false);
    assert.equal(view.cards[1].hidden, true);
    assert.equal(view.elements.empty.hidden, true);
    assert.equal(view.buttons[1].classList.contains('active'), true);
  });

  test('shows the empty state when no cards match a filter', () => {
    const view = fixture();
    view.buttons.push({ dataset: { mediaFilter: 'processing' }, classList: classList(), addEventListener(_type, handler) { this.handler = handler; } });
    const { controller } = controllerFor(view);
    controller.bind();
    view.buttons.at(-1).handler();
    assert.equal(controller.applyFilter(), 0);
    assert.equal(view.elements.empty.hidden, false);
  });

  test('renders editable media and retains the active show for refresh', async () => {
    const view = fixture();
    const gig = { id: 'g1', songs: [{ title: 'Song' }], media: [] };
    const refreshed = [{ id: 'm1' }];
    const { controller, renders } = controllerFor(view, { fetchJson: async (url) => { assert.equal(url, '/api/gigs/g1/media'); return refreshed; } });
    controller.render(gig, []);
    assert.equal(controller.getGig(), gig);
    assert.equal(renders[0][2].editable, true);
    assert.deepEqual(renders[0][2].songs, gig.songs);
    assert.deepEqual(await controller.refresh(), refreshed);
    assert.deepEqual(gig.media, refreshed);
    assert.equal(renders.length, 2);
  });

  test('decorates an empty gallery with zero totals', () => {
    const view = fixture();
    view.elements.gallery.querySelectorAll = () => [];
    const { controller } = controllerFor(view);
    controller.decorate(view.elements.gallery, [], { id: 'g1' });
    assert.match(view.elements.stats.innerHTML, /<b>0<\/b>Total/);
    assert.equal(view.elements.empty.hidden, false);
  });
});
