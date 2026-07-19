const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const health = require('../public/lib/health-page');

const escapeHtml = (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function classList() { const values = new Set(); return { add: (name) => values.add(name), remove: (name) => values.delete(name), contains: (name) => values.has(name) }; }
function elementsFixture() {
  return {
    summary: { innerHTML: '' }, filters: { innerHTML: '', querySelectorAll: () => [] },
    list: { innerHTML: '', querySelectorAll: () => [] }, message: { textContent: '', classList: classList() },
    repairAll: { disabled: false, textContent: '', addEventListener() {} },
    repairAlbums: { disabled: false, textContent: '', addEventListener() {} }
  };
}

const snapshot = {
  totalShows: 3, healthy: false,
  counts: { albums: 1, artist: 1 },
  issues: [
    { id: 'albums-1', type: 'albums', title: 'Missing albums', detail: 'Two tracks', href: '/edit?id=one', repairable: true },
    { id: 'artist-1', type: 'artist', title: '<Poppy>', detail: 'Missing biography', href: '/artist/edit?name=Poppy', repairable: false }
  ]
};

describe('archive health page', () => {
  test('builds diagnostic totals and counts unique affected shows', () => {
    assert.equal(health.showLevelIssueCount({ issues: [...snapshot.issues, { ...snapshot.issues[0], id: 'duplicate' }] }), 1);
    const markup = health.summaryMarkup(snapshot);
    assert.match(markup, /3.*Shows scanned/);
    assert.match(markup, /2.*Shows without show-level issues/);
  });

  test('filters issues and exposes only populated categories', () => {
    assert.deepEqual(health.availableTypes(snapshot), ['all', 'albums', 'artist']);
    assert.deepEqual(health.visibleIssues(snapshot, 'albums').map((issue) => issue.id), ['albums-1']);
  });

  test('renders manual forms only for editable metadata and locations', () => {
    assert.match(health.manualForm(snapshot.issues[1], escapeHtml), /&lt;Poppy&gt;/);
    assert.match(health.manualForm({ type: 'location' }, escapeHtml), /Venue address/);
    assert.equal(health.manualForm(snapshot.issues[0], escapeHtml), '');
  });

  test('renders a snapshot with repair controls and escaped issue content', () => {
    const elements = elementsFixture();
    const controller = health.createController({ page: 'health', fetchJson: async () => snapshot, escapeHtml, elements });
    controller.renderSnapshot(snapshot);
    assert.match(elements.summary.innerHTML, /Issues found/);
    assert.match(elements.filters.innerHTML, /Albums/);
    assert.match(elements.list.innerHTML, /&lt;Poppy&gt;/);
    assert.equal(elements.repairAll.disabled, false);
    assert.equal(elements.repairAlbums.disabled, false);
  });

  test('repairs multiple album issues sequentially and reports remaining work', async () => {
    const elements = elementsFixture();
    const requests = [];
    const complete = { totalShows: 3, healthy: true, counts: {}, issues: [] };
    const controller = health.createController({ page: 'health', escapeHtml, elements, fetchJson: async (url, options) => { requests.push([url, options]); return complete; } });
    controller.renderSnapshot(snapshot);
    await controller.repairMany([snapshot.issues[0]], elements.repairAlbums, 'Find missing albums', true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], '/api/health/repair');
    assert.equal(elements.message.textContent, 'Album search complete. All setlist tracks have album information.');
    assert.equal(elements.repairAlbums.textContent, 'Find missing albums');
  });
});
