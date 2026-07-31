const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { PassThrough, Readable } = require('node:stream');
const Database = require('better-sqlite3');
const { safeBundlePath, createInstanceTransfer, applyPendingInstanceImportSync } = require('../lib/instance-transfer');

function createDatabase(filename, label) {
  const database = new Database(filename);
  database.exec('CREATE TABLE gigs (id TEXT PRIMARY KEY, artist TEXT); CREATE TABLE gig_media (id TEXT PRIMARY KEY, gig_id TEXT, filename TEXT); CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT); CREATE TABLE instance_identity (id TEXT PRIMARY KEY, name TEXT);');
  database.prepare('INSERT INTO gigs VALUES (?, ?)').run(`gig-${label}`, label);
  database.prepare('INSERT INTO profiles VALUES (?, ?)').run(`profile-${label}`, label);
  database.prepare('INSERT INTO instance_identity VALUES (?, ?)').run(`instance-${label}`, label);
  return database;
}

function service(root, database) {
  return createInstanceTransfer({
    database, Database, fs: fsp, legacyFs: fs, path, crypto,
    dataDir: root, databaseFile: path.join(root, 'master-list.sqlite'), mediaDir: path.join(root, 'media'),
    backupDir: path.join(root, 'backups'), connectionsFile: path.join(root, 'connections.json'),
    geocodesFile: path.join(root, 'geocodes.json'), pendingDir: path.join(root, 'instance-import-pending'),
    maxBundleSize: 1024 * 1024 * 100, randomUUID: crypto.randomUUID, appVersion: 'test'
  });
}

async function exportedBundle(transfer) {
  const chunks = [];
  const response = new PassThrough();
  response.headersSent = false;
  response.writeHead = function writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; };
  response.on('data', (chunk) => chunks.push(chunk));
  await transfer.exportInstance(response);
  return { data: Buffer.concat(chunks), response };
}

test('bundle paths reject traversal and absolute paths', () => {
  assert.equal(safeBundlePath('media/video.mp4'), true);
  assert.equal(safeBundlePath('../master-list.sqlite'), false);
  assert.equal(safeBundlePath('/etc/passwd'), false);
  assert.equal(safeBundlePath('media/../connections.json'), false);
});

test('full instance bundle streams, stages, applies, and preserves rollback data', async (t) => {
  const source = await fsp.mkdtemp(path.join(os.tmpdir(), 'master-list-export-'));
  const target = await fsp.mkdtemp(path.join(os.tmpdir(), 'master-list-import-'));
  t.after(async () => { await fsp.rm(source, { recursive: true, force: true }); await fsp.rm(target, { recursive: true, force: true }); });
  await fsp.mkdir(path.join(source, 'media'), { recursive: true });
  await fsp.writeFile(path.join(source, 'media', 'clip.mp4'), Buffer.from('source-media'));
  await fsp.writeFile(path.join(source, 'media', 'unfinished.mp4.uploading'), Buffer.from('temporary'));
  await fsp.writeFile(path.join(source, 'connections.json'), JSON.stringify({ encrypted: 'oauth' }));
  await fsp.writeFile(path.join(source, 'geocodes.json'), JSON.stringify({ venue: [-27.4, 153.0] }));
  const sourceDb = createDatabase(path.join(source, 'master-list.sqlite'), 'source');
  t.after(() => sourceDb.close());
  const bundle = await exportedBundle(service(source, sourceDb));
  assert.equal(bundle.response.status, 200);
  assert.match(bundle.response.headers['Content-Disposition'], /\.tml-instance"$/);

  await fsp.mkdir(path.join(target, 'media'), { recursive: true });
  await fsp.writeFile(path.join(target, 'media', 'old.mp4'), Buffer.from('old-media'));
  createDatabase(path.join(target, 'master-list.sqlite'), 'target').close();
  const targetTransfer = service(target, sourceDb);
  const staged = await targetTransfer.stageImport(Readable.from([bundle.data]));
  assert.equal(staged.staged, true);
  assert.equal((await targetTransfer.status()).pending.format, 'the-master-list-instance-v1');

  const applied = applyPendingInstanceImportSync({
    fs, path, dataDir: target, databaseFile: path.join(target, 'master-list.sqlite'), mediaDir: path.join(target, 'media'),
    backupDir: path.join(target, 'backups'), connectionsFile: path.join(target, 'connections.json'),
    geocodesFile: path.join(target, 'geocodes.json'), pendingDir: path.join(target, 'instance-import-pending'),
    now: () => new Date('2026-07-26T01:02:03Z'), logger: { log() {} }
  });
  assert.equal(applied.sourceCreatedAt !== null, true);
  const installed = new Database(path.join(target, 'master-list.sqlite'), { readonly: true });
  assert.equal(installed.prepare('SELECT artist FROM gigs').get().artist, 'source');
  installed.close();
  assert.equal(await fsp.readFile(path.join(target, 'media', 'clip.mp4'), 'utf8'), 'source-media');
  assert.equal(fs.existsSync(path.join(target, 'media', 'unfinished.mp4.uploading')), false);
  assert.deepEqual(JSON.parse(await fsp.readFile(path.join(target, 'connections.json'), 'utf8')), { encrypted: 'oauth' });
  assert.equal(await fsp.readFile(path.join(target, 'backups', 'pre-instance-import-2026-07-26T01-02-03-000Z', 'media', 'old.mp4'), 'utf8'), 'old-media');
  assert.equal(fs.existsSync(path.join(target, 'instance-import-pending')), false);
});

test('corrupt instance bundles are rejected without staging them', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'master-list-corrupt-'));
  t.after(async () => fsp.rm(root, { recursive: true, force: true }));
  await fsp.mkdir(path.join(root, 'media'), { recursive: true });
  const database = createDatabase(path.join(root, 'master-list.sqlite'), 'source');
  t.after(() => database.close());
  const transfer = service(root, database);
  const bundle = (await exportedBundle(transfer)).data;
  bundle[bundle.length - 40] ^= 0xff;
  await assert.rejects(transfer.stageImport(Readable.from([bundle])), /checksum|unexpected|invalid/i);
  assert.equal(fs.existsSync(path.join(root, 'instance-import-pending')), false);
});

test('full instance bundles can be uploaded and resumed in chunks', async (t) => {
  const source = await fsp.mkdtemp(path.join(os.tmpdir(), 'master-list-chunk-source-'));
  const target = await fsp.mkdtemp(path.join(os.tmpdir(), 'master-list-chunk-target-'));
  t.after(async () => { await fsp.rm(source, { recursive: true, force: true }); await fsp.rm(target, { recursive: true, force: true }); });
  await fsp.mkdir(path.join(source, 'media'), { recursive: true });
  await fsp.writeFile(path.join(source, 'media', 'clip.mp4'), Buffer.alloc(32 * 1024, 7));
  const sourceDb = createDatabase(path.join(source, 'master-list.sqlite'), 'chunk-source');
  t.after(() => sourceDb.close());
  const bundle = (await exportedBundle(service(source, sourceDb))).data;
  const transfer = service(target, sourceDb);
  const uploadId = 'chunk-test-upload';
  let offset = 0;
  let result;
  while (offset < bundle.length) {
    const chunk = bundle.subarray(offset, Math.min(offset + 4096, bundle.length));
    const request = Readable.from([chunk]);
    request.headers = { 'x-upload-id': uploadId, 'x-upload-total': String(bundle.length), 'x-upload-offset': String(offset) };
    result = await transfer.receiveImportChunk(request);
    offset = result.offset;
  }
  assert.equal(result.complete, true);
  assert.equal(result.staged, true);
  assert.equal((await transfer.status()).pending.format, 'the-master-list-instance-v1');
});
