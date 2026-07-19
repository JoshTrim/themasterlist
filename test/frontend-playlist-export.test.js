const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const playlistExport = require('../public/lib/playlist-export');

function classList() { const values = new Set(); return { add: (name) => values.add(name), remove: (name) => values.delete(name), contains: (name) => values.has(name) }; }
function button(provider) { return { dataset: { provider }, disabled: false, title: '', textContent: '', listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; } }; }
function fixture(providers = ['spotify']) {
  const buttons = providers.map(button);
  const status = { textContent: '', children: [], classList: classList(), replaceChildren() { this.children = []; this.textContent = ''; }, append(...items) { this.children.push(...items); } };
  const exports = { querySelector: () => status, querySelectorAll: (selector) => selector === '.export-button' ? buttons : buttons };
  const document = { createElement: () => ({ href: '', target: '', rel: '', textContent: '' }) };
  return { buttons, status, exports, document };
}

describe('playlist export frontend', () => {
  test('normalizes Apple Music integration naming', () => {
    const integrations = { appleMusic: { configured: true }, spotify: { configured: false } };
    assert.equal(playlistExport.integrationFor(integrations, 'apple-music'), integrations.appleMusic);
    assert.equal(playlistExport.integrationFor(integrations, 'spotify'), integrations.spotify);
  });

  test('disables unconfigured providers with setup guidance', () => {
    const view = fixture(['spotify']);
    const exporter = playlistExport.createExporter({ getIntegrations: () => ({ spotify: { configured: false } }), providerName: () => 'Spotify', fetchJson: async () => {}, navigate: () => {}, document: view.document, authorizeAppleMusic: async () => '' });
    exporter.setupButtons(view.exports, { id: 'gig', songs: [] });
    assert.equal(view.buttons[0].disabled, true);
    assert.match(view.buttons[0].title, /credentials to \.env/);
  });

  test('redirects disconnected OAuth providers without starting export', async () => {
    const view = fixture();
    let destination = '';
    let requested = false;
    const exporter = playlistExport.createExporter({ getIntegrations: () => ({ spotify: { configured: true, connected: false } }), providerName: () => 'Spotify', fetchJson: async () => { requested = true; }, navigate: (href) => { destination = href; }, document: view.document, authorizeAppleMusic: async () => '' });
    await exporter.run('spotify', { id: 'gig', songs: [{}] }, view.exports, view.status);
    assert.equal(destination, '/auth/spotify');
    assert.equal(requested, false);
  });

  test('passes the MusicKit user token and renders matches and misses', async () => {
    const view = fixture(['apple-music']);
    const requests = [];
    const exporter = playlistExport.createExporter({
      getIntegrations: () => ({ appleMusic: { configured: true, developerToken: 'developer' } }), providerName: () => 'Apple Music',
      authorizeAppleMusic: async (token) => { assert.equal(token, 'developer'); return 'user-token'; }, navigate: () => {}, document: view.document,
      fetchJson: async (url, options) => { requests.push([url, options]); return { url: 'https://music.example/playlist', matched: 2, unmatched: ['Missing'] }; }
    });
    await exporter.run('apple-music', { id: 'gig 1', songs: [{}, {}, {}] }, view.exports, view.status);
    assert.equal(requests[0][0], '/api/gigs/gig 1/export/apple-music');
    assert.deepEqual(JSON.parse(requests[0][1].body), { musicUserToken: 'user-token' });
    assert.equal(view.status.children[1].href, 'https://music.example/playlist');
    assert.match(view.status.children.join(''), /1 song could not be matched/);
    assert.equal(view.buttons[0].disabled, false);
  });

  test('loads and configures MusicKit once across authorizations', async () => {
    let configured = 0;
    let authorized = 0;
    const window = { MusicKit: { configure: () => { configured += 1; }, getInstance: () => ({ authorize: async () => { authorized += 1; return `token-${authorized}`; } }) } };
    const authorize = playlistExport.createAppleAuthorizer({ window, document: {} });
    assert.equal(await authorize('developer'), 'token-1');
    assert.equal(await authorize('developer'), 'token-2');
    assert.equal(configured, 1);
  });

  test('shows export failures and always restores provider buttons', async () => {
    const view = fixture();
    const exporter = playlistExport.createExporter({ getIntegrations: () => ({ spotify: { configured: true, connected: true } }), providerName: () => 'Spotify', fetchJson: async () => { throw new Error('Export failed'); }, navigate: () => {}, document: view.document, authorizeAppleMusic: async () => '' });
    await exporter.run('spotify', { id: 'gig', songs: [{}] }, view.exports, view.status);
    assert.equal(view.status.textContent, 'Export failed');
    assert.equal(view.status.classList.contains('error'), true);
    assert.equal(view.buttons[0].disabled, false);
  });

  test('reconnects an OAuth provider when its stored grant has expired', async () => {
    const view = fixture(['youtube']);
    let destination = '';
    const expired = Object.assign(new Error('Reconnect YouTube to continue.'), { status: 401, payload: { code: 'reconnect-required' } });
    const exporter = playlistExport.createExporter({
      getIntegrations: () => ({ youtube: { configured: true, connected: true } }), providerName: () => 'YouTube',
      fetchJson: async () => { throw expired; }, navigate: (href) => { destination = href; }, document: view.document,
      authorizeAppleMusic: async () => ''
    });
    await exporter.run('youtube', { id: 'gig', songs: [{}] }, view.exports, view.status);
    assert.equal(destination, '/auth/youtube');
    assert.match(view.status.textContent, /Reconnecting/);
  });
});
