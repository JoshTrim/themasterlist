const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');
const { createHash } = require('node:crypto');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createMediaRepository } = require('../lib/media-repository');
const { createMediaUploadRoutes } = require('../lib/routes/media-uploads');
const { mediaExtension, mediaCategory, hashFile } = require('../lib/media-utils');
const { sendJson, sendError } = require('../lib/http');

function response() {
  return {
    status: null, headers: null, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body = '') { this.body = body; }
  };
}

function fixture() {
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-list-upload-routes-'));
  const database = new Database(':memory:');
  migrateSchema(database);
  database.prepare("INSERT INTO gigs (id, artist, venue, city, date, songs, attendees, created_at) VALUES ('gig', 'Artist', 'Venue', 'City', '2026-07-18', '[]', '[]', 'now')").run();
  const repository = createMediaRepository({ database, mediaDir, path, existsSync: fs.existsSync, statSync: fs.statSync });
  let sequence = 0;
  const queuedEncodes = [];
  const queuedRecognition = [];
  const handle = createMediaUploadRoutes({
    database, fs: fsp, legacyFs: fs, path, mediaDir, maxMediaSize: 1024 * 1024,
    randomUUID: () => `media-${++sequence}`, createHash, mediaExtension, mediaCategory, hashFile,
    mediaRows: repository.list, readBody: async (request) => request.body, sendJson, sendError,
    startPlaybackEncode(...args) { queuedEncodes.push(args); },
    recognizeVideoTrack(...args) { queuedRecognition.push(args); },
    logger: { log() {} }, schedule: (callback) => callback()
  });
  return { database, mediaDir, handle, queuedEncodes, queuedRecognition };
}

test('media upload routes add YouTube media and serve the collection', async () => {
  const { database, handle } = fixture();
  const created = response();
  assert.equal(await handle({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { externalUrl: 'https://youtu.be/example', caption: 'Whole show' } }, created, new URL('http://localhost/api/gigs/gig/media')), true);
  assert.equal(created.status, 201);
  assert.equal(JSON.parse(created.body).caption, 'Whole show');

  const listed = response();
  await handle({ method: 'GET', headers: {} }, listed, new URL('http://localhost/api/gigs/gig/media'));
  assert.equal(JSON.parse(listed.body).length, 1);
  database.close();
});

test('artifact uploads reject videos before touching disk', async () => {
  const { database, handle } = fixture();
  const result = response();
  await handle({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { mimeType: 'video/mp4', filename: 'shirt.mp4', data: 'dGVzdA==' } }, result, new URL('http://localhost/api/gigs/gig/artifacts'));
  assert.equal(result.status, 415);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM gig_media').get().count, 0);
  database.close();
});

test('raw uploads are checksummed and duplicate content reuses the first record', async () => {
  const { database, handle } = fixture();
  const upload = async () => {
    const request = Readable.from([Buffer.from('same-photo')]);
    request.method = 'POST';
    request.headers = { 'content-type': 'image/jpeg', 'content-length': '10', 'x-media-filename': 'shirt.jpg' };
    const result = response();
    await handle(request, result, new URL('http://localhost/api/gigs/gig/media'));
    return result;
  };
  assert.equal((await upload()).status, 201);
  const duplicate = await upload();
  assert.equal(duplicate.status, 200);
  assert.equal(JSON.parse(duplicate.body).duplicate, true);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM gig_media').get().count, 1);
  database.close();
});

test('chunked mobile uploads resume at the server offset and finalize once', async () => {
  const { database, handle } = fixture();
  const sendChunk = async (content, offset) => {
    const request = Readable.from([Buffer.from(content)]);
    request.method = 'POST';
    request.headers = {
      'content-type': 'image/jpeg',
      'x-upload-id': 'phone-upload',
      'x-upload-total': '10',
      'x-upload-offset': String(offset),
      'x-media-filename': 'merch.jpg'
    };
    const result = response();
    await handle(request, result, new URL('http://localhost/api/gigs/gig/media/chunk'));
    return result;
  };

  const first = await sendChunk('same', 0);
  assert.equal(first.status, 200);
  assert.deepEqual(JSON.parse(first.body), { complete: false, offset: 4 });
  const wrongOffset = await sendChunk('ignored', 2);
  assert.equal(wrongOffset.status, 409);
  assert.deepEqual(JSON.parse(wrongOffset.body), { offset: 4 });
  const complete = await sendChunk('-photo', 4);
  assert.equal(complete.status, 201);
  assert.equal(JSON.parse(complete.body).complete, true);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM gig_media').get().count, 1);
  database.close();
});
