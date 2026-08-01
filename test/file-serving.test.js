'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Writable } = require('node:stream');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { CONTENT_TYPES, byteRange, containedPath, createFileServing } = require('../lib/file-serving');

class Response extends Writable {
  constructor() { super(); this.chunks = []; }
  _write(chunk, _encoding, callback) { this.chunks.push(Buffer.from(chunk)); callback(); }
  writeHead(status, headers = {}) { this.status = status; this.headers = headers; }
  end(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); return super.end(); }
  get body() { return Buffer.concat(this.chunks); }
}

function finished(response) {
  return response.writableFinished ? Promise.resolve() : new Promise((resolve, reject) => response.once('finish', resolve).once('error', reject));
}

test('range parsing supports bounded, open and suffix byte ranges', () => {
  assert.deepEqual(byteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(byteRange('bytes=7-', 10), { start: 7, end: 9 });
  assert.deepEqual(byteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.equal(byteRange('bytes=10-11', 10), false);
  assert.equal(byteRange('nonsense', 10), false);
});

test('path containment rejects sibling-prefix and traversal paths', () => {
  assert.equal(containedPath(path, '/tmp/public', 'app.js'), '/tmp/public/app.js');
  assert.equal(containedPath(path, '/tmp/public', '../publicity/secret'), null);
});

test('serves install manifests with the browser manifest media type', () => {
  assert.match(CONTENT_TYPES['.webmanifest'], /^application\/manifest\+json/);
});

test('static serving returns assets, SPA fallback and 404 responses', async (context) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'master-list-static-'));
  context.after(() => fsp.rm(root, { recursive: true, force: true }));
  await fsp.writeFile(path.join(root, 'index.html'), '<main>app</main>');
  await fsp.writeFile(path.join(root, 'app.css'), 'body{}');
  const errors = [];
  const serving = createFileServing({ fs: fsp, legacyFs: fs, path, publicDir: root, mediaDir: root, database: {}, profileImages: { resolve: () => null }, sendError: (_response, status, message) => errors.push({ status, message }) });
  const css = new Response(); await serving.serveStatic({}, css, '/app.css');
  assert.equal(css.status, 200); assert.match(css.headers['Content-Type'], /text\/css/);
  const spa = new Response(); await serving.serveStatic({}, spa, '/shows');
  assert.equal(spa.body.toString(), '<main>app</main>');
  await serving.serveStatic({}, new Response(), '/missing.png');
  assert.deepEqual(errors.pop(), { status: 404, message: 'Not found' });
});

test('media serving streams playback copies and honours byte ranges', async (context) => {
  const mediaDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'master-list-serving-'));
  const database = new Database(':memory:'); migrateSchema(database);
  context.after(async () => { database.close(); await fsp.rm(mediaDir, { recursive: true, force: true }); });
  database.prepare('INSERT INTO gigs (id,artist,venue,city,date,songs,created_at) VALUES (?,?,?,?,?,?,?)').run('gig', 'Artist', 'Hall', 'City', '2026-01-01', '[]', 'now');
  database.prepare('INSERT INTO gig_media (id,gig_id,filename,mime_type,playback_filename,playback_mime,size,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('media', 'gig', 'original.mov', 'video/quicktime', 'proxy.mp4', 'video/mp4', 10, 'now');
  await fsp.writeFile(path.join(mediaDir, 'proxy.mp4'), '0123456789');
  const serving = createFileServing({ fs: fsp, legacyFs: fs, path, publicDir: mediaDir, mediaDir, database, profileImages: { resolve: () => null }, sendError: (_response, status) => { throw new Error(`HTTP ${status}`); } });
  const response = new Response();
  await serving.serveMedia({ headers: { range: 'bytes=2-5' } }, response, new URL('http://x/api/media/media'), 'media');
  await finished(response);
  assert.equal(response.status, 206);
  assert.equal(response.headers['Content-Range'], 'bytes 2-5/10');
  assert.equal(response.body.toString(), '2345');
});

test('stored profile images use immutable browser caching', async (context) => {
  const mediaDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'master-list-profile-serving-'));
  context.after(() => fsp.rm(mediaDir, { recursive: true, force: true }));
  const filePath = path.join(mediaDir, 'profile-id.jpg');
  await fsp.writeFile(filePath, Buffer.from([0xff, 0xd8, 0xff]));
  const serving = createFileServing({ fs: fsp, legacyFs: fs, path, publicDir: mediaDir, mediaDir, database: {}, profileImages: { resolve: () => null }, sendError: (_response, status) => { throw new Error(`HTTP ${status}`); } });
  const response = new Response();
  await serving.serveProfileImage({ headers: {} }, response, { filePath, mimeType: 'image/jpeg' });
  await finished(response);
  assert.equal(response.headers['Cache-Control'], 'private, max-age=31536000, immutable');
});
