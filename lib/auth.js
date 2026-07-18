'use strict';

const { randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function passwordMatches(password, stored) {
  const [, salt, expected] = String(stored || '').split(':');
  if (!salt || !expected || !/^[a-f0-9]{128}$/i.test(expected)) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

function cookieValue(request, name) {
  const value = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createAuth({ database, env = process.env, now = () => new Date() }) {
  function sessionCookieName() {
    const instanceId = database.prepare('SELECT instance_id FROM instance_identity WHERE id = 1').get()?.instance_id || 'local';
    return `master_list_session_${instanceId.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  }

  function sessionCookieSecure() {
    if (env.SESSION_COOKIE_SECURE) return env.SESSION_COOKIE_SECURE === 'true';
    return String(env.INSTANCE_URL || env.APP_ORIGIN || '').startsWith('https://');
  }

  function expiredSessionCookies() {
    const attributes = `HttpOnly; SameSite=Lax; Path=/; Max-Age=0${sessionCookieSecure() ? '; Secure' : ''}`;
    return [`${sessionCookieName()}=; ${attributes}`, `master_list_session=; ${attributes}`];
  }

  function currentAccount(request) {
    const token = cookieValue(request, sessionCookieName()) || cookieValue(request, 'master_list_session');
    if (!token) return null;
    return database.prepare(`SELECT p.id, p.name, p.is_admin AS isAdmin FROM sessions s
      JOIN profiles p ON p.id = s.profile_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(token), now().toISOString()) || null;
  }

  function accountsConfigured() {
    return database.prepare('SELECT COUNT(*) AS count FROM profiles WHERE password_hash IS NOT NULL').get().count > 0;
  }

  function requireAccount(request) {
    const account = currentAccount(request);
    if (!account) {
      const error = new Error('Sign in to continue.');
      error.status = 401;
      throw error;
    }
    return account;
  }

  function sessionHeaders(profileId) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    database.prepare('INSERT INTO sessions (token_hash, profile_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), profileId, expires);
    const secure = sessionCookieSecure() ? '; Secure' : '';
    return { 'Set-Cookie': [
      `${sessionCookieName()}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
      'master_list_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
    ] };
  }

  return { sessionCookieName, sessionCookieSecure, expiredSessionCookies, currentAccount, accountsConfigured, requireAccount, sessionHeaders };
}

module.exports = { hashPassword, passwordMatches, cookieValue, tokenHash, createAuth };
