const { beforeEach, afterEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createAuth } = require('../lib/auth');
const { createAuthRoutes } = require('../lib/routes/auth');

function request(method, body = null, cookie = '') {
  const encoded = body === null ? [] : [Buffer.from(JSON.stringify(body))];
  return { method, headers: { cookie, host: 'archive.test' }, async *[Symbol.asyncIterator]() { yield* encoded; } };
}

function response() {
  return { status: null, headers: {}, payload: null, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body = '') { this.payload = body ? JSON.parse(body) : null; } };
}

describe('authentication routes without a network listener', () => {
  let database;
  let auth;
  let handle;
  const url = (pathname) => new URL(pathname, 'http://archive.test');

  beforeEach(() => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE instance_identity (id INTEGER PRIMARY KEY, instance_id TEXT NOT NULL);
      CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT UNIQUE, password_hash TEXT, is_admin INTEGER, created_at TEXT);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, profile_id TEXT, expires_at TEXT);
      CREATE TABLE invites (token_hash TEXT PRIMARY KEY, created_by TEXT, expires_at TEXT, used_at TEXT);
      INSERT INTO instance_identity VALUES (1, 'route-test-instance');
    `);
    auth = createAuth({ database, env: { SESSION_COOKIE_SECURE: 'false' }, now: () => new Date('2026-07-18T00:00:00Z') });
    handle = createAuthRoutes({ database, auth, appOrigin: () => 'http://archive.test', now: () => new Date('2026-07-18T00:00:00Z') });
  });

  afterEach(() => database.close());

  test('sets up the owner, reports status and rejects repeated setup', async () => {
    const setup = response();
    assert.equal(await handle(request('POST', { name: 'Owner', password: 'owner-password' }), setup, url('/api/auth/setup')), true);
    assert.equal(setup.status, 201);
    assert.equal(setup.payload.isAdmin, 1);
    const cookie = setup.headers['Set-Cookie'][0].split(';')[0];
    const status = response();
    await handle(request('GET', null, cookie), status, url('/api/auth/status'));
    assert.equal(status.payload.configured, true);
    assert.equal(status.payload.account.name, 'Owner');
    const duplicate = response();
    await handle(request('POST', { name: 'Other', password: 'other-password' }), duplicate, url('/api/auth/setup'));
    assert.equal(duplicate.status, 403);
  });

  test('logs in, changes credentials and invalidates the old password', async () => {
    const setup = response();
    await handle(request('POST', { name: 'Owner', password: 'owner-password' }), setup, url('/api/auth/setup'));
    const cookie = setup.headers['Set-Cookie'][0].split(';')[0];
    const changed = response();
    await handle(request('PATCH', { name: 'Renamed', currentPassword: 'owner-password', newPassword: 'replacement-password' }, cookie), changed, url('/api/auth/account'));
    assert.equal(changed.status, 200);
    const oldLogin = response();
    await handle(request('POST', { name: 'Renamed', password: 'owner-password' }), oldLogin, url('/api/auth/login'));
    assert.equal(oldLogin.status, 401);
    const newLogin = response();
    await handle(request('POST', { name: 'Renamed', password: 'replacement-password' }), newLogin, url('/api/auth/login'));
    assert.equal(newLogin.status, 200);
  });

  test('creates a single-use invite and registers another account', async () => {
    const setup = response();
    await handle(request('POST', { name: 'Owner', password: 'owner-password' }), setup, url('/api/auth/setup'));
    const cookie = setup.headers['Set-Cookie'][0].split(';')[0];
    const invite = response();
    await handle(request('POST', {}, cookie), invite, url('/api/auth/invites'));
    assert.equal(invite.status, 201);
    const token = new URL(invite.payload.inviteUrl).searchParams.get('invite');
    const registered = response();
    await handle(request('POST', { inviteToken: token, name: 'Friend', password: 'friend-password' }), registered, url('/api/auth/register'));
    assert.equal(registered.status, 201);
    assert.equal(registered.payload.isAdmin, 0);
    const reused = response();
    await handle(request('POST', { inviteToken: token, name: 'Another', password: 'another-password' }), reused, url('/api/auth/register'));
    assert.equal(reused.status, 403);
  });

  test('logs out the current token and ignores non-auth routes', async () => {
    const setup = response();
    await handle(request('POST', { name: 'Owner', password: 'owner-password' }), setup, url('/api/auth/setup'));
    const cookie = setup.headers['Set-Cookie'][0].split(';')[0];
    const logout = response();
    await handle(request('POST', {}, cookie), logout, url('/api/auth/logout'));
    assert.equal(logout.status, 200);
    assert.equal(auth.currentAccount(request('GET', null, cookie)), null);
    assert.equal(await handle(request('GET'), response(), url('/api/gigs')), false);
  });
});
