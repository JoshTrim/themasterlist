'use strict';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PEER_PATHS = new Set(['/api/sync/pair', '/api/sync/hello', '/api/sync/exchange']);

function configuredOrigin(env = process.env) {
  const value = String(env.APP_ORIGIN || env.INSTANCE_URL || '').trim().replace(/\/$/, '');
  if (!value) return '';
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('APP_ORIGIN must be a valid HTTP or HTTPS origin.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) throw new Error('APP_ORIGIN must contain only a valid HTTP or HTTPS origin.');
  return parsed.origin;
}

function resolveAppOrigin(request, env = process.env) {
  const configured = configuredOrigin(env);
  if (configured) return configured;
  if (env.NODE_ENV === 'production') throw new Error('APP_ORIGIN is required in production.');
  const host = String(request.headers.host || '');
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\]|(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){2})(?::\d{1,5})?$/.test(host)) throw new Error('Set APP_ORIGIN before accessing this instance by another hostname.');
  return `http://${host}`;
}

function validateRequestOrigin(request, pathname, trustedOrigin) {
  if (!MUTATING_METHODS.has(request.method) || PEER_PATHS.has(pathname)) return true;
  if (String(request.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).origin === trustedOrigin; } catch { return false; }
}

function securityHeaders({ secure = false } = {}) {
  const headers = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://js-cdn.music.apple.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: blob: https:; media-src 'self' blob:; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://music.apple.com; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
  if (secure) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

function applySecurityHeaders(response, options) {
  for (const [name, value] of Object.entries(securityHeaders(options))) response.setHeader(name, value);
}

module.exports = { configuredOrigin, resolveAppOrigin, validateRequestOrigin, securityHeaders, applySecurityHeaders };
