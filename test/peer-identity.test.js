const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createPeerIdentity } = require('../lib/peer-identity');

function instance(name, date = new Date('2026-07-18T00:00:00Z')) {
  const database = new Database(':memory:');
  migrateSchema(database);
  const identity = createPeerIdentity({ database, crypto, now: () => date, instanceName: () => name });
  identity.ensure();
  return { database, identity };
}

function pair(left, right) {
  const peer = right.identity.row();
  left.database.prepare("INSERT INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at) VALUES (?, ?, ?, '', ?, 'connected', 'now')").run(`peer-${peer.instanceId}`, peer.instanceId, peer.name, peer.publicKey);
}

test('paired instances sign and verify envelopes exactly once', () => {
  const alpha = instance('Alpha');
  const beta = instance('Beta');
  pair(alpha, beta);
  pair(beta, alpha);
  const envelope = alpha.identity.signEnvelope({ type: 'hello' });
  const verified = beta.identity.verifyPeerEnvelope(envelope, alpha.identity.row().instanceId);
  assert.equal(verified.payload.type, 'hello');
  assert.equal(verified.peer.name, 'Alpha');
  assert.throws(() => beta.identity.verifyPeerEnvelope(envelope), /already been used/);
  alpha.database.close(); beta.database.close();
});

test('peer verification rejects tampering, unexpected origins and stale requests', () => {
  const alpha = instance('Alpha');
  const beta = instance('Beta');
  pair(beta, alpha);
  const tampered = alpha.identity.signEnvelope({ type: 'hello' });
  tampered.payload.type = 'sync-exchange';
  assert.throws(() => beta.identity.verifyPeerEnvelope(tampered), /signature/);

  const fresh = alpha.identity.signEnvelope({ type: 'hello' });
  assert.throws(() => beta.identity.verifyPeerEnvelope(fresh, 'someone-else'), /unexpected instance/);

  const lateBeta = createPeerIdentity({ database: beta.database, crypto, now: () => new Date('2026-07-18T00:11:00Z'), instanceName: () => 'Beta' });
  const stale = alpha.identity.signEnvelope({ type: 'hello' });
  assert.throws(() => lateBeta.verifyPeerEnvelope(stale), /expired/);
  alpha.database.close(); beta.database.close();
});

test('pairing invites are self-verifying and reject altered payloads', () => {
  const alpha = instance('Alpha');
  const token = alpha.identity.createInvite('http://alpha.local/');
  const invite = alpha.identity.parseInvite(token);
  assert.equal(invite.name, 'Alpha');
  assert.equal(invite.baseUrl, 'http://alpha.local');
  const envelope = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  envelope.payload.name = 'Mallory';
  const altered = Buffer.from(JSON.stringify(envelope)).toString('base64url');
  assert.throws(() => alpha.identity.parseInvite(altered), /signature/);
  const later = createPeerIdentity({ database: alpha.database, crypto, now: () => new Date('2026-07-26T00:00:00Z'), instanceName: () => 'Alpha' });
  assert.throws(() => later.parseInvite(token), /expired/);
  alpha.database.close();
});
