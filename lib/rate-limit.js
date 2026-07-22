'use strict';

function createRateLimiter({ limit = 5, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const attempts = new Map();

  function state(key) {
    const timestamp = now();
    const current = attempts.get(key);
    if (!current || timestamp - current.startedAt >= windowMs) {
      const fresh = { count: 0, startedAt: timestamp };
      attempts.set(key, fresh);
      return fresh;
    }
    return current;
  }

  function retryAfter(key) {
    const current = state(key);
    return current.count >= limit ? Math.max(1, Math.ceil((windowMs - (now() - current.startedAt)) / 1000)) : 0;
  }

  function fail(key) { state(key).count += 1; }
  function reset(key) { attempts.delete(key); }

  return { retryAfter, fail, reset };
}

module.exports = { createRateLimiter };
