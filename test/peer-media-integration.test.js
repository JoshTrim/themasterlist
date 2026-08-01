const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const legacyFs = require('node:fs');
const { PassThrough } = require('node:stream');
const { once } = require('node:events');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createPeerIdentity } = require('../lib/peer-identity');
const { createPeerTransport } = require('../lib/peer-transport');
const { createPeerMediaRoutes } = require('../lib/routes/peer-media');
const { createFileServing } = require('../lib/file-serving');
const { sendJson, sendError } = require('../lib/http');

test('two paired instances authenticate and range-stream shared media end to end', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'master-list-peer-stream-'));
  const now = () => new Date('2026-08-01T00:00:00Z');
  const make = (name) => {
    const database = new Database(':memory:'); migrateSchema(database);
    const identity = createPeerIdentity({ database, crypto, now, instanceName: () => name }); identity.ensure();
    return { database, identity };
  };
  const alpha = make('Alpha'); const beta = make('Beta');
  for (const [local, remote] of [[alpha, beta], [beta, alpha]]) {
    const row = remote.identity.row();
    local.database.prepare("INSERT INTO peer_instances (id, peer_id, name, base_url, public_key, status, created_at) VALUES (?, ?, ?, 'http://peer.test', ?, 'connected', 'now')").run(`row-${row.instanceId}`, row.instanceId, row.name, row.publicKey);
  }
  beta.database.prepare(`INSERT INTO gigs
    (id, shared_id, artist, venue, city, date, notes, songs, attendees, created_at)
    VALUES ('gig', 'shared', 'Artist', 'Venue', 'City', '2026-08-01', '', '[]', ?, 'now')`).run(JSON.stringify([{ id: alpha.identity.row().instanceId, type: 'peer', name: 'Alpha' }]));
  beta.database.prepare(`INSERT INTO gig_media
    (id, gig_id, filename, mime_type, caption, sort_order, category, size, created_at)
    VALUES ('media', 'gig', 'media.mp4', 'video/mp4', 'Shared clip', 0, 'show', 10, 'now')`).run();
  await fs.writeFile(path.join(directory, 'media.mp4'), Buffer.from('0123456789'));
  const serving = createFileServing({ fs, legacyFs, path, publicDir: directory, mediaDir: directory, database: beta.database, profileImages: { resolve: () => null }, sendError });
  const betaRoute = createPeerMediaRoutes({
    database: beta.database, identity: beta.identity, transport: {}, requireAccount: () => ({}),
    readBody: async (request) => request.body, sendJson, sendError, streamFile: serving.stream,
    fs, path, mediaDir: directory, jobs: {}, randomUUID: crypto.randomUUID, createHash: crypto.createHash,
    mediaExtension: () => 'mp4', validMediaSignature: () => true, mediaRows: () => [], now: () => now().toISOString()
  });
  const bridgeFetch = async (_url, options) => {
    const output = new PassThrough(); const chunks = []; let status = 200; let headers = {};
    output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    output.writeHead = (nextStatus, nextHeaders = {}) => { status = nextStatus; headers = nextHeaders; };
    const finished = once(output, 'finish');
    await betaRoute({ method: 'POST', headers: { range: options.headers.Range || '' }, body: JSON.parse(options.body) }, output, new URL('http://beta.test/api/sync/media'));
    await finished;
    return new Response(Buffer.concat(chunks), { status, headers });
  };
  const client = createPeerTransport({ fetch: bridgeFetch, identity: alpha.identity, timeoutMs: 1000, retries: 0, AbortController, setTimeout, clearTimeout });
  const peer = alpha.database.prepare('SELECT * FROM peer_instances WHERE peer_id = ?').get(beta.identity.row().instanceId);
  const remote = await client.fetchMedia(peer, { type: 'peer-media', sharedGigId: 'shared', mediaId: 'media' }, { range: 'bytes=2-5' });
  assert.equal(remote.response.status, 206);
  assert.equal(remote.response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(Buffer.from(await remote.response.arrayBuffer()).toString(), '2345');
  await fs.rm(directory, { recursive: true, force: true });
  alpha.database.close(); beta.database.close();
});
