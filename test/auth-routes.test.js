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

  test('requires a configured token for protected first-owner setup', async () => {
    handle = createAuthRoutes({
      database,
      auth,
      appOrigin: () => 'http://archive.test',
      now: () => new Date('2026-07-18T00:00:00Z'),
      setupToken: 'long-random-bootstrap-token',
      requireSetupToken: true
    });
    const status = response();
    await handle(request('GET'), status, url('/api/auth/status'));
    assert.equal(status.payload.setupTokenRequired, true);
    const rejected = response();
    await handle(request('POST', { name: 'Owner', password: 'owner-password', setupToken: 'wrong' }), rejected, url('/api/auth/setup'));
    assert.equal(rejected.status, 403);
    const accepted = response();
    await handle(request('POST', { name: 'Owner', password: 'owner-password', setupToken: 'long-random-bootstrap-token' }), accepted, url('/api/auth/setup'));
    assert.equal(accepted.status, 201);
  });

  test('logs in, changes credentials and invalidates the old password', async () => {
    const setup = response();
    await handle(request('POST', { name: 'Owner', password: 'owner-password' }), setup, url('/api/auth/setup'));
    const cookie = setup.headers['Set-Cookie'][0].split(';')[0];
    const changed = response();
    await handle(request('PATCH', { name: 'Renamed', currentPassword: 'owner-password', newPassword: 'replacement-password' }, cookie), changed, url('/api/auth/account'));
    assert.equal(changed.status, 200);
    assert.ok(changed.headers['Set-Cookie']);
    assert.equal(auth.currentAccount(request('GET', null, cookie)), null);
    const oldLogin = response();
    await handle(request('POST', { name: 'Renamed', password: 'owner-password' }), oldLogin, url('/api/auth/login'));
    assert.equal(oldLogin.status, 401);
    const newLogin = response();
    await handle(request('POST', { name: 'Renamed', password: 'replacement-password' }), newLogin, url('/api/auth/login'));
    assert.equal(newLogin.status, 200);
  });

  test('rate limits repeated sign-in failures and sends a retry interval', async () => {
    const setup = response();
    await handle(request('POST', { name: 'Owner', password: 'owner-password' }), setup, url('/api/auth/setup'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = response();
      await handle(request('POST', { name: 'Owner', password: 'wrong-password' }), failed, url('/api/auth/login'));
      assert.equal(failed.status, 401);
    }
    const blocked = response();
    await handle(request('POST', { name: 'Owner', password: 'owner-password' }), blocked, url('/api/auth/login'));
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers['Retry-After'], '900');
  });

  test('disables legacy same-instance account invitations and registration', async () => {
    const setup = response();
    await handle(request('POST', { name: 'Owner', password: 'owner-password' }), setup, url('/api/auth/setup'));
    const cookie = setup.headers['Set-Cookie'][0].split(';')[0];
    const invite = response();
    await handle(request('POST', {}, cookie), invite, url('/api/auth/invites'));
    assert.equal(invite.status, 410);
    const registered = response();
    await handle(request('POST', { inviteToken: 'legacy', name: 'Friend', password: 'friend-password' }), registered, url('/api/auth/register'));
    assert.equal(registered.status, 410);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM profiles').get().count, 1);
  });

  test('rejects legacy non-owner profiles and their existing sessions', async () => {
    database.prepare('INSERT INTO profiles VALUES (?, ?, ?, 0, ?)').run('legacy', 'Legacy', 'unused', '2026-01-01T00:00:00Z');
    database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(require('../lib/auth').tokenHash('legacy-token'), 'legacy', '2027-01-01T00:00:00Z');
    assert.equal(auth.currentAccount(request('GET', null, 'master_list_session=legacy-token')), null);
    const login = response();
    await handle(request('POST', { name: 'Legacy', password: 'anything-long' }), login, url('/api/auth/login'));
    assert.equal(login.status, 401);
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
