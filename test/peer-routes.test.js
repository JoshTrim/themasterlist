const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createPeerIdentity } = require('../lib/peer-identity');
const { createPeerRoutes } = require('../lib/routes/peers');
const { sendJson, sendError } = require('../lib/http');

function response() {
  return { status: null, body: '', writeHead(status) { this.status = status; }, end(body = '') { this.body = body; } };
}

function instance(name) {
  const database = new Database(':memory:'); migrateSchema(database);
  const identity = createPeerIdentity({ database, crypto, now: () => new Date('2026-07-18T00:00:00Z'), instanceName: () => name }); identity.ensure();
  return { database, identity };
}

function handler(app, overrides = {}) {
  let sequence = 0;
  return createPeerRoutes({
    database: app.database, identity: app.identity,
    transport: overrides.transport || { confirmPair: async () => false, post: async () => ({ name: 'Peer' }) },
    sync: overrides.sync || { applySnapshot: () => true, localSnapshots: () => [], syncWithPeer: async () => ({ ok: true, applied: 0 }) },
    requireAccount: overrides.requireAccount || (() => ({ id: 'owner', isAdmin: true })),
    readBody: async (request) => request.body, sendJson, sendError,
    appOrigin: () => 'http://local.test', instanceUrl: () => 'http://local.test',
    randomUUID: () => `peer-row-${++sequence}`, now: () => '2026-07-18T00:00:00.000Z'
  });
}

test('pair, hello and replay protection work without an account session', async () => {
  const alpha = instance('Alpha'); const beta = instance('Beta');
  const route = handler(beta);
  const pairEnvelope = alpha.identity.signEnvelope({ type: 'pair', name: 'Alpha', publicKey: alpha.identity.row().publicKey, baseUrl: 'http://alpha.test' });
  const inviteToken = beta.identity.createInvite('http://beta.test');
  const paired = response();
  await route({ method: 'POST', headers: {}, body: { inviteToken, envelope: pairEnvelope } }, paired, new URL('http://beta.test/api/sync/pair'));
  assert.equal(paired.status, 200);
  assert.equal(beta.database.prepare('SELECT status FROM peer_instances').get().status, 'connected');
  const reused = response();
  const secondEnvelope = alpha.identity.signEnvelope({ type: 'pair', name: 'Alpha', publicKey: alpha.identity.row().publicKey, baseUrl: 'http://alpha.test' });
  await route({ method: 'POST', headers: {}, body: { inviteToken, envelope: secondEnvelope } }, reused, new URL('http://beta.test/api/sync/pair'));
  assert.equal(reused.status, 400);
  assert.match(JSON.parse(reused.body).error, /already been used/);

  const helloEnvelope = alpha.identity.signEnvelope({ type: 'hello' });
  const hello = response();
  await route({ method: 'POST', headers: {}, body: helloEnvelope }, hello, new URL('http://beta.test/api/sync/hello'));
  assert.equal(hello.status, 200);
  const replay = response();
  await route({ method: 'POST', headers: {}, body: helloEnvelope }, replay, new URL('http://beta.test/api/sync/hello'));
  assert.equal(replay.status, 401);
  assert.match(JSON.parse(replay.body).error, /already been used/);
  alpha.database.close(); beta.database.close();
});

test('signed exchanges cap inbound snapshots and return a correlated response', async () => {
  const alpha = instance('Alpha'); const beta = instance('Beta');
  const alphaRow = alpha.identity.row();
  beta.database.prepare("INSERT INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at) VALUES ('alpha', ?, 'Alpha', 'http://alpha.test', ?, 'connected', 'now')").run(alphaRow.instanceId, alphaRow.publicKey);
  let applied = 0;
  const route = handler(beta, { sync: { applySnapshot: () => { applied += 1; return true; }, localSnapshots: () => [{ eventId: 'reply' }] } });
  const requestEnvelope = alpha.identity.signEnvelope({ type: 'sync-exchange', snapshots: Array.from({ length: 510 }, (_, index) => ({ eventId: String(index) })) });
  const result = response();
  await route({ method: 'POST', headers: {}, body: requestEnvelope }, result, new URL('http://beta.test/api/sync/exchange'));
  assert.equal(result.status, 200);
  assert.equal(applied, 500);
  const responseEnvelope = JSON.parse(result.body);
  assert.equal(responseEnvelope.payload.requestNonce, requestEnvelope.payload.nonce);
  assert.equal(responseEnvelope.payload.applied, 500);
  alpha.database.close(); beta.database.close();
});

test('account-facing peer creation validates URLs and requires authentication', async () => {
  const app = instance('Local');
  let authChecks = 0;
  const route = handler(app, { requireAccount: () => { authChecks += 1; return { id: 'owner' }; } });
  const invalid = response();
  await route({ method: 'POST', headers: {}, body: { peerId: 'remote', name: 'Remote', publicKey: 'key', baseUrl: 'file:///tmp/peer' } }, invalid, new URL('http://local.test/api/peers'));
  assert.equal(invalid.status, 400);
  assert.equal(authChecks, 1);
  for (const baseUrl of ['http://127.0.0.1:3000', 'http://localhost:3000', 'http://169.254.169.254/latest/meta-data']) {
    const blocked = response();
    await route({ method: 'POST', headers: {}, body: { peerId: `remote-${baseUrl}`, name: 'Remote', publicKey: 'key', baseUrl } }, blocked, new URL('http://local.test/api/peers'));
    assert.equal(blocked.status, 400);
  }
  assert.equal(app.database.prepare('SELECT COUNT(*) AS count FROM peer_instances').get().count, 0);
  app.database.close();
});

test('account peer lifecycle exposes health, notifications, bulk sync and deletion', async () => {
  const app = instance('Local');
  const remote = instance('Remote');
  let syncCalls = 0;
  const route = handler(app, {
    transport: { confirmPair: async () => false, post: async () => ({ name: 'Remote' }) },
    sync: { applySnapshot: () => false, localSnapshots: () => [], syncWithPeer: async (peer) => { syncCalls += 1; return { ok: true, peerId: peer.id, applied: 2 }; } }
  });
  const created = response();
  await route({ method: 'POST', headers: {}, body: { peerId: remote.identity.row().instanceId, name: 'Remote', publicKey: remote.identity.row().publicKey, baseUrl: 'http://remote.test/' } }, created, new URL('http://local.test/api/peers'));
  assert.equal(created.status, 201);
  const peer = JSON.parse(created.body);
  app.database.prepare("UPDATE peer_instances SET status = 'connected' WHERE id = ?").run(peer.id);

  app.database.prepare("INSERT INTO notifications (id, type, title, body, created_at) VALUES ('abc123', 'peer-show-shared', 'Shared', 'Show', 'now')").run();
  const notifications = response();
  await route({ method: 'GET', headers: {} }, notifications, new URL('http://local.test/api/notifications'));
  assert.equal(JSON.parse(notifications.body)[0].unread, true);
  const read = response();
  await route({ method: 'POST', headers: {} }, read, new URL('http://local.test/api/notifications/read-all'));
  assert.equal(JSON.parse(read.body).updated, 1);

  const health = response();
  await route({ method: 'POST', headers: {} }, health, new URL(`http://local.test/api/peers/${peer.id}/test`));
  assert.equal(health.status, 200);
  const synced = response();
  await route({ method: 'POST', headers: {} }, synced, new URL('http://local.test/api/peers/sync-all'));
  assert.equal(JSON.parse(synced.body).applied, 2);
  assert.equal(syncCalls, 1);

  const deleted = response();
  await route({ method: 'DELETE', headers: {} }, deleted, new URL(`http://local.test/api/peers/${peer.id}`));
  assert.equal(app.database.prepare('SELECT COUNT(*) AS count FROM peer_instances').get().count, 0);
  app.database.close(); remote.database.close();
});
