const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const notifications = require('../public/lib/notification-center');

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function fixture() {
  const list = { innerHTML: '', children: [], querySelectorAll: () => [] };
  return {
    list,
    elements: {
      panel: { hidden: true, querySelector: () => list },
      activityCount: { hidden: true, textContent: '' },
      conflictCount: { hidden: true, textContent: '' }
    }
  };
}

describe('peer notification center', () => {
  test('creates the hidden peer notification panel in the document body', () => {
    const appended = [];
    const panel = {};
    const document = { createElement: (tag) => { assert.equal(tag, 'aside'); return panel; }, body: { append: (element) => appended.push(element) } };
    assert.equal(notifications.createPanel(document), panel);
    assert.equal(panel.className, 'peer-notifications');
    assert.equal(panel.hidden, true);
    assert.match(panel.innerHTML, /From your peers/);
    assert.deepEqual(appended, [panel]);
  });

  test('builds conflict and shared-show destinations safely', () => {
    assert.equal(notifications.notificationHref({ type: 'peer-sync-conflict' }), '/conflicts');
    assert.equal(notifications.notificationHref({ type: 'peer-show', sharedGigId: 'gig one' }), '/shows#shared-gig%20one');
    const markup = notifications.notificationMarkup({ id: 'n&1', title: '<New show>', body: 'From & friend', sharedGigId: 'g1' }, escapeHtml);
    assert.match(markup, /data-notification-id="n&amp;1"/);
    assert.match(markup, /&lt;New show>/);
    assert.match(markup, /From &amp; friend/);
  });

  test('caps large badge totals', () => {
    assert.equal(notifications.badgeText(0), '0');
    assert.equal(notifications.badgeText(17), '17');
    assert.equal(notifications.badgeText(100), '99+');
  });

  test('loads notifications and exposes their unread count', async () => {
    const view = fixture();
    const controller = notifications.createController({
      fetchJson: async () => [{ id: 'n1', title: 'New show', body: '', sharedGigId: 'g1' }],
      escapeHtml, navigate() {}, getAccount: () => ({ id: 'owner' }), elements: view.elements
    });
    const result = await controller.load();
    assert.equal(result.length, 1);
    assert.equal(view.elements.panel.hidden, false);
    assert.equal(view.elements.activityCount.hidden, false);
    assert.equal(view.elements.activityCount.textContent, '1');
    assert.match(view.list.innerHTML, /New show/);
  });

  test('does not request notifications while signed out', async () => {
    const view = fixture();
    let requested = false;
    const controller = notifications.createController({
      fetchJson: async () => { requested = true; return []; },
      escapeHtml, navigate() {}, getAccount: () => null, elements: view.elements
    });
    assert.deepEqual(await controller.load(), []);
    assert.equal(requested, false);
  });

  test('loads conflict totals for owners only', async () => {
    const view = fixture();
    let account = { isAdmin: true };
    let requests = 0;
    const controller = notifications.createController({
      fetchJson: async () => { requests += 1; return [{}, {}]; },
      escapeHtml, navigate() {}, getAccount: () => account, elements: view.elements
    });
    assert.equal(await controller.loadConflicts(), 2);
    assert.equal(view.elements.conflictCount.hidden, false);
    assert.equal(view.elements.conflictCount.textContent, '2');
    account = { isAdmin: false };
    assert.equal(await controller.loadConflicts(), 0);
    assert.equal(requests, 1);
  });
});
