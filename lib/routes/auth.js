'use strict';

const { randomUUID } = require('node:crypto');
const { hashPassword, passwordMatches, cookieValue, tokenHash } = require('../auth');
const { validateAccount } = require('../validation');
const { readBody, sendJson, sendError } = require('../http');
const { createRateLimiter } = require('../rate-limit');

function createAuthRoutes({
  database,
  auth,
  appOrigin,
  now = () => new Date(),
  loginLimiter = createRateLimiter({ now: () => now().getTime() }),
  setupToken = '',
  requireSetupToken = false
}) {
  const setupTokenRequired = requireSetupToken || Boolean(setupToken);

  return async function handleAuthRoutes(request, response, url) {
    if (!url.pathname.startsWith('/api/auth/')) return false;

    if (request.method === 'GET' && url.pathname === '/api/auth/status') {
      sendJson(response, 200, { configured: auth.accountsConfigured(), account: auth.currentAccount(request), setupTokenRequired });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/setup') {
      try {
        const body = await readBody(request);
        if (auth.accountsConfigured()) sendError(response, 403, 'An owner account already exists.');
        else if (setupTokenRequired && (!setupToken || String(body.setupToken || '') !== setupToken)) {
          sendError(response, setupToken ? 403 : 503, setupToken ? 'The setup token is incorrect.' : 'Configure OWNER_SETUP_TOKEN before creating the production owner account.');
        } else {
          const { name, password } = validateAccount(body);
          const profile = { id: randomUUID(), name, createdAt: now().toISOString() };
          let headers;
          database.transaction(() => {
            if (auth.accountsConfigured()) {
              const error = new Error('An owner account already exists.');
              error.status = 403;
              throw error;
            }
            database.prepare('INSERT INTO profiles (id, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)').run(profile.id, name, hashPassword(password), profile.createdAt);
            headers = auth.sessionHeaders(profile.id);
          })();
          sendJson(response, 201, { id: profile.id, name: profile.name, isAdmin: 1 }, headers);
        }
      } catch (error) { sendError(response, error.status || 400, error.message); }
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(request);
      const name = String(body.name || '').trim();
      const remote = request.socket?.remoteAddress || 'unknown';
      const limiterKey = `${remote}:${name.toLocaleLowerCase()}`;
      const wait = loginLimiter.retryAfter(limiterKey);
      if (wait) sendJson(response, 429, { error: 'Too many sign-in attempts. Try again later.' }, { 'Retry-After': String(wait) });
      else {
        const profile = database.prepare('SELECT id, name, password_hash, is_admin AS isAdmin FROM profiles WHERE name = ? AND is_admin = 1').get(name);
        if (!profile || !passwordMatches(String(body.password || ''), profile.password_hash)) {
          loginLimiter.fail(limiterKey);
          sendError(response, 401, 'Incorrect name or password.');
        } else {
          loginLimiter.reset(limiterKey);
          sendJson(response, 200, { id: profile.id, name: profile.name, isAdmin: profile.isAdmin }, auth.sessionHeaders(profile.id));
        }
      }
      return true;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/auth/account') {
      try {
        const account = auth.requireAccount(request);
        const body = await readBody(request);
        if (!passwordMatches(String(body.currentPassword || ''), database.prepare('SELECT password_hash FROM profiles WHERE id = ?').get(account.id)?.password_hash)) sendError(response, 401, 'Current password is incorrect.');
        else {
          const { name, password } = validateAccount({ name: body.name, password: body.newPassword });
          let headers;
          database.transaction(() => {
            database.prepare('UPDATE profiles SET name = ?, password_hash = ? WHERE id = ?').run(name, hashPassword(password), account.id);
            database.prepare('DELETE FROM sessions WHERE profile_id = ?').run(account.id);
            headers = auth.sessionHeaders(account.id);
          })();
          sendJson(response, 200, { id: account.id, name, isAdmin: account.isAdmin }, headers);
        }
      } catch (error) { sendError(response, error.status || 400, error.message); }
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      sendError(response, 410, 'This instance uses one owner account. Pair a separate instance to collaborate.');
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = cookieValue(request, auth.sessionCookieName()) || cookieValue(request, 'master_list_session');
      if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
      sendJson(response, 200, { ok: true }, { 'Set-Cookie': auth.expiredSessionCookies() });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/invites') {
      auth.requireAccount(request);
      sendError(response, 410, 'Account invites are disabled. Use peer pairing between separate instances.');
      return true;
    }

    return false;
  };
}

module.exports = { createAuthRoutes };
