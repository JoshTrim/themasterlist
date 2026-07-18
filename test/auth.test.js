const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { hashPassword, passwordMatches, cookieValue, tokenHash, createAuth } = require('../lib/auth');

describe('authentication primitives', () => {
  test('hashes passwords with unique salts and verifies without storing plaintext', () => {
    const first = hashPassword('correct horse battery staple');
    const second = hashPassword('correct horse battery staple');
    assert.notEqual(first, second);
    assert.match(first, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.equal(passwordMatches('correct horse battery staple', first), true);
    assert.equal(passwordMatches('incorrect', first), false);
    assert.equal(passwordMatches('anything', 'malformed'), false);
    assert.equal(passwordMatches('anything', 'scrypt:salt:not-hex'), false);
  });

  test('reads exact cookie names and decodes their values', () => {
    const request = { headers: { cookie: 'other=1; session_name=a%20b; session=wrong' } };
    assert.equal(cookieValue(request, 'session_name'), 'a b');
    assert.equal(cookieValue(request, 'missing'), null);
  });

  test('hashes session tokens deterministically', () => {
    assert.equal(tokenHash('token'), tokenHash('token'));
    assert.notEqual(tokenHash('token'), tokenHash('other'));
    assert.equal(tokenHash('token').length, 64);
  });

  test('creates instance-specific secure sessions and resolves the signed-in account', () => {
    const database = new Database(':memory:');
    database.exec(`
      CREATE TABLE instance_identity (id INTEGER PRIMARY KEY, instance_id TEXT NOT NULL);
      CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT, is_admin INTEGER, password_hash TEXT);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, profile_id TEXT, expires_at TEXT);
      INSERT INTO instance_identity VALUES (1, 'instance-abcdef1234567890');
      INSERT INTO profiles VALUES ('owner', 'Owner', 1, 'hash');
    `);
    const clock = new Date('2026-07-18T00:00:00.000Z');
    const auth = createAuth({ database, env: { INSTANCE_URL: 'https://archive.example' }, now: () => clock });
    assert.equal(auth.sessionCookieName(), 'master_list_session_instanceabcd');
    assert.equal(auth.sessionCookieSecure(), true);
    assert.equal(auth.accountsConfigured(), true);
    const headers = auth.sessionHeaders('owner');
    const cookie = headers['Set-Cookie'][0];
    assert.match(cookie, /HttpOnly; SameSite=Lax/);
    assert.match(cookie, /; Secure/);
    const request = { headers: { cookie: cookie.split(';')[0] } };
    assert.deepEqual(auth.currentAccount(request), { id: 'owner', name: 'Owner', isAdmin: 1 });
    assert.equal(auth.requireAccount(request).id, 'owner');
    assert.throws(() => auth.requireAccount({ headers: {} }), (error) => error.status === 401);
    assert.equal(auth.expiredSessionCookies().length, 2);
    database.close();
  });

  test('supports the legacy cookie during migration and rejects expired sessions', () => {
    const database = new Database(':memory:');
    database.exec(`
      CREATE TABLE instance_identity (id INTEGER PRIMARY KEY, instance_id TEXT NOT NULL);
      CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT, is_admin INTEGER, password_hash TEXT);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, profile_id TEXT, expires_at TEXT);
      INSERT INTO instance_identity VALUES (1, 'local-id');
      INSERT INTO profiles VALUES ('owner', 'Owner', 1, 'hash');
    `);
    const auth = createAuth({ database, env: { SESSION_COOKIE_SECURE: 'false' }, now: () => new Date('2026-07-18T00:00:00Z') });
    database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(tokenHash('legacy-token'), 'owner', '2026-07-17T00:00:00Z');
    assert.equal(auth.currentAccount({ headers: { cookie: 'master_list_session=legacy-token' } }), null);
    database.prepare('UPDATE sessions SET expires_at = ?').run('2026-07-19T00:00:00Z');
    assert.equal(auth.currentAccount({ headers: { cookie: 'master_list_session=legacy-token' } }).name, 'Owner');
    assert.equal(auth.sessionCookieSecure(), false);
    database.close();
  });
});
