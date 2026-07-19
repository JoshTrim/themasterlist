const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const authState = require('../public/lib/auth-state');
const appBootstrap = require('../public/lib/app-bootstrap');

function fixture(overrides = {}) {
  const redirects = [];
  const calls = [];
  const countElement = { textContent: '' };
  const authElements = { navSignIn: {}, authPanel: {}, profileBar: {}, inviteButton: {}, accountName: {} };
  let account;
  let loadedData;
  const page = overrides.page || 'shows';
  const runtime = overrides.runtime || {
    requirementsFor: () => ['gigs', 'sharedShows'],
    loadPageData: async () => ({ gigs: [{ id: 'g1' }], integrations: {}, profiles: [], sharedShows: [], peers: [] }),
    runController: async (route, controllers, context) => controllers[route]?.(context)
  };
  const fetchJson = overrides.fetchJson || (async (url) => {
    if (url === '/api/auth/status') return { account: { id: 'owner', name: 'Archive Owner', isAdmin: true } };
    if (url === '/api/stats') return { shows: 7 };
    throw new Error(`Unexpected request ${url}`);
  });
  const bootstrap = appBootstrap.createBootstrap({
    window: { location: { replace: (href) => redirects.push(href) } }, page, fetchJson, runtime,
    authStateModule: authState, authElements,
    showAuth: (status) => calls.push(['showAuth', status]),
    onAccount: (value) => { account = value; calls.push(['account', value]); },
    onAuthenticated: (value) => calls.push(['authenticated', value]),
    onData: (data) => { loadedData = data; calls.push(['data', data]); },
    remoteShowCount: overrides.remoteShowCount || (() => 2),
    controllers: { [page]: async (context) => calls.push(['controller', context]) },
    afterRun: async (context) => calls.push(['after', context]),
    countElement
  });
  return { bootstrap, redirects, calls, countElement, authElements, getAccount: () => account, getData: () => loadedData };
}

describe('application bootstrap controller', () => {
  test('formats singular and plural archive totals', () => {
    assert.equal(appBootstrap.showCountLabel(0), '0 shows');
    assert.equal(appBootstrap.showCountLabel(1), '1 show');
    assert.equal(appBootstrap.showCountLabel(12), '12 shows');
  });

  test('redirects the legacy shared route before making requests', async () => {
    let requests = 0;
    const view = fixture({ page: 'shared', fetchJson: async () => { requests += 1; } });
    assert.deepEqual(await view.bootstrap.initialize(), { redirected: true });
    assert.deepEqual(view.redirects, ['/shows']);
    assert.equal(requests, 0);
  });

  test('redirects signed-out home visitors and renders other signed-out auth pages', async () => {
    const signedOut = async () => ({ configured: true, account: null });
    const home = fixture({ page: 'home', fetchJson: signedOut });
    const homeResult = await home.bootstrap.initialize();
    assert.equal(homeResult.redirected, true);
    assert.deepEqual(home.redirects, ['/login']);

    const login = fixture({ page: 'login', fetchJson: signedOut });
    const loginResult = await login.bootstrap.initialize();
    assert.equal(loginResult.authenticated, false);
    assert.equal(login.calls.some(([name]) => name === 'showAuth'), true);
    assert.equal(login.calls.some(([name]) => name === 'controller'), false);
  });

  test('loads route data, counts remote shows, dispatches and runs post-startup work', async () => {
    const view = fixture();
    const result = await view.bootstrap.initialize();
    assert.equal(result.authenticated, true);
    assert.equal(view.getAccount().id, 'owner');
    assert.equal(view.getData().gigs.length, 1);
    assert.equal(view.countElement.textContent, '3 shows');
    assert.equal(view.authElements.accountName.value, 'Archive Owner');
    assert.deepEqual(view.calls.map(([name]) => name), ['account', 'authenticated', 'data', 'controller', 'after']);
  });

  test('uses lightweight stats for authenticated pages without gig data', async () => {
    const runtime = {
      requirementsFor: () => [],
      loadPageData: async () => ({ gigs: [], integrations: {}, profiles: [], sharedShows: [], peers: [] }),
      runController: async () => {}
    };
    const view = fixture({ page: 'maintenance', runtime });
    assert.equal(await view.bootstrap.updateCount({ gigs: [] }), 7);
    assert.equal(view.countElement.textContent, '7 shows');
  });
});
