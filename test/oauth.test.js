const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createOAuthService, refreshWasRejected } = require('../lib/oauth');

function harness({ clock = 1_000, connected = {} } = {}) {
  let now = clock;
  let connections = structuredClone(connected);
  const requests = [];
  const service = createOAuthService({
    providers: {
      spotify: { name: 'Spotify', clientId: 'spotify-id', clientSecret: 'spotify-secret', authorizationUrl: 'https://accounts.spotify.test/authorize', tokenUrl: 'https://accounts.spotify.test/token', scope: 'playlist', basicAuth: true },
      youtube: { name: 'YouTube', clientId: 'google-id', clientSecret: 'google-secret', authorizationUrl: 'https://google.test/auth', tokenUrl: 'https://google.test/token', scope: 'youtube', authorizationParams: { access_type: 'offline', prompt: 'consent' } }
    },
    requestJson: async (url, options, provider) => { requests.push({ url, options, provider }); return { access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }; },
    readConnections: async () => structuredClone(connections),
    writeConnections: async (value) => { connections = structuredClone(value); },
    randomUUID: () => 'state-1', now: () => now
  });
  return { service, requests, connections: () => connections, advance: (milliseconds) => { now += milliseconds; } };
}

describe('OAuth service', () => {
  test('creates provider-specific authorization URLs', () => {
    const { service } = harness();
    const spotify = service.begin('spotify', 'http://127.0.0.1/callback', 'owner');
    assert.equal(spotify.searchParams.get('state'), 'state-1');
    assert.equal(spotify.searchParams.get('scope'), 'playlist');
    const youtube = harness().service.begin('youtube', 'http://localhost/callback', 'owner');
    assert.equal(youtube.searchParams.get('access_type'), 'offline');
    assert.equal(youtube.searchParams.get('prompt'), 'consent');
  });

  test('exchanges a valid callback and persists its connection', async () => {
    const state = harness();
    state.service.begin('spotify', 'http://127.0.0.1/callback', 'owner');
    assert.deepEqual(await state.service.complete('spotify', { state: 'state-1', code: 'code', subject: 'owner' }), { connected: 'spotify' });
    assert.equal(state.connections().spotify.accessToken, 'new-token');
    const request = state.requests[0];
    assert.match(request.options.headers.Authorization, /^Basic /);
    assert.equal(request.options.body.get('redirect_uri'), 'http://127.0.0.1/callback');
  });

  test('rejects expired, replayed and denied callbacks', async () => {
    const expired = harness(); expired.service.begin('spotify', 'callback', 'owner'); expired.advance(10 * 60_000 + 1);
    assert.deepEqual(await expired.service.complete('spotify', { state: 'state-1', code: 'code', subject: 'owner' }), { error: 'invalid-state' });
    const denied = harness(); denied.service.begin('youtube', 'callback', 'owner');
    assert.deepEqual(await denied.service.complete('youtube', { state: 'state-1', error: 'access_denied', subject: 'owner' }), { error: 'authorization-denied' });
    assert.deepEqual(await denied.service.complete('youtube', { state: 'state-1', code: 'code', subject: 'owner' }), { error: 'invalid-state' });
  });

  test('binds pending authorization state to the signed-in owner', async () => {
    const state = harness();
    state.service.begin('spotify', 'callback', 'owner-one');
    assert.deepEqual(await state.service.complete('spotify', { state: 'state-1', code: 'code', subject: 'owner-two' }), { error: 'invalid-state' });
    assert.equal(state.requests.length, 0);
  });

  test('reuses valid tokens and refreshes expiring ones', async () => {
    const valid = harness({ connected: { spotify: { accessToken: 'old', refreshToken: 'refresh', expiresAt: 100_000 } } });
    assert.equal(await valid.service.accessToken('spotify'), 'old');
    assert.equal(valid.requests.length, 0);
    const stale = harness({ connected: { youtube: { accessToken: 'old', refreshToken: 'refresh', expiresAt: 1_001 } } });
    assert.equal(await stale.service.accessToken('youtube'), 'new-token');
    assert.equal(stale.requests[0].options.body.get('client_secret'), 'google-secret');
    assert.equal(stale.requests[0].options.body.get('grant_type'), 'refresh_token');
  });

  test('clears a connection and requests reconnection when its refresh token is rejected', async () => {
    let connections = { youtube: { accessToken: 'old', refreshToken: 'revoked', expiresAt: 1 } };
    const service = createOAuthService({
      providers: { youtube: { name: 'YouTube', clientId: 'id', clientSecret: 'secret', tokenUrl: 'https://google.test/token' } },
      requestJson: async () => { throw new Error('youtube: Token has been expired or revoked.'); },
      readConnections: async () => structuredClone(connections),
      writeConnections: async (value) => { connections = structuredClone(value); },
      randomUUID: () => 'state', now: () => 10_000
    });
    await assert.rejects(service.accessToken('youtube'), (error) => error.code === 'reconnect-required' && error.status === 401);
    assert.equal(connections.youtube, undefined);
  });

  test('recognizes Google refresh-token rejection errors', () => {
    assert.equal(refreshWasRejected(new Error('youtube: invalid_grant')), true);
    assert.equal(refreshWasRejected(new Error('youtube: Token has been expired or revoked.')), true);
    assert.equal(refreshWasRejected(new Error('youtube: temporarily unavailable')), false);
  });

  test('reports configuration and connection state', async () => {
    const { service } = harness({ connected: { youtube: { accessToken: 'token' } } });
    assert.deepEqual(await service.connectionStatus(), { spotify: { configured: true, connected: false }, youtube: { configured: true, connected: true } });
  });
});
