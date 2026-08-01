function createPeerIdentity({ database, crypto, now = () => new Date(), instanceName = () => 'The Master List instance' }) {
  const { randomUUID, randomBytes, generateKeyPairSync, sign, verify } = crypto;

  function ensure() {
    const existing = database.prepare('SELECT * FROM instance_identity WHERE id = 1').get();
    if (existing) return existing;
    const keys = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const identity = { instanceId: randomUUID(), name: String(instanceName()).trim(), publicKey: keys.publicKey, privateKey: keys.privateKey, createdAt: now().toISOString() };
    database.prepare('INSERT INTO instance_identity (id, instance_id, name, public_key, private_key, created_at) VALUES (1, ?, ?, ?, ?, ?)').run(identity.instanceId, identity.name, identity.publicKey, identity.privateKey, identity.createdAt);
    return database.prepare('SELECT * FROM instance_identity WHERE id = 1').get();
  }

  function row() {
    ensure();
    return database.prepare('SELECT instance_id AS instanceId, name, public_key AS publicKey, created_at AS createdAt FROM instance_identity WHERE id = 1').get();
  }

  function peers() {
    return database.prepare(`SELECT id, peer_id AS peerId, name, base_url AS baseUrl, public_key AS publicKey, status,
      created_at AS createdAt, last_seen_at AS lastSeenAt, last_sync_at AS lastSyncAt,
      last_attempt_at AS lastAttemptAt, last_error AS lastError, consecutive_failures AS consecutiveFailures,
      next_retry_at AS nextRetryAt FROM peer_instances ORDER BY name COLLATE NOCASE`).all();
  }

  function privateRow() {
    ensure();
    return database.prepare('SELECT instance_id, name, public_key, private_key FROM instance_identity WHERE id = 1').get();
  }

  function signEnvelope(payload) {
    const identity = privateRow();
    const signedPayload = { ...payload, originInstanceId: identity.instance_id, issuedAt: now().toISOString(), nonce: randomBytes(18).toString('base64url') };
    return { payload: signedPayload, signature: sign(null, Buffer.from(JSON.stringify(signedPayload)), identity.private_key).toString('base64url') };
  }

  function rememberNonce(payload) {
    const result = database.prepare('INSERT OR IGNORE INTO peer_nonces (origin_instance_id, nonce, issued_at) VALUES (?, ?, ?)').run(payload.originInstanceId, payload.nonce, payload.issuedAt);
    if (!result.changes) throw new Error('Signed peer request has already been used.');
    database.prepare('DELETE FROM peer_nonces WHERE issued_at < ?').run(new Date(now().getTime() - 24 * 60 * 60 * 1000).toISOString());
  }

  function validateFresh(payload, label = 'Signed peer request') {
    const issuedAt = Date.parse(payload?.issuedAt);
    if (!Number.isFinite(issuedAt) || Math.abs(now().getTime() - issuedAt) > 10 * 60 * 1000) throw new Error(`${label} has expired.`);
    if (!payload.nonce) throw new Error(`${label} is incomplete.`);
  }

  function verifyPeerEnvelope(envelope, expectedPeerId = null) {
    const payload = envelope?.payload;
    const originInstanceId = String(payload?.originInstanceId || '').trim();
    if (!originInstanceId || !envelope?.signature) throw new Error('Signed peer request is incomplete.');
    if (expectedPeerId && originInstanceId !== expectedPeerId) throw new Error('Peer response came from an unexpected instance.');
    const peer = database.prepare('SELECT * FROM peer_instances WHERE peer_id = ?').get(originInstanceId);
    if (!peer) throw new Error('This instance is not paired.');
    validateFresh(payload);
    if (!verify(null, Buffer.from(JSON.stringify(payload)), peer.public_key, Buffer.from(envelope.signature, 'base64url'))) throw new Error('Peer signature could not be verified.');
    rememberNonce(payload);
    return { payload, peer };
  }

  function verifyPairEnvelope(envelope) {
    const payload = envelope?.payload;
    if (payload?.type !== 'pair' || !payload.originInstanceId || !payload.publicKey || !payload.name || !envelope?.signature) throw new Error('Pair confirmation is incomplete.');
    validateFresh(payload, 'Pair confirmation');
    if (!verify(null, Buffer.from(JSON.stringify(payload)), payload.publicKey, Buffer.from(envelope.signature, 'base64url'))) throw new Error('Pair confirmation signature could not be verified.');
    rememberNonce(payload);
    return payload;
  }

  function createInvite(baseUrl) {
    const identity = privateRow();
    const payload = {
      version: 1, peerId: identity.instance_id, name: identity.name, publicKey: identity.public_key,
      baseUrl: String(baseUrl || '').replace(/\/$/, ''),
      expiresAt: new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      nonce: randomBytes(18).toString('base64url')
    };
    const signature = sign(null, Buffer.from(JSON.stringify(payload)), identity.private_key).toString('base64url');
    database.prepare('INSERT INTO peer_invites (nonce, expires_at) VALUES (?, ?)').run(payload.nonce, payload.expiresAt);
    return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');
  }

  function parseInvite(token) {
    let envelope;
    try { envelope = JSON.parse(Buffer.from(String(token || ''), 'base64url').toString('utf8')); } catch { throw new Error('That pairing invite is not valid.'); }
    const payload = envelope?.payload;
    if (!payload?.peerId || !payload?.publicKey || !payload?.name || !payload?.expiresAt || !envelope.signature) throw new Error('That pairing invite is incomplete.');
    const expiresAt = Date.parse(payload.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now().getTime()) throw new Error('That pairing invite has expired.');
    if (!verify(null, Buffer.from(JSON.stringify(payload)), payload.publicKey, Buffer.from(envelope.signature, 'base64url'))) throw new Error('That pairing invite signature could not be verified.');
    return payload;
  }

  function consumeInvite(payload) {
    const result = database.prepare('UPDATE peer_invites SET used_at = ? WHERE nonce = ? AND used_at IS NULL AND expires_at > ?')
      .run(now().toISOString(), payload.nonce, now().toISOString());
    if (!result.changes) throw new Error('That pairing invite has already been used or was not issued by this instance.');
  }

  return { ensure, row, peers, signEnvelope, verifyPeerEnvelope, verifyPairEnvelope, createInvite, parseInvite, consumeInvite };
}

module.exports = { createPeerIdentity };
