const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const activity = require('../public/lib/activity-page');

const escapeHtml = (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function classList() {
  const names = new Set();
  return { add: (name) => names.add(name), remove: (name) => names.delete(name), contains: (name) => names.has(name) };
}

function elementsFixture() {
  return {
    list: { innerHTML: '', querySelectorAll: () => [] },
    filters: { querySelectorAll: () => [] },
    message: { textContent: '', classList: classList() },
    markAll: { disabled: false, addEventListener() {} }
  };
}

describe('peer activity page', () => {
  const entries = [
    { id: 'one', type: 'peer-show-added', sharedGigId: 'gig 1', title: '<New show>', body: 'Added', createdAt: '2026-07-19T00:00:00Z', unread: true },
    { id: 'two', type: 'peer-sync-conflict', title: 'Conflict', body: '', createdAt: '2026-07-18T00:00:00Z', unread: false }
  ];

  test('filters unread activity without mutating the source list', () => {
    assert.deepEqual(activity.visibleEntries(entries, 'unread').map((entry) => entry.id), ['one']);
    assert.equal(entries.length, 2);
  });

  test('builds the right labels, destinations and escaped markup', () => {
    assert.equal(activity.entryLabel(entries[0]), 'New shared show');
    assert.equal(activity.entryHref(entries[0]), '/shows#shared-gig%201');
    assert.equal(activity.entryLabel(entries[1]), 'Conflict needs review');
    assert.equal(activity.entryHref(entries[1]), '/conflicts');
    const markup = activity.entryMarkup(entries[0], escapeHtml);
    assert.match(markup, /&lt;New show&gt;/);
    assert.match(markup, /Mark read/);
  });

  test('loads notifications and renders unread state', async () => {
    const elements = elementsFixture();
    const controller = activity.createController({ page: 'activity', fetchJson: async () => structuredClone(entries), escapeHtml, refreshNotifications: async () => {}, navigate: () => {}, elements });
    await controller.render();
    assert.match(elements.list.innerHTML, /New shared show/);
    assert.match(elements.list.innerHTML, /Conflict needs review/);
    assert.equal(elements.markAll.disabled, false);
    assert.equal(controller.getEntries().length, 2);
  });

  test('marks every notification read and refreshes the navigation count', async () => {
    const elements = elementsFixture();
    const requests = [];
    let refreshed = 0;
    const controller = activity.createController({
      page: 'activity', escapeHtml, navigate: () => {}, elements,
      now: () => new Date('2026-07-19T12:00:00Z'),
      refreshNotifications: async () => { refreshed += 1; },
      fetchJson: async (url, options) => { requests.push([url, options]); return url.includes('scope=all') ? structuredClone(entries) : {}; }
    });
    await controller.render();
    await controller.markAllRead();
    assert.equal(requests[1][0], '/api/notifications/read-all');
    assert.equal(requests[1][1].method, 'POST');
    assert.equal(controller.getEntries().every((entry) => !entry.unread), true);
    assert.equal(elements.markAll.disabled, true);
    assert.equal(elements.message.textContent, 'All activity marked as read.');
    assert.equal(refreshed, 1);
  });
});
