const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createPeerIdentity } = require('../lib/peer-identity');
const { createPeerTransport } = require('../lib/peer-transport');

function pairFixture() {
  const now = () => new Date('2026-07-18T00:00:00Z');
  const make = (name) => {
    const database = new Database(':memory:'); migrateSchema(database);
    const identity = createPeerIdentity({ database, crypto, now, instanceName: () => name }); identity.ensure();
    return { database, identity };
  };
  const alpha = make('Alpha'); const beta = make('Beta');
  for (const [local, remote] of [[alpha, beta], [beta, alpha]]) {
    const row = remote.identity.row();
    local.database.prepare("INSERT INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at) VALUES (?, ?, ?, 'http://peer.local', ?, 'connected', 'now')").run(`id-${row.instanceId}`, row.instanceId, row.name, row.publicKey);
  }
  const peer = alpha.database.prepare('SELECT * FROM peer_instances WHERE peer_id = ?').get(beta.identity.row().instanceId);
  return { alpha, beta, peer };
}

function transport(identity, fetch, options = {}) {
  return createPeerTransport({ fetch, identity, timeoutMs: options.timeoutMs || 50, retries: options.retries ?? 1, retryBaseDelayMs: options.retryBaseDelayMs ?? 1, AbortController, setTimeout, clearTimeout });
}

test('peer transport retries a transient network failure with a newly signed request', async () => {
  const { alpha, beta, peer } = pairFixture();
  const nonces = [];
  let attempts = 0;
  const client = transport(alpha.identity, async (_url, options) => {
    attempts += 1;
    const request = JSON.parse(options.body);
    nonces.push(request.payload.nonce);
    if (attempts === 1) throw new Error('connection reset');
    return { ok: true, status: 200, json: async () => beta.identity.signEnvelope({ type: 'hello-response', requestNonce: request.payload.nonce, name: 'Beta' }) };
  });
  const reply = await client.post(peer, '/api/sync/hello', { type: 'hello' });
  assert.equal(reply.name, 'Beta');
  assert.equal(attempts, 2);
  assert.notEqual(nonces[0], nonces[1]);
  alpha.database.close(); beta.database.close();
});

test('peer transport rejects mismatched replies without retrying', async () => {
  const { alpha, beta, peer } = pairFixture();
  let attempts = 0;
  const client = transport(alpha.identity, async () => {
    attempts += 1;
    return { ok: true, status: 200, json: async () => beta.identity.signEnvelope({ type: 'hello-response', requestNonce: 'wrong' }) };
  });
  await assert.rejects(client.post(peer, '/api/sync/hello', { type: 'hello' }), /did not match/);
  assert.equal(attempts, 1);
  alpha.database.close(); beta.database.close();
});

test('peer transport turns an aborted request into a stable timeout error', async () => {
  const { alpha, beta, peer } = pairFixture();
  const client = transport(alpha.identity, (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); });
  }), { timeoutMs: 5, retries: 0 });
  await assert.rejects(client.post(peer, '/api/sync/hello', { type: 'hello' }), /timed out/);
  alpha.database.close(); beta.database.close();
});

test('pair confirmation wraps the invite and correlates the signed response', async () => {
  const { alpha, beta, peer } = pairFixture();
  let requestBody;
  const client = transport(alpha.identity, async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => beta.identity.signEnvelope({ type: 'pair-response', requestNonce: requestBody.envelope.payload.nonce }) };
  }, { retries: 0 });
  assert.equal(await client.confirmPair(peer, 'invite-token', { name: 'Alpha', publicKey: alpha.identity.row().publicKey, baseUrl: 'http://alpha.local' }), true);
  assert.equal(requestBody.inviteToken, 'invite-token');
  assert.equal(requestBody.envelope.payload.type, 'pair');
  alpha.database.close(); beta.database.close();
});
