const test = require('node:test');
const assert = require('node:assert/strict');
const { configuredOrigin, resolveAppOrigin, validateRequestOrigin, securityHeaders } = require('../lib/security');

test('deployment origins are explicit in production and safely bounded in development', () => {
  assert.equal(configuredOrigin({ APP_ORIGIN: 'https://archive.example' }), 'https://archive.example');
  assert.throws(() => configuredOrigin({ APP_ORIGIN: 'https://archive.example/path' }), /origin/i);
  assert.throws(() => resolveAppOrigin({ headers: { host: 'attacker.example' } }, { NODE_ENV: 'production' }), /required/i);
  assert.equal(resolveAppOrigin({ headers: { host: '192.168.1.20:3000' } }, {}), 'http://192.168.1.20:3000');
  assert.throws(() => resolveAppOrigin({ headers: { host: 'attacker.example' } }, {}), /APP_ORIGIN/i);
});

test('browser mutations reject cross-site origins while signed peer envelopes remain available', () => {
  const request = (method, headers = {}) => ({ method, headers });
  assert.equal(validateRequestOrigin(request('POST', { origin: 'https://archive.example' }), '/api/gigs', 'https://archive.example'), true);
  assert.equal(validateRequestOrigin(request('POST', { origin: 'https://evil.example' }), '/api/gigs', 'https://archive.example'), false);
  assert.equal(validateRequestOrigin(request('POST', { 'sec-fetch-site': 'cross-site' }), '/api/gigs', 'https://archive.example'), false);
  assert.equal(validateRequestOrigin(request('POST', { origin: 'https://peer.example' }), '/api/sync/exchange', 'https://archive.example'), true);
});

test('security headers constrain framing, sniffing, scripts and transport', () => {
  const headers = securityHeaders({ secure: true });
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
  assert.match(headers['Strict-Transport-Security'], /max-age=/);
});
