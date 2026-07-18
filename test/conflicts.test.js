const { afterEach, beforeEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createConflictStore } = require('../lib/conflicts');

function databaseFor(instanceName, peerId, peerName) {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE gigs (id TEXT PRIMARY KEY, artist TEXT, venue TEXT, city TEXT, date TEXT, payload TEXT);
    CREATE TABLE peer_instances (peer_id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE peer_sync_baselines (shared_gig_id TEXT, peer_id TEXT, local_hash TEXT, remote_hash TEXT, synced_at TEXT, PRIMARY KEY (shared_gig_id, peer_id));
    CREATE TABLE peer_sync_conflicts (id TEXT PRIMARY KEY, shared_gig_id TEXT, peer_id TEXT, local_gig_id TEXT, local_payload TEXT, remote_payload TEXT, remote_snapshot TEXT, status TEXT, created_at TEXT, resolved_at TEXT, resolution TEXT);
    CREATE UNIQUE INDEX peer_sync_conflicts_open ON peer_sync_conflicts (shared_gig_id, peer_id) WHERE status = 'open';
  `);
  database.prepare('INSERT INTO gigs VALUES (?, ?, ?, ?, ?, ?)').run('gig-1', 'Artist', 'Venue', 'City', '2026-01-01', JSON.stringify({ notes: `${instanceName} initial`, songs: ['Song'] }));
  database.prepare('INSERT INTO peer_instances VALUES (?, ?)').run(peerId, peerName);
  const findGig = (id) => { const row = database.prepare('SELECT * FROM gigs WHERE id = ?').get(id); return { ...row, ...JSON.parse(row.payload) }; };
  const payloadFromGig = (gig) => ({ notes: gig.notes, songs: gig.songs });
  const payloadFromSnapshot = (snapshot) => snapshot.payload;
  return { database, findGig, store: createConflictStore({ database, findGig, payloadFromGig, payloadFromSnapshot, now: () => new Date('2026-07-18T00:00:00Z') }) };
}

describe('two-instance conflict state', () => {
  let first;
  let second;

  beforeEach(() => {
    first = databaseFor('First', 'second-instance', 'Second');
    second = databaseFor('Second', 'first-instance', 'First');
  });
  afterEach(() => { first.database.close(); second.database.close(); });

  function snapshot(peerId, payload) { return { sharedGigId: 'shared-1', contribution: { instanceId: peerId }, payload }; }

  test('establishes a baseline and accepts one-sided changes without a conflict', () => {
    const initialSecond = { notes: 'Second initial', songs: ['Song'] };
    assert.equal(first.store.detect(snapshot('second-instance', initialSecond), { peer_id: 'second-instance' }, first.findGig('gig-1')).conflict, false);
    const changedSecond = { notes: 'Second changed', songs: ['Song'] };
    assert.equal(first.store.detect(snapshot('second-instance', changedSecond), { peer_id: 'second-instance' }, first.findGig('gig-1')).conflict, false);
    assert.deepEqual(first.store.list(), []);
  });

  test('raises review items on both owners when both instances changed from their common baseline', () => {
    const firstInitial = { notes: 'First initial', songs: ['Song'] };
    const secondInitial = { notes: 'Second initial', songs: ['Song'] };
    first.store.detect(snapshot('second-instance', secondInitial), { peer_id: 'second-instance' }, first.findGig('gig-1'));
    second.store.detect(snapshot('first-instance', firstInitial), { peer_id: 'first-instance' }, second.findGig('gig-1'));
    first.database.prepare('UPDATE gigs SET payload = ? WHERE id = ?').run(JSON.stringify({ notes: 'First simultaneous edit', songs: ['Song'] }), 'gig-1');
    second.database.prepare('UPDATE gigs SET payload = ? WHERE id = ?').run(JSON.stringify({ notes: 'Second simultaneous edit', songs: ['Song'] }), 'gig-1');
    const onFirst = first.store.detect(snapshot('second-instance', { notes: 'Second simultaneous edit', songs: ['Song'] }), { peer_id: 'second-instance' }, first.findGig('gig-1'));
    const onSecond = second.store.detect(snapshot('first-instance', { notes: 'First simultaneous edit', songs: ['Song'] }), { peer_id: 'first-instance' }, second.findGig('gig-1'));
    assert.equal(onFirst.conflict, true);
    assert.equal(onSecond.conflict, true);
    assert.equal(first.store.list()[0].remote.notes, 'Second simultaneous edit');
    assert.equal(second.store.list()[0].remote.notes, 'First simultaneous edit');
  });
});
