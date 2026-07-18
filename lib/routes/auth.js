'use strict';

const { randomBytes, randomUUID } = require('node:crypto');
const { hashPassword, passwordMatches, cookieValue, tokenHash } = require('../auth');
const { validateAccount } = require('../validation');
const { readBody, sendJson, sendError } = require('../http');

function createAuthRoutes({ database, auth, appOrigin, now = () => new Date() }) {
  return async function handleAuthRoutes(request, response, url) {
    if (!url.pathname.startsWith('/api/auth/')) return false;

    if (request.method === 'GET' && url.pathname === '/api/auth/status') {
      sendJson(response, 200, { configured: auth.accountsConfigured(), account: auth.currentAccount(request) });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/setup') {
      if (database.prepare('SELECT COUNT(*) AS count FROM profiles').get().count) sendError(response, 403, 'An account already exists.');
      else {
        try {
          const { name, password } = validateAccount(await readBody(request));
          const profile = { id: randomUUID(), name, createdAt: now().toISOString() };
          database.prepare('INSERT INTO profiles (id, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)').run(profile.id, name, hashPassword(password), profile.createdAt);
          sendJson(response, 201, { id: profile.id, name: profile.name, isAdmin: 1 }, auth.sessionHeaders(profile.id));
        } catch (error) { sendError(response, 400, error.message); }
      }
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(request);
      const profile = database.prepare('SELECT id, name, password_hash, is_admin AS isAdmin FROM profiles WHERE name = ?').get(String(body.name || '').trim());
      if (!profile || !passwordMatches(String(body.password || ''), profile.password_hash)) sendError(response, 401, 'Incorrect name or password.');
      else sendJson(response, 200, { id: profile.id, name: profile.name, isAdmin: profile.isAdmin }, auth.sessionHeaders(profile.id));
      return true;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/auth/account') {
      try {
        const account = auth.requireAccount(request);
        const body = await readBody(request);
        if (!passwordMatches(String(body.currentPassword || ''), database.prepare('SELECT password_hash FROM profiles WHERE id = ?').get(account.id)?.password_hash)) sendError(response, 401, 'Current password is incorrect.');
        else {
          const { name, password } = validateAccount({ name: body.name, password: body.newPassword });
          database.prepare('UPDATE profiles SET name = ?, password_hash = ? WHERE id = ?').run(name, hashPassword(password), account.id);
          sendJson(response, 200, { id: account.id, name, isAdmin: account.isAdmin });
        }
      } catch (error) { sendError(response, error.status || 400, error.message); }
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      try {
        const body = await readBody(request);
        const inviteHash = tokenHash(String(body.inviteToken || ''));
        const invite = database.prepare('SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(inviteHash, now().toISOString());
        if (!invite) sendError(response, 403, 'This invite is invalid or has expired.');
        else {
          const { name, password } = validateAccount(body);
          const profile = { id: randomUUID(), name, createdAt: now().toISOString() };
          database.transaction(() => {
            database.prepare('INSERT INTO profiles (id, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)').run(profile.id, name, hashPassword(password), profile.createdAt);
            database.prepare('UPDATE invites SET used_at = ? WHERE token_hash = ?').run(profile.createdAt, inviteHash);
          })();
          sendJson(response, 201, { id: profile.id, name: profile.name, isAdmin: 0 }, auth.sessionHeaders(profile.id));
        }
      } catch (error) { sendError(response, 400, error.message); }
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = cookieValue(request, auth.sessionCookieName()) || cookieValue(request, 'master_list_session');
      if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
      sendJson(response, 200, { ok: true }, { 'Set-Cookie': auth.expiredSessionCookies() });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/invites') {
      const account = auth.requireAccount(request);
      if (!account.isAdmin) sendError(response, 403, 'Only the owner can create invites.');
      else {
        const token = randomBytes(24).toString('base64url');
        const expires = new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        database.prepare('INSERT INTO invites (token_hash, created_by, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), account.id, expires);
        sendJson(response, 201, { inviteUrl: `${appOrigin(request)}/?invite=${encodeURIComponent(token)}`, expiresAt: expires });
      }
      return true;
    }

    return false;
  };
}

module.exports = { createAuthRoutes };
