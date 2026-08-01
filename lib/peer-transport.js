function createPeerTransport({ fetch, identity, timeoutMs = 12_000, retries = 1, retryBaseDelayMs = 250, AbortController, setTimeout, clearTimeout }) {
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  async function attemptRequest(peer, pathname, body, requestNonce) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${peer.base_url.replace(/\/$/, '')}${pathname}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, redirect: 'error'
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
        await delay(Math.min(2_000, retryBaseDelayMs * (2 ** attempt)));
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

  async function fetchMedia(peer, payload, { range = '', registerAbort = () => {} } = {}) {
    if (!peer?.base_url) throw new Error('This peer does not have a connection URL.');
    const envelope = identity.signEnvelope(payload);
    const controller = new AbortController();
    registerAbort(() => controller.abort());
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (range) headers.Range = range;
      const response = await fetch(`${peer.base_url.replace(/\/$/, '')}/api/sync/media`, {
        method: 'POST', headers, body: JSON.stringify(envelope), signal: controller.signal, redirect: 'error'
      });
      if (!response.ok) {
        const responseBody = await response.json().catch(() => ({}));
        const error = new Error(responseBody.error || `Peer returned HTTP ${response.status}.`);
        error.retryable = response.status >= 500;
        throw error;
      }
      const encoded = response.headers.get('x-master-list-peer-envelope');
      if (!encoded) throw new Error('Peer media response was not signed.');
      let responseEnvelope;
      try { responseEnvelope = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
      catch { throw new Error('Peer media response signature was malformed.'); }
      const verified = identity.verifyPeerEnvelope(responseEnvelope, peer.peer_id).payload;
      if (verified.type !== 'peer-media-response' || verified.requestNonce !== envelope.payload.nonce || verified.mediaId !== payload.mediaId) {
        throw new Error('Peer media response did not match this request.');
      }
      clearTimeout(timeout);
      return { response, metadata: verified, abort: () => controller.abort() };
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Peer media connection timed out.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function confirmPair(peer, inviteToken, localDetails) {
    if (!peer?.base_url) return false;
    return withRetries(() => {
      const envelope = identity.signEnvelope({ type: 'pair', ...localDetails });
      return attemptRequest(peer, '/api/sync/pair', { inviteToken, envelope }, envelope.payload.nonce).then(() => true);
    });
  }

  return { post, fetchMedia, confirmPair };
}

module.exports = { createPeerTransport };
