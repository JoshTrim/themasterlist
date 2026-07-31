'use strict';

const { randomUUID, timingSafeEqual } = require('node:crypto');
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
  requireSetupToken = false,
  lastImport = async () => null
}) {
  const setupTokenRequired = requireSetupToken || Boolean(setupToken);
  const matchesSetupToken = (candidate) => {
    if (!setupToken) return false;
    return timingSafeEqual(Buffer.from(tokenHash(String(candidate || '')), 'hex'), Buffer.from(tokenHash(setupToken), 'hex'));
  };

  return async function handleAuthRoutes(request, response, url) {
    if (!url.pathname.startsWith('/api/auth/')) return false;

    if (request.method === 'GET' && url.pathname === '/api/auth/status') {
      const imported = await lastImport();
      const importedAt = Date.parse(imported?.appliedAt || '');
      const recentImport = Number.isFinite(importedAt) && Math.abs(now().getTime() - importedAt) <= 24 * 60 * 60 * 1000 ? imported : null;
      sendJson(response, 200, {
        configured: auth.accountsConfigured(),
        account: auth.currentAccount(request),
        setupTokenRequired,
        recoveryAvailable: Boolean(setupToken),
        lastInstanceImport: recentImport
      });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/setup') {
      try {
        const body = await readBody(request);
        if (auth.accountsConfigured()) sendError(response, 403, 'An owner account already exists.');
        else if (setupTokenRequired && !matchesSetupToken(body.setupToken)) {
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
        const profile = database.prepare('SELECT name, password_hash FROM profiles WHERE id = ?').get(account.id);
        if (!passwordMatches(String(body.currentPassword || ''), profile?.password_hash)) sendError(response, 401, 'Current password is incorrect.');
        else {
          const name = body.name === undefined ? profile.name : String(body.name || '').trim();
          if (!name || name.length > 80) {
            sendError(response, 400, 'Enter a name up to 80 characters.');
          } else if (body.newPassword !== undefined && String(body.newPassword || '').length > 0) {
            const { password } = validateAccount({ name, password: body.newPassword });
            let headers;
            database.transaction(() => {
              database.prepare('UPDATE profiles SET name = ?, password_hash = ? WHERE id = ?').run(name, hashPassword(password), account.id);
              database.prepare('DELETE FROM sessions WHERE profile_id = ?').run(account.id);
              headers = auth.sessionHeaders(account.id);
            })();
            sendJson(response, 200, { id: account.id, name, isAdmin: account.isAdmin, sessionsRevoked: true }, headers);
          } else {
            database.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(name, account.id);
            sendJson(response, 200, { id: account.id, name, isAdmin: account.isAdmin });
          }
        }
      } catch (error) { sendError(response, error.status || 400, error.message); }
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/recover') {
      const body = await readBody(request);
      const remote = request.socket?.remoteAddress || 'unknown';
      const limiterKey = `${remote}:owner-recovery`;
      const wait = loginLimiter.retryAfter(limiterKey);
      if (wait) {
        sendJson(response, 429, { error: 'Too many recovery attempts. Try again later.' }, { 'Retry-After': String(wait) });
      } else if (!setupToken) {
        sendError(response, 503, 'Owner recovery is not configured on this instance.');
      } else if (!matchesSetupToken(body.setupToken)) {
        loginLimiter.fail(limiterKey);
        sendError(response, 403, 'The recovery token is incorrect.');
      } else {
        try {
          const profile = database.prepare('SELECT id, name, is_admin AS isAdmin FROM profiles WHERE is_admin = 1 ORDER BY created_at LIMIT 1').get();
          if (!profile) throw Object.assign(new Error('No owner account exists to recover.'), { status: 404 });
          const { password } = validateAccount({ name: profile.name, password: body.newPassword });
          let headers;
          database.transaction(() => {
            database.prepare('UPDATE profiles SET password_hash = ? WHERE id = ?').run(hashPassword(password), profile.id);
            database.prepare('DELETE FROM sessions WHERE profile_id = ?').run(profile.id);
            headers = auth.sessionHeaders(profile.id);
          })();
          loginLimiter.reset(limiterKey);
          sendJson(response, 200, { id: profile.id, name: profile.name, isAdmin: profile.isAdmin }, headers);
        } catch (error) { sendError(response, error.status || 400, error.message); }
      }
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

    if (request.method === 'POST' && url.pathname === '/api/auth/logout-all') {
      const account = auth.requireAccount(request);
      database.prepare('DELETE FROM sessions WHERE profile_id = ?').run(account.id);
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
