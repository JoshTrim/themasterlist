const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createPeerIdentity } = require('../lib/peer-identity');
const { createPeerSync } = require('../lib/peer-sync');
const { createGigRepository } = require('../lib/gigs');
const { normaliseRating } = require('../lib/validation');

function instance(name) {
  const database = new Database(':memory:'); migrateSchema(database);
  const identity = createPeerIdentity({ database, crypto, now: () => new Date('2026-07-18T00:00:00Z'), instanceName: () => name }); identity.ensure();
  const gigs = createGigRepository({ database, mediaRows: () => [] });
  return { database, identity, gigs };
}

function addPeer(local, remote) {
  const row = remote.identity.row();
  local.database.prepare("INSERT INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at) VALUES (?, ?, ?, 'http://peer.local', ?, 'connected', 'now')").run(`id-${row.instanceId}`, row.instanceId, row.name, row.publicKey);
  return local.database.prepare('SELECT * FROM peer_instances WHERE peer_id = ?').get(row.instanceId);
}

function syncService(app, transport = { post: async () => ({ type: 'sync-response', snapshots: [] }) }) {
  return createPeerSync({
    database: app.database, identity: app.identity, transport, findGig: app.gigs.find,
    normaliseRating, createHash: crypto.createHash, detectConflict: () => ({ conflict: false }),
    now: () => '2026-07-18T00:00:00.000Z'
  });
}

test('two instances exchange a shared-show snapshot once and create a notification', () => {
  const alpha = instance('Alpha'); const beta = instance('Beta');
  addPeer(alpha, beta); const alphaOnBeta = addPeer(beta, alpha);
  const betaId = beta.identity.row().instanceId;
  alpha.database.prepare(`INSERT INTO gigs
    (id, shared_id, artist, venue, city, date, notes, songs, attendees, created_at)
    VALUES ('gig', 'shared', 'Artist', 'Venue', 'City', '2026-07-18', 'Great show', '[{"title":"Song"}]', ?, 'now')`).run(JSON.stringify([{ id: betaId, type: 'peer', name: 'Beta' }]));
  const outbound = syncService(alpha).localSnapshots(betaId);
  assert.equal(outbound.length, 1);
  const receiver = syncService(beta);
  assert.equal(receiver.applySnapshot(outbound[0], alphaOnBeta), true);
  assert.equal(receiver.applySnapshot(outbound[0], alphaOnBeta), false);
  assert.equal(beta.database.prepare('SELECT COUNT(*) AS count FROM shared_gig_contributions').get().count, 1);
  assert.equal(beta.database.prepare('SELECT type FROM notifications').get().type, 'peer-show-shared');
  alpha.database.close(); beta.database.close();
});

test('snapshot application rejects a contribution that contradicts the signer', () => {
  const alpha = instance('Alpha'); const beta = instance('Beta');
  const alphaOnBeta = addPeer(beta, alpha);
  const receiver = syncService(beta);
  const snapshot = { eventId: 'event', sharedGigId: 'shared', show: { artist: 'A', venue: 'V', city: 'C', date: '2026' }, contribution: { instanceId: 'impostor' } };
  assert.throws(() => receiver.applySnapshot(snapshot, alphaOnBeta), /identity does not match/);
  alpha.database.close(); beta.database.close();
});

test('failed outbound sync marks the peer unreachable', async () => {
  const alpha = instance('Alpha'); const beta = instance('Beta');
  const peer = addPeer(alpha, beta);
  const service = syncService(alpha, { post: async () => { throw new Error('offline'); } });
  await assert.rejects(service.syncWithPeer(peer), /offline/);
  assert.equal(alpha.database.prepare('SELECT status FROM peer_instances WHERE id = ?').get(peer.id).status, 'unreachable');
  alpha.database.close(); beta.database.close();
});
