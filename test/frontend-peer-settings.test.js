const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const peers = require('../public/lib/peer-settings');

function classList() {
  const values = new Set();
  return { toggle(name, force) { if (force) values.add(name); else values.delete(name); }, contains: (name) => values.has(name) };
}

function fixture(search = '') {
  const elements = {
    instanceId: { textContent: '' }, publicKey: { textContent: '' },
    form: { entries: [], resetCalled: false, reset() { this.resetCalled = true; }, addEventListener() {} },
    message: { textContent: '', classList: classList() },
    list: { innerHTML: '', querySelectorAll: () => [] },
    createInviteButton: { disabled: false, addEventListener() {} },
    inviteMessage: { textContent: '', classList: classList() },
    inviteToken: { value: '' }, importInviteButton: { disabled: false, addEventListener() {} }
  };
  return { elements, window: { location: { search }, confirm: () => true } };
}

class FormDataStub {
  constructor(form) { this.form = form; }
  entries() { return this.form.entries[Symbol.iterator](); }
}

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

describe('peer instance settings', () => {
  test('refreshes archive and collaboration state after a successful sync', async () => {
    const calls = [];
    const refresh = peers.createPostSyncRefresh({
      fetchJson: async (url) => { calls.push(`fetch:${url}`); return [{ id: 'g1' }]; },
      onGigs: (gigs) => calls.push(`gigs:${gigs.length}`),
      populateYears: () => calls.push('years'), renderArchive: () => calls.push('archive'),
      refreshCollaboration: async () => calls.push('collaboration'),
      loadNotifications: async () => calls.push('notifications')
    });
    assert.deepEqual(await refresh(), [{ id: 'g1' }]);
    assert.deepEqual(calls, ['fetch:/api/gigs', 'gigs:1', 'years', 'archive', 'collaboration', 'notifications']);
  });

  test('extracts pairing tokens from invite URLs and accepts raw tokens', () => {
    assert.equal(peers.extractInviteToken('https://archive.test/account?peerInvite=secret'), 'secret');
    assert.equal(peers.extractInviteToken(' raw-token '), 'raw-token');
    assert.equal(peers.extractInviteToken(''), '');
  });

  test('renders escaped peer identity, status and connection controls', () => {
    const markup = peers.peerCardMarkup({ id: 'peer&1', name: '<Friend>', baseUrl: '', status: 'offline' }, escapeHtml);
    assert.match(markup, /data-peer-id="peer&amp;1"/);
    assert.match(markup, /&lt;Friend>/);
    assert.match(markup, /peer-status-offline/);
    assert.match(markup, /Direct relay\/VPN connection not configured/);
    assert.match(markup, /class="peer-test" disabled/);
  });

  test('loads instance identity, peers and an invite supplied in the URL', async () => {
    const view = fixture('?peerInvite=url-token');
    let loadedPeers;
    const controller = peers.createController({
      window: view.window, navigator: {}, escapeHtml, FormDataClass: FormDataStub, elements: view.elements,
      onPeers: (value) => { loadedPeers = value; },
      fetchJson: async () => ({ instanceId: 'instance-1', publicKey: 'public-key', peers: [{ id: 'p1', name: 'Friend', baseUrl: 'https://peer.test' }] })
    });
    await controller.render();
    assert.equal(view.elements.instanceId.textContent, 'instance-1');
    assert.equal(view.elements.publicKey.textContent, 'public-key');
    assert.equal(view.elements.inviteToken.value, 'url-token');
    assert.equal(loadedPeers[0].id, 'p1');
    assert.match(view.elements.list.innerHTML, /Friend/);
  });

  test('adds a manually configured peer and refreshes settings', async () => {
    const view = fixture();
    const requests = [];
    view.elements.form.entries = [['name', 'Friend'], ['baseUrl', 'https://peer.test']];
    const controller = peers.createController({
      window: view.window, navigator: {}, escapeHtml, FormDataClass: FormDataStub, elements: view.elements,
      fetchJson: async (url, options) => { requests.push([url, options]); return url === '/api/instance' ? { instanceId: 'i', publicKey: 'k', peers: [] } : {}; }
    });
    await controller.addManual();
    assert.deepEqual(JSON.parse(requests[0][1].body), { name: 'Friend', baseUrl: 'https://peer.test' });
    assert.equal(requests[1][0], '/api/instance');
    assert.equal(view.elements.form.resetCalled, true);
    assert.equal(view.elements.message.textContent, 'Paired instance saved.');
  });

  test('copies new invites and imports URL-based invites', async () => {
    const view = fixture();
    const requests = [];
    let copied = '';
    const controller = peers.createController({
      window: view.window, navigator: { clipboard: { writeText: async (value) => { copied = value; } } },
      escapeHtml, FormDataClass: FormDataStub, elements: view.elements,
      fetchJson: async (url, options) => {
        requests.push([url, options]);
        if (url === '/api/peers/invite') return { inviteUrl: 'https://local.test/account?peerInvite=created' };
        if (url === '/api/peers/import') return { message: 'Paired.' };
        return { instanceId: 'i', publicKey: 'k', peers: [] };
      }
    });
    await controller.createInvite();
    assert.equal(copied, 'https://local.test/account?peerInvite=created');
    assert.match(view.elements.inviteMessage.textContent, /copied/);
    view.elements.inviteToken.value = 'https://peer.test/account?peerInvite=imported';
    await controller.importInvite();
    const importRequest = requests.find(([url]) => url === '/api/peers/import');
    assert.deepEqual(JSON.parse(importRequest[1].body), { token: 'imported' });
    assert.equal(view.elements.inviteToken.value, '');
    assert.equal(view.elements.inviteMessage.textContent, 'Paired.');
  });
});
