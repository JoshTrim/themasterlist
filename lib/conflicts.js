'use strict';

const { randomUUID } = require('node:crypto');
const { syncPayloadHash } = require('./sync-merge');

function createConflictStore({ database, payloadFromGig, payloadFromSnapshot, findGig, now = () => new Date() }) {
  function detect(snapshot, originPeer, localGig) {
    if (!localGig) return { conflict: false, localPayload: null, remotePayload: payloadFromSnapshot(snapshot) };
    const localPayload = payloadFromGig(localGig);
    const remotePayload = payloadFromSnapshot(snapshot);
    const localHash = syncPayloadHash(localPayload);
    const remoteHash = syncPayloadHash(remotePayload);
    const baseline = database.prepare('SELECT * FROM peer_sync_baselines WHERE shared_gig_id = ? AND peer_id = ?').get(snapshot.sharedGigId, originPeer.peer_id);
    const conflict = Boolean(baseline && baseline.local_hash !== localHash && baseline.remote_hash !== remoteHash && localHash !== remoteHash);
    const timestamp = now().toISOString();
    if (conflict) {
      database.prepare(`INSERT INTO peer_sync_conflicts
        (id, shared_gig_id, peer_id, local_gig_id, local_payload, remote_payload, remote_snapshot, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
        ON CONFLICT(shared_gig_id, peer_id) WHERE status = 'open' DO UPDATE SET
          local_payload=excluded.local_payload, remote_payload=excluded.remote_payload,
          remote_snapshot=excluded.remote_snapshot, created_at=excluded.created_at`).run(
        randomUUID(), snapshot.sharedGigId, originPeer.peer_id, localGig.id,
        JSON.stringify(localPayload), JSON.stringify(remotePayload), JSON.stringify(snapshot), timestamp
      );
    } else {
      database.prepare(`INSERT INTO peer_sync_baselines (shared_gig_id, peer_id, local_hash, remote_hash, synced_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(shared_gig_id, peer_id) DO UPDATE SET local_hash=excluded.local_hash,
          remote_hash=excluded.remote_hash, synced_at=excluded.synced_at`).run(snapshot.sharedGigId, originPeer.peer_id, localHash, remoteHash, timestamp);
    }
    return { conflict, localPayload, remotePayload };
  }

  function list(status = 'open') {
    return database.prepare(`SELECT c.*, p.name AS peer_name, g.artist, g.venue, g.city, g.date
      FROM peer_sync_conflicts c
      JOIN peer_instances p ON p.peer_id = c.peer_id
      JOIN gigs g ON g.id = c.local_gig_id
      WHERE c.status = ? ORDER BY c.created_at DESC`).all(status).map((row) => ({
      id: row.id,
      sharedGigId: row.shared_gig_id,
      localGigId: row.local_gig_id,
      peerId: row.peer_id,
      peerName: row.peer_name,
      artist: row.artist,
      venue: row.venue,
      city: row.city,
      date: row.date,
      local: payloadFromGig(findGig(row.local_gig_id)),
      remote: JSON.parse(row.remote_payload),
      createdAt: row.created_at
    }));
  }

  return { detect, list };
}

module.exports = { createConflictStore };
