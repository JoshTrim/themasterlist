const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createPeerIdentity } = require('../lib/peer-identity');
const { createPeerMediaRoutes } = require('../lib/routes/peer-media');
const { createBackgroundJobs } = require('../lib/background-jobs');
const { sendJson, sendError } = require('../lib/http');

function response() {
  return { status: null, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; } };
}

function pair() {
  const nowDate = () => new Date('2026-08-01T00:00:00Z');
  const make = (name) => {
    const database = new Database(':memory:'); migrateSchema(database);
    const identity = createPeerIdentity({ database, crypto, now: nowDate, instanceName: () => name }); identity.ensure();
    return { database, identity };
  };
  const alpha = make('Alpha'); const beta = make('Beta');
  for (const [local, remote] of [[alpha, beta], [beta, alpha]]) {
    const row = remote.identity.row();
    local.database.prepare("INSERT INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at) VALUES (?, ?, ?, 'http://peer.test', ?, 'connected', 'now')").run(`row-${row.instanceId}`, row.instanceId, row.name, row.publicKey);
  }
  return { alpha, beta };
}

function addSharedOwnerGig(owner, peer, { media = true } = {}) {
  const peerId = peer.identity.row().instanceId;
  owner.database.prepare(`INSERT INTO gigs
    (id, shared_id, artist, venue, city, date, notes, songs, attendees, created_at)
    VALUES ('gig', 'shared', 'Artist', 'Venue', 'City', '2026-08-01', '', '[]', ?, 'now')`).run(JSON.stringify([{ id: peerId, type: 'peer', name: 'Peer' }]));
  owner.database.prepare("INSERT INTO shared_shows (id, source_gig_id, artist, venue, city, date, songs, created_at) VALUES ('shared', 'gig', 'Artist', 'Venue', 'City', '2026-08-01', '[]', 'now')").run();
  if (media) owner.database.prepare(`INSERT INTO gig_media
    (id, gig_id, filename, mime_type, caption, sort_order, category, checksum, size, created_at)
    VALUES ('media', 'gig', 'media.mp4', 'video/mp4', 'Shared clip', 0, 'show', 'hash', 100, 'now')`).run();
}

function addRemoteManifest(local, remote, manifest) {
  addSharedOwnerGig(local, remote, { media: false });
  local.database.prepare(`INSERT INTO shared_gig_contributions
    (shared_gig_id, instance_id, participant_name, media_manifest, updated_at)
    VALUES ('shared', ?, 'Beta', ?, 'now')`).run(remote.identity.row().instanceId, JSON.stringify(manifest));
}

function route(app, options) {
  return createPeerMediaRoutes({
    database: app.database, identity: app.identity, requireAccount: () => ({ id: 'owner' }),
    readBody: async (request) => request.body, sendJson, sendError, randomUUID: options.randomUUID || (() => crypto.randomUUID()),
    now: () => '2026-08-01T00:00:00.000Z', ...options
  });
}

test('incoming peer media requires a signed attendee request and preserves byte ranges', async () => {
  const { alpha, beta } = pair(); addSharedOwnerGig(beta, alpha);
  let streamed;
  const handle = route(beta, {
    transport: {}, streamFile: async (target, filePath, mimeType, range, cache, headers) => { streamed = { filePath, mimeType, range, cache, headers }; target.writeHead(206, headers); target.end('bytes'); },
    fs, path, mediaDir: '/media', jobs: {}, createHash: crypto.createHash, mediaExtension: () => 'mp4', validMediaSignature: () => true, mediaRows: () => []
  });
  const envelope = alpha.identity.signEnvelope({ type: 'peer-media', sharedGigId: 'shared', mediaId: 'media', variant: 'playback' });
  const result = response();
  await handle({ method: 'POST', headers: { range: 'bytes=10-19' }, body: envelope }, result, new URL('http://beta.test/api/sync/media'));
  assert.equal(result.status, 206);
  assert.equal(streamed.range, 'bytes=10-19');
  assert.equal(streamed.mimeType, 'video/mp4');
  const signed = JSON.parse(Buffer.from(streamed.headers['X-Master-List-Peer-Envelope'], 'base64url').toString('utf8'));
  const verified = alpha.identity.verifyPeerEnvelope(signed, beta.identity.row().instanceId).payload;
  assert.equal(verified.requestNonce, envelope.payload.nonce);
  assert.equal(verified.mediaId, 'media');
  alpha.database.close(); beta.database.close();
});

test('incoming peer media is denied after the requesting peer is removed from attendees', async () => {
  const { alpha, beta } = pair(); addSharedOwnerGig(beta, alpha);
  beta.database.prepare("UPDATE gigs SET attendees = '[]' WHERE id = 'gig'").run();
  let streamed = false;
  const handle = route(beta, {
    transport: {}, streamFile: async () => { streamed = true; }, fs, path, mediaDir: '/media', jobs: {},
    createHash: crypto.createHash, mediaExtension: () => 'mp4', validMediaSignature: () => true, mediaRows: () => []
  });
  const result = response();
  await handle({ method: 'POST', headers: {}, body: alpha.identity.signEnvelope({ type: 'peer-media', sharedGigId: 'shared', mediaId: 'media' }) }, result, new URL('http://beta.test/api/sync/media'));
  assert.equal(result.status, 403);
  assert.equal(streamed, false);
  alpha.database.close(); beta.database.close();
});

test('peer media copy runs as a job, verifies the checksum and creates local media', async () => {
  const { alpha, beta } = pair();
  const bytes = Buffer.from('peer-video-bytes');
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  addRemoteManifest(alpha, beta, [{ id: 'remote-media', filename: 'clip.mp4', mimeType: 'video/mp4', caption: 'Peer clip', category: 'show', checksum, size: bytes.length, songIndex: 1, playbackClips: [] }]);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'master-list-peer-media-'));
  const jobs = createBackgroundJobs({ database: alpha.database, now: () => '2026-08-01T00:00:00.000Z' });
  let queued; const imported = [];
  const handle = route(alpha, {
    transport: { fetchMedia: async () => ({ response: new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) } }), metadata: { mimeType: 'video/mp4', size: bytes.length }, abort() {} }) },
    streamFile: async () => {}, fs, path, mediaDir: directory, jobs, createHash: crypto.createHash,
    mediaExtension: () => 'mp4', validMediaSignature: () => true,
    mediaRows: (gigId) => alpha.database.prepare('SELECT id FROM gig_media WHERE gig_id = ?').all(gigId),
    maxStorageSize: 1024, randomUUID: (() => { let id = 0; return () => `generated-${++id}`; })(),
    schedule: (callback) => { queued = callback; }, onImported: (media) => imported.push(media)
  });
  const accepted = response();
  await handle({ method: 'POST', headers: {} }, accepted, new URL(`http://alpha.test/api/peer-media/${beta.identity.row().instanceId}/shared/remote-media/copy`));
  assert.equal(accepted.status, 202);
  const job = JSON.parse(accepted.body); assert.equal(job.status, 'queued');
  await queued();
  assert.equal(jobs.get(job.id).status, 'complete');
  const stored = alpha.database.prepare("SELECT gig_id AS gigId, caption, checksum, song_index AS songIndex FROM gig_media WHERE id <> 'media'").get();
  assert.deepEqual(stored, { gigId: 'gig', caption: 'Peer clip', checksum, songIndex: 1 });
  assert.equal(imported.length, 1);
  assert.equal(Buffer.compare(await fs.readFile(path.join(directory, imported[0].filename)), bytes), 0);
  await fs.rm(directory, { recursive: true, force: true });
  alpha.database.close(); beta.database.close();
});
