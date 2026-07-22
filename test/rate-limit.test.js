const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../lib/rate-limit');

test('rate limiter blocks repeated failures, resets, and expires its window', () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => now });
  limiter.fail('owner'); limiter.fail('owner');
  assert.equal(limiter.retryAfter('owner'), 10);
  limiter.reset('owner');
  assert.equal(limiter.retryAfter('owner'), 0);
  limiter.fail('owner'); limiter.fail('owner'); now = 10_001;
  assert.equal(limiter.retryAfter('owner'), 0);
});
