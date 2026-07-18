function createPeerTransport({ fetch, identity, timeoutMs = 12_000, retries = 1, AbortController, setTimeout, clearTimeout }) {
  async function attemptRequest(peer, pathname, body, requestNonce) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${peer.base_url.replace(/\/$/, '')}${pathname}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(responseBody.error || `Peer returned HTTP ${response.status}.`);
        error.retryable = response.status >= 500;
        throw error;
      }
      const verified = identity.verifyPeerEnvelope(responseBody, peer.peer_id).payload;
      if (verified.requestNonce !== requestNonce) throw new Error('Peer response did not match this request.');
      return verified;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error('Peer connection timed out.');
        timeoutError.retryable = true;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function withRetries(factory) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try { return await factory(); }
      catch (error) {
        lastError = error;
        if (attempt >= retries || error.retryable === false || /signature|unexpected instance|did not match/i.test(error.message)) throw error;
      }
    }
    throw lastError;
  }

  async function post(peer, pathname, payload) {
    if (!peer?.base_url) throw new Error('This peer does not have a connection URL.');
    return withRetries(() => {
      const envelope = identity.signEnvelope(payload);
      return attemptRequest(peer, pathname, envelope, envelope.payload.nonce);
    });
  }

  async function confirmPair(peer, inviteToken, localDetails) {
    if (!peer?.base_url) return false;
    return withRetries(() => {
      const envelope = identity.signEnvelope({ type: 'pair', ...localDetails });
      return attemptRequest(peer, '/api/sync/pair', { inviteToken, envelope }, envelope.payload.nonce).then(() => true);
    });
  }

  return { post, confirmPair };
}

module.exports = { createPeerTransport };
