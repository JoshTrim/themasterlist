const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createApiClient } = require('../public/lib/api-client');
const { requirementsFor, loadPageData, runController } = require('../public/lib/page-runtime');

function response({ ok = true, status = 200, contentType = 'application/json', payload = null, body = '' } = {}) {
  return {
    ok,
    status,
    headers: { get: () => contentType },
    json: async () => payload,
    text: async () => body
  };
}

describe('frontend API client', () => {
  test('returns JSON and preserves useful API errors', async () => {
    const success = createApiClient({ fetch: async () => response({ payload: { shows: 3 } }) });
    assert.deepEqual(await success.json('/api/test'), { shows: 3 });

    const failed = createApiClient({ fetch: async () => response({ ok: false, status: 422, payload: { error: 'Invalid show.' } }) });
    await assert.rejects(failed.json('/api/test'), (error) => error.message === 'Invalid show.' && error.status === 422);
  });

  test('handles successful empty responses and non-JSON failures', async () => {
    const empty = createApiClient({ fetch: async () => response({ status: 204 }) });
    assert.equal(await empty.json('/api/test'), null);

    const failed = createApiClient({ fetch: async () => response({ ok: false, status: 502, contentType: 'text/plain', body: 'Proxy unavailable' }) });
    await assert.rejects(failed.json('/api/test'), /Proxy unavailable/);
  });
});

describe('route-aware frontend runtime', () => {
  test('loads no archive data for signed-out or shell-only pages', () => {
    assert.deepEqual(requirementsFor('shows', false), []);
    assert.deepEqual(requirementsFor('home'), []);
    assert.deepEqual(requirementsFor('login'), []);
  });

  test('loads only the datasets required by the current page', async () => {
    const requests = [];
    const data = await loadPageData('map', {
      fetchJson: async (url) => { requests.push(url); return [{ id: 'gig-1' }]; }
    });
    assert.deepEqual(requests, ['/api/gigs']);
    assert.deepEqual(data.gigs, [{ id: 'gig-1' }]);
    assert.deepEqual(data.integrations, {});
    assert.deepEqual(data.sharedShows, []);
  });

  test('includes collaboration data only where it is used', () => {
    assert.deepEqual(requirementsFor('add'), ['gigs', 'sharedShows', 'peers']);
    assert.deepEqual(requirementsFor('shows'), ['gigs', 'integrations', 'sharedShows']);
    assert.deepEqual(requirementsFor('account'), ['gigs', 'profiles', 'sharedShows', 'peers']);
  });

  test('dispatches one page controller', async () => {
    const calls = [];
    const result = await runController('shows', {
      shows: async (context) => { calls.push(context.page); return 'rendered'; },
      map: async () => calls.push('map')
    }, { page: 'shows' });
    assert.equal(result, 'rendered');
    assert.deepEqual(calls, ['shows']);
  });
});
