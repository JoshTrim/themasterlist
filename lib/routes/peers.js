function createPeerRoutes({
  database, identity, transport, sync, requireAccount, readBody, sendJson, sendError,
  appOrigin, instanceUrl = () => '', randomUUID, now = () => new Date().toISOString()
}) {
  function cleanBaseUrl(value) {
    const baseUrl = String(value || '').trim().replace(/\/$/, '');
    if (!baseUrl) return '';
    let parsed;
    try { parsed = new URL(baseUrl); } catch { throw new Error('Peer URL must be a valid HTTP or HTTPS URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) throw new Error('Peer URL must be a plain HTTP or HTTPS origin.');
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (['localhost', '0.0.0.0', '::', '::1'].includes(hostname) || /^127\./.test(hostname) || /^169\.254\./.test(hostname) || /^fe[89ab][0-9a-f]:/i.test(hostname)) throw new Error('Peer URL cannot target a loopback or link-local address.');
    return parsed.origin;
  }

  function upsertPeer({ peerId, name, baseUrl, publicKey, status = 'paired', lastSeenAt = null }) {
    const timestamp = now();
    database.prepare(`INSERT INTO peer_instances
      (id, peer_id, name, base_url, public_key, status, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(peer_id) DO UPDATE SET name=excluded.name, base_url=excluded.base_url,
        public_key=excluded.public_key, status=excluded.status, last_seen_at=excluded.last_seen_at`).run(
      randomUUID(), peerId, name, baseUrl, publicKey, status, timestamp, lastSeenAt
    );
    return database.prepare('SELECT * FROM peer_instances WHERE peer_id = ?').get(peerId);
  }

  function recordInboundSuccess(peerId, { synced = false } = {}) {
    const timestamp = now();
    database.prepare(`UPDATE peer_instances SET status = 'connected', last_seen_at = ?, last_attempt_at = ?,
      last_sync_at = CASE WHEN ? THEN ? ELSE last_sync_at END, last_error = NULL,
      consecutive_failures = 0, next_retry_at = NULL WHERE peer_id = ?`).run(timestamp, timestamp, synced ? 1 : 0, timestamp, peerId);
    return timestamp;
  }

  async function pairIncoming(request, response) {
    try {
      const body = await readBody(request);
      const invite = identity.parseInvite(body.inviteToken);
      if (invite.peerId !== identity.row().instanceId) return sendError(response, 400, 'This pairing invite belongs to another instance.');
      const peer = identity.verifyPairEnvelope(body.envelope);
      if (peer.originInstanceId === identity.row().instanceId) return sendError(response, 400, 'You cannot pair an instance with itself.');
      const baseUrl = cleanBaseUrl(peer.baseUrl);
      identity.consumeInvite(invite);
      upsertPeer({ peerId: peer.originInstanceId, name: peer.name, baseUrl, publicKey: peer.publicKey, status: 'connected', lastSeenAt: now() });
      recordInboundSuccess(peer.originInstanceId);
      return sendJson(response, 200, identity.signEnvelope({ type: 'pair-response', requestNonce: peer.nonce }));
    } catch (error) { return sendError(response, 400, error.message); }
  }

  async function hello(request, response) {
    try {
      const { payload, peer } = identity.verifyPeerEnvelope(await readBody(request));
      if (payload.type !== 'hello') return sendError(response, 400, 'Invalid peer health request.');
      recordInboundSuccess(peer.peer_id);
      return sendJson(response, 200, identity.signEnvelope({ type: 'hello-response', requestNonce: payload.nonce, name: identity.row().name }));
    } catch (error) { return sendError(response, 401, error.message); }
  }

  async function exchange(request, response) {
    try {
      const { payload, peer } = identity.verifyPeerEnvelope(await readBody(request));
      if (payload.type !== 'sync-exchange' || !Array.isArray(payload.snapshots)) return sendError(response, 400, 'Invalid sync exchange.');
      let applied = 0;
      for (const snapshot of payload.snapshots.slice(0, 500)) if (sync.applySnapshot(snapshot, peer)) applied += 1;
      recordInboundSuccess(peer.peer_id, { synced: true });
      return sendJson(response, 200, identity.signEnvelope({ type: 'sync-response', requestNonce: payload.nonce, applied, snapshots: sync.localSnapshots(peer.peer_id) }));
    } catch (error) { return sendError(response, 400, error.message); }
  }

  async function importInvite(request, response) {
    requireAccount(request);
    const body = await readBody(request);
    let peer;
    try { peer = identity.parseInvite(body.token); }
    catch (error) { return sendError(response, 400, error.message); }
    if (peer.peerId === identity.row().instanceId) return sendError(response, 400, 'You cannot pair an instance with itself.');
    let baseUrl;
    try { baseUrl = cleanBaseUrl(peer.baseUrl); } catch (error) { return sendError(response, 400, error.message); }
    const stored = upsertPeer({ peerId: peer.peerId, name: peer.name, baseUrl, publicKey: peer.publicKey });
    let confirmed = false;
    try {
      const local = identity.row();
      confirmed = await transport.confirmPair(stored, body.token, { name: local.name, publicKey: local.publicKey, baseUrl: cleanBaseUrl(instanceUrl() || appOrigin(request)) });
      if (confirmed) recordInboundSuccess(peer.peerId);
    } catch { /* The remote instance may be offline; connection testing can retry later. */ }
    return sendJson(response, 201, {
      peer: identity.peers().find((entry) => entry.peerId === peer.peerId),
      message: confirmed ? 'Peer paired on both instances.' : 'Peer saved locally. The remote instance could not be confirmed yet.'
    });
  }

  return async function handlePeerRoute(request, response, url) {
    if (request.method === 'POST' && url.pathname === '/api/sync/pair') { await pairIncoming(request, response); return true; }
    if (request.method === 'POST' && url.pathname === '/api/sync/hello') { await hello(request, response); return true; }
    if (request.method === 'POST' && url.pathname === '/api/sync/exchange') { await exchange(request, response); return true; }

    if (request.method === 'GET' && url.pathname === '/api/instance') {
      requireAccount(request); sendJson(response, 200, { ...identity.row(), peers: identity.peers() }); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/peers') {
      requireAccount(request); sendJson(response, 200, identity.peers()); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/notifications') {
      requireAccount(request);
      const where = url.searchParams.get('scope') === 'all' ? '' : 'WHERE read_at IS NULL';
      const rows = database.prepare(`SELECT id, type, peer_id AS peerId, shared_gig_id AS sharedGigId,
        title, body, created_at AS createdAt, read_at AS readAt FROM notifications ${where}
        ORDER BY created_at DESC LIMIT 200`).all();
      sendJson(response, 200, rows.map((entry) => ({ ...entry, unread: !entry.readAt }))); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/notifications/read-all') {
      requireAccount(request);
      const result = database.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(now());
      sendJson(response, 200, { updated: result.changes }); return true;
    }
    const notificationMatch = url.pathname.match(/^\/api\/notifications\/([a-f0-9]+)$/);
    if (request.method === 'PATCH' && notificationMatch) {
      requireAccount(request); database.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(now(), notificationMatch[1]); sendJson(response, 200, { ok: true }); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/peers/invite') {
      requireAccount(request);
      const token = identity.createInvite(instanceUrl() || appOrigin(request));
      const expiresAt = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')).payload.expiresAt;
      sendJson(response, 201, { token, inviteUrl: `${appOrigin(request)}/account?peerInvite=${encodeURIComponent(token)}`, expiresAt }); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/peers/import') { await importInvite(request, response); return true; }
    if (request.method === 'POST' && url.pathname === '/api/peers') {
      requireAccount(request);
      const body = await readBody(request);
      const peerId = String(body.peerId || '').trim(); const name = String(body.name || '').trim(); const publicKey = String(body.publicKey || '').trim();
      if (!peerId || !name || !publicKey) { sendError(response, 400, 'Peer ID, name, and public key are required.'); return true; }
      let baseUrl; try { baseUrl = cleanBaseUrl(body.baseUrl); } catch (error) { sendError(response, 400, error.message); return true; }
      upsertPeer({ peerId, name, baseUrl, publicKey });
      sendJson(response, 201, identity.peers().find((peer) => peer.peerId === peerId)); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/peers/sync-all') {
      requireAccount(request);
      if (sync.syncAll) { sendJson(response, 200, await sync.syncAll()); return true; }
      const peers = database.prepare("SELECT * FROM peer_instances WHERE base_url <> '' ORDER BY name COLLATE NOCASE").all();
      const settled = await Promise.allSettled(peers.map((peer) => sync.syncWithPeer(peer)));
      const results = settled.map((result, index) => result.status === 'fulfilled' ? result.value : { ok: false, peerId: peers[index].id, peerName: peers[index].name, error: result.reason?.message || 'Sync failed.' });
      sendJson(response, 200, { peers: peers.length, results, applied: results.reduce((sum, result) => sum + Number(result.applied || 0), 0) }); return true;
    }
    const actionMatch = url.pathname.match(/^\/api\/peers\/([\w-]+)\/(test|sync)$/);
    if (request.method === 'POST' && actionMatch) {
      requireAccount(request);
      const peer = database.prepare('SELECT * FROM peer_instances WHERE id = ?').get(actionMatch[1]);
      if (!peer) { sendError(response, 404, 'Paired instance not found.'); return true; }
      if (!peer.base_url) { sendError(response, 400, 'Add a peer URL before testing or syncing this instance.'); return true; }
      try {
        if (actionMatch[2] === 'sync') { sendJson(response, 200, await sync.syncWithPeer(peer, { force: true })); return true; }
        const reply = await transport.post(peer, '/api/sync/hello', { type: 'hello' });
        const timestamp = sync.recordSuccess ? sync.recordSuccess(peer, { synced: false }) : now();
        if (!sync.recordSuccess) database.prepare("UPDATE peer_instances SET status = 'connected', last_seen_at = ? WHERE id = ?").run(timestamp, peer.id);
        sendJson(response, 200, { ok: true, name: reply.name || peer.name, status: 'connected', lastSeenAt: timestamp });
      } catch (error) {
        if (!error.peerSync) {
          if (sync.recordFailure) sync.recordFailure(peer, error);
          else database.prepare("UPDATE peer_instances SET status = 'unreachable' WHERE id = ?").run(peer.id);
        }
        sendError(response, 502, error.message);
      }
      return true;
    }
    const peerMatch = url.pathname.match(/^\/api\/peers\/([\w-]+)$/);
    if (request.method === 'DELETE' && peerMatch) {
      requireAccount(request); database.prepare('DELETE FROM peer_instances WHERE id = ?').run(peerMatch[1]); sendJson(response, 200, { ok: true }); return true;
    }
    return false;
  };
}

module.exports = { createPeerRoutes };
