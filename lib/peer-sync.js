function createPeerSync({ database, identity, transport, findGig, normaliseRating, createHash, detectConflict, now = () => new Date().toISOString() }) {
  const inFlight = new Map();

  function retryDelayMs(failures) {
    return Math.min(60 * 60 * 1000, 15 * 1000 * (2 ** Math.max(0, Number(failures || 1) - 1)));
  }

  function canAttempt(peer, force = false) {
    if (force || !peer?.next_retry_at) return true;
    const retryAt = Date.parse(peer.next_retry_at);
    return !Number.isFinite(retryAt) || retryAt <= Date.parse(now());
  }

  function recordSuccess(peer, { synced = true } = {}) {
    const timestamp = now();
    database.prepare(`UPDATE peer_instances SET status = 'connected', last_seen_at = ?, last_attempt_at = ?,
      last_sync_at = CASE WHEN ? THEN ? ELSE last_sync_at END, last_error = NULL,
      consecutive_failures = 0, next_retry_at = NULL WHERE id = ?`).run(timestamp, timestamp, synced ? 1 : 0, timestamp, peer.id);
    return timestamp;
  }

  function recordFailure(peer, error) {
    const current = database.prepare('SELECT consecutive_failures AS failures FROM peer_instances WHERE id = ?').get(peer.id);
    const failures = Number(current?.failures || 0) + 1;
    const attemptAt = now();
    const attemptMs = Date.parse(attemptAt);
    const nextRetryAt = new Date((Number.isFinite(attemptMs) ? attemptMs : Date.now()) + retryDelayMs(failures)).toISOString();
    const message = String(error?.message || 'Peer sync failed.').replace(/[\r\n]+/g, ' ').slice(0, 500);
    database.prepare(`UPDATE peer_instances SET status = 'unreachable', last_attempt_at = ?, last_error = ?,
      consecutive_failures = ?, next_retry_at = ? WHERE id = ?`).run(attemptAt, message, failures, nextRetryAt, peer.id);
    return { failures, nextRetryAt, error: message };
  }
  function contributionRows(sharedGigId) {
    return database.prepare(`SELECT shared_gig_id AS sharedGigId, instance_id AS instanceId, local_gig_id AS localGigId,
      participant_name AS participantName, performance_rating AS performanceRating, venue_rating AS venueRating,
      favorite, performance_notes AS performanceNotes, venue_notes AS venueNotes, media_manifest AS mediaManifest,
      updated_at AS updatedAt, shared.source_gig_id AS sourceGigId
      FROM shared_gig_contributions contribution JOIN shared_shows shared ON shared.id = contribution.shared_gig_id
      WHERE shared_gig_id = ? ORDER BY updated_at`).all(sharedGigId).map((entry) => {
      let media = [];
      try { media = JSON.parse(entry.mediaManifest || '[]'); } catch { media = []; }
      const local = entry.instanceId === identity.row().instanceId;
      if (!local) {
        const peer = database.prepare('SELECT name, status FROM peer_instances WHERE peer_id = ?').get(entry.instanceId);
        media = media.map((item) => {
          const base = `/api/peer-media/${encodeURIComponent(entry.instanceId)}/${encodeURIComponent(entry.sharedGigId)}/${encodeURIComponent(item.id)}`;
          return {
            ...item, remote: true, peerId: entry.instanceId, peerName: peer?.name || entry.participantName || 'Peer',
            remoteAvailable: peer?.status === 'connected', url: item.externalUrl || `${base}${item.useBackgroundRemoved ? '?variant=cutout' : ''}`,
            copyUrl: !item.externalUrl && entry.sourceGigId ? `${base}/copy` : null
          };
        });
      }
      return { ...entry, favorite: Boolean(entry.favorite), media };
    });
  }

  function localParticipantName() {
    return database.prepare('SELECT name FROM profiles WHERE is_admin = 1 ORDER BY created_at LIMIT 1').get()?.name || identity.row().name;
  }

  function mediaManifest(gig) {
    return (gig.media || []).map((item) => ({
      id: item.id, filename: item.filename, mimeType: item.mimeType, caption: item.caption || '', size: Number(item.size || 0),
      checksum: item.checksum || null, category: item.category || 'show', externalUrl: item.externalUrl || null,
      rotation: Number(item.rotation || 0), isCover: Boolean(item.isCover),
      useBackgroundRemoved: Boolean(item.useBackgroundRemoved && item.backgroundFilename),
      songIndex: item.songIndex ?? null, playbackPreferred: Boolean(item.playbackPreferred),
      playbackStart: item.playbackStart ?? null, playbackEnd: item.playbackEnd ?? null,
      sourceDuration: item.sourceDuration ?? null,
      playbackClips: Array.isArray(item.playbackClips) ? item.playbackClips : []
    }));
  }

  function conflictPayloadFromGig(gig) {
    return {
      notes: String(gig.performanceNotes || gig.notes || ''), venueNotes: String(gig.venueNotes || ''),
      performanceRating: normaliseRating(gig.performanceRating), venueRating: normaliseRating(gig.venueRating),
      favorite: Boolean(gig.favorite), songs: Array.isArray(gig.songs) ? gig.songs : [], media: mediaManifest(gig)
    };
  }

  function conflictPayloadFromSnapshot(snapshot) {
    const contribution = snapshot.contribution || {};
    return {
      notes: String(contribution.performanceNotes || ''), venueNotes: String(contribution.venueNotes || ''),
      performanceRating: normaliseRating(contribution.performanceRating), venueRating: normaliseRating(contribution.venueRating),
      favorite: Boolean(contribution.favorite), songs: Array.isArray(snapshot.show?.songs) ? snapshot.show.songs : [],
      media: Array.isArray(contribution.media) ? contribution.media : []
    };
  }

  function ensureSharedShow(gig) {
    const sharedGigId = gig.sharedId || gig.id;
    database.prepare(`INSERT INTO shared_shows
      (id, source_gig_id, artist, venue, city, date, setlist_fm_id, setlist_fm_url, songs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET source_gig_id=COALESCE(shared_shows.source_gig_id, excluded.source_gig_id),
        artist=excluded.artist, venue=excluded.venue, city=excluded.city, date=excluded.date,
        setlist_fm_id=excluded.setlist_fm_id, setlist_fm_url=excluded.setlist_fm_url, songs=excluded.songs`).run(
      sharedGigId, gig.id, gig.artist, gig.venue, gig.city, gig.date, gig.setlistFmId || null, gig.setlistFmUrl || null,
      JSON.stringify(gig.songs || []), gig.createdAt || now()
    );
    return sharedGigId;
  }

  function upsertLocalContribution(gig, updatedAt = now()) {
    const sharedGigId = ensureSharedShow(gig);
    const localIdentity = identity.row();
    database.prepare(`INSERT INTO shared_gig_contributions
      (shared_gig_id, instance_id, local_gig_id, participant_name, performance_rating, venue_rating, favorite, performance_notes, venue_notes, media_manifest, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shared_gig_id, instance_id) DO UPDATE SET local_gig_id=excluded.local_gig_id,
        participant_name=excluded.participant_name, performance_rating=excluded.performance_rating,
        venue_rating=excluded.venue_rating, favorite=excluded.favorite, performance_notes=excluded.performance_notes,
        venue_notes=excluded.venue_notes, media_manifest=excluded.media_manifest, updated_at=excluded.updated_at`).run(
      sharedGigId, localIdentity.instanceId, gig.id, localParticipantName(), gig.performanceRating ?? null, gig.venueRating ?? null,
      gig.favorite ? 1 : 0, gig.performanceNotes || gig.notes || '', gig.venueNotes || '', JSON.stringify(mediaManifest(gig)), updatedAt
    );
    return { sharedGigId, contribution: contributionRows(sharedGigId).find((entry) => entry.instanceId === localIdentity.instanceId) };
  }

  function localSnapshots(peerId) {
    const localIdentity = identity.row();
    return database.prepare('SELECT id FROM gigs ORDER BY created_at').all().map((row) => findGig(row.id)).filter((gig) =>
      (gig.attendees || []).some((attendee) => attendee.id === peerId)
    ).map((gig) => {
      const updatedAt = now();
      const { sharedGigId, contribution } = upsertLocalContribution(gig, updatedAt);
      const attendees = (gig.attendees || []).map((attendee) => attendee.type === 'owner'
        ? { id: localIdentity.instanceId, type: 'instance', name: localParticipantName() }
        : { id: attendee.id, type: 'instance', name: attendee.name });
      const show = { artist: gig.artist, venue: gig.venue, city: gig.city, date: gig.date, setlistFmId: gig.setlistFmId, setlistFmUrl: gig.setlistFmUrl, songs: gig.songs || [] };
      const contributionContent = { ...contribution };
      delete contributionContent.updatedAt;
      const eventPayload = { sharedGigId, instanceId: localIdentity.instanceId, show, attendees, contribution: contributionContent };
      return { eventId: createHash('sha256').update(JSON.stringify(eventPayload)).digest('hex'), sharedGigId, show, attendees, contribution };
    });
  }

  function matchingLocalGig(show) {
    return database.prepare(`SELECT id, shared_id FROM gigs WHERE lower(artist) = lower(?) AND lower(venue) = lower(?)
      AND lower(city) = lower(?) AND date = ? ORDER BY created_at LIMIT 1`).get(show.artist, show.venue, show.city, show.date);
  }

  function applySnapshot(snapshot, originPeer) {
    if (!snapshot?.eventId || !snapshot?.sharedGigId || !snapshot?.show || !snapshot?.contribution) return false;
    if (snapshot.contribution.instanceId !== originPeer.peer_id) throw new Error('Peer contribution identity does not match its signature.');
    if (database.prepare('SELECT 1 FROM sync_events WHERE event_id = ?').get(snapshot.eventId)) return false;
    const isNewContribution = !database.prepare('SELECT 1 FROM shared_gig_contributions WHERE shared_gig_id = ? AND instance_id = ?').get(snapshot.sharedGigId, originPeer.peer_id);
    const show = snapshot.show;
    if (![show.artist, show.venue, show.city].every((value) => typeof value === 'string') || typeof show.date !== 'string') throw new Error('Peer sent an invalid shared show.');
    let local = database.prepare('SELECT id, shared_id FROM gigs WHERE shared_id = ?').get(snapshot.sharedGigId);
    if (!local) local = matchingLocalGig(show);
    if (local && local.shared_id !== snapshot.sharedGigId && !database.prepare('SELECT 1 FROM gigs WHERE shared_id = ?').get(snapshot.sharedGigId)) database.prepare('UPDATE gigs SET shared_id = ? WHERE id = ?').run(snapshot.sharedGigId, local.id);
    const conflictState = detectConflict(snapshot, originPeer, local ? findGig(local.id) : null);
    const timestamp = now();
    database.transaction(() => {
      database.prepare(`INSERT INTO shared_shows
        (id, source_gig_id, artist, venue, city, date, setlist_fm_id, setlist_fm_url, songs, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET source_gig_id=COALESCE(shared_shows.source_gig_id, excluded.source_gig_id),
          artist=excluded.artist, venue=excluded.venue, city=excluded.city, date=excluded.date,
          setlist_fm_id=excluded.setlist_fm_id, setlist_fm_url=excluded.setlist_fm_url, songs=excluded.songs`).run(
        snapshot.sharedGigId, local?.id || null, show.artist, show.venue, show.city, show.date,
        show.setlistFmId || null, show.setlistFmUrl || null, JSON.stringify(Array.isArray(show.songs) ? show.songs : []), timestamp
      );
      const contribution = snapshot.contribution;
      database.prepare(`INSERT INTO shared_gig_contributions
        (shared_gig_id, instance_id, local_gig_id, participant_name, performance_rating, venue_rating, favorite, performance_notes, venue_notes, media_manifest, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shared_gig_id, instance_id) DO UPDATE SET participant_name=excluded.participant_name,
          performance_rating=excluded.performance_rating, venue_rating=excluded.venue_rating, favorite=excluded.favorite,
          performance_notes=excluded.performance_notes, venue_notes=excluded.venue_notes,
          media_manifest=excluded.media_manifest, updated_at=excluded.updated_at
        WHERE excluded.updated_at >= shared_gig_contributions.updated_at`).run(
        snapshot.sharedGigId, originPeer.peer_id, null, String(contribution.participantName || originPeer.name).slice(0, 100),
        normaliseRating(contribution.performanceRating), normaliseRating(contribution.venueRating), contribution.favorite ? 1 : 0,
        String(contribution.performanceNotes || '').slice(0, 20_000), String(contribution.venueNotes || '').slice(0, 20_000), JSON.stringify(Array.isArray(contribution.media) ? contribution.media.slice(0, 500) : []),
        contribution.updatedAt || timestamp
      );
      if (local) {
        const attendees = JSON.parse(database.prepare('SELECT attendees FROM gigs WHERE id = ?').get(local.id)?.attendees || '[]');
        if (!attendees.some((attendee) => attendee.id === originPeer.peer_id)) attendees.push({ id: originPeer.peer_id, type: 'peer', name: originPeer.name });
        database.prepare('UPDATE gigs SET attendees = ? WHERE id = ?').run(JSON.stringify(attendees), local.id);
        upsertLocalContribution(findGig(local.id), timestamp);
      }
      database.prepare('INSERT INTO sync_events (event_id, origin_instance_id, shared_gig_id, event_type, payload, created_at, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        snapshot.eventId, originPeer.peer_id, snapshot.sharedGigId, 'shared-gig.snapshot', JSON.stringify(snapshot), contribution.updatedAt || timestamp, timestamp
      );
      const notificationId = createHash('sha256').update(`peer-show:${originPeer.peer_id}:${snapshot.eventId}`).digest('hex');
      const notificationType = conflictState.conflict ? 'peer-sync-conflict' : (isNewContribution ? 'peer-show-shared' : 'peer-show-updated');
      database.prepare(`INSERT OR IGNORE INTO notifications
        (id, type, peer_id, shared_gig_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        notificationId, notificationType, originPeer.peer_id, snapshot.sharedGigId,
        conflictState.conflict ? `Review edits from ${originPeer.name}` : (isNewContribution ? `${originPeer.name} shared a show` : `${originPeer.name} updated a shared show`),
        `${show.artist} at ${show.venue}${show.city ? `, ${show.city}` : ''}`, timestamp
      );
    })();
    return true;
  }

  function syncWithPeer(peer, { force = false } = {}) {
    if (!peer?.base_url) throw new Error('Add a peer URL before syncing this instance.');
    const current = database.prepare('SELECT * FROM peer_instances WHERE id = ?').get(peer.id) || peer;
    if (!canAttempt(current, force)) return Promise.resolve({ ok: false, skipped: true, peerId: peer.id, peerName: peer.name, nextRetryAt: current.next_retry_at, error: current.last_error || 'Waiting to retry.' });
    if (inFlight.has(peer.id)) return inFlight.get(peer.id);
    const operation = Promise.resolve().then(async () => {
      try {
        const snapshots = localSnapshots(peer.peer_id);
        const reply = await transport.post(peer, '/api/sync/exchange', { type: 'sync-exchange', snapshots });
        if (reply.type !== 'sync-response' || !Array.isArray(reply.snapshots)) throw new Error('Peer returned an invalid sync response.');
        let applied = 0;
        for (const snapshot of reply.snapshots.slice(0, 500)) if (applySnapshot(snapshot, peer)) applied += 1;
        const timestamp = recordSuccess(peer);
        return { ok: true, peerId: peer.id, peerName: peer.name, sent: snapshots.length, received: reply.snapshots.length, applied, remoteApplied: Number(reply.applied || 0), lastSeenAt: timestamp, lastSyncAt: timestamp };
      } catch (error) {
        const failure = recordFailure(peer, error);
        error.peerSync = failure;
        throw error;
      } finally { inFlight.delete(peer.id); }
    });
    inFlight.set(peer.id, operation);
    return operation;
  }

  async function syncAll({ force = false } = {}) {
    const peers = database.prepare("SELECT * FROM peer_instances WHERE base_url <> '' ORDER BY name COLLATE NOCASE").all();
    const settled = await Promise.allSettled(peers.map((peer) => syncWithPeer(peer, { force })));
    const results = settled.map((result, index) => result.status === 'fulfilled' ? result.value : {
      ok: false, peerId: peers[index].id, peerName: peers[index].name,
      error: result.reason?.message || 'Sync failed.', failures: result.reason?.peerSync?.failures || 0,
      nextRetryAt: result.reason?.peerSync?.nextRetryAt || null
    });
    return {
      peers: peers.length, results,
      applied: results.reduce((sum, result) => sum + Number(result.applied || 0), 0),
      failed: results.filter((result) => !result.ok && !result.skipped).length,
      deferred: results.filter((result) => result.skipped).length
    };
  }

  return { contributionRows, mediaManifest, conflictPayloadFromGig, conflictPayloadFromSnapshot, upsertLocalContribution, localSnapshots, applySnapshot, retryDelayMs, canAttempt, recordSuccess, recordFailure, syncWithPeer, syncAll, inFlightCount: () => inFlight.size };
}

module.exports = { createPeerSync };
