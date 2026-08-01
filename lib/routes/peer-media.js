'use strict';

const { Readable } = require('node:stream');

function createPeerMediaRoutes({
  database, identity, transport, requireAccount, readBody, sendJson, sendError,
  streamFile, fs, path, mediaDir, jobs, randomUUID, createHash, mediaExtension,
  validMediaSignature, mediaRows, maxStorageSize = Infinity,
  onImported = () => {}, now = () => new Date().toISOString(), schedule = setImmediate
}) {
  function contribution(peerId, sharedGigId) {
    const row = database.prepare(`SELECT contribution.media_manifest AS mediaManifest,
      peers.id AS peerRowId, peers.peer_id AS peerId, peers.name AS peerName, peers.base_url AS baseUrl,
      peers.public_key AS publicKey, peers.status, shared.source_gig_id AS sourceGigId
      FROM shared_gig_contributions contribution
      JOIN peer_instances peers ON peers.peer_id = contribution.instance_id
      JOIN shared_shows shared ON shared.id = contribution.shared_gig_id
      WHERE contribution.shared_gig_id = ? AND contribution.instance_id = ?`).get(sharedGigId, peerId);
    if (!row) return null;
    let media = [];
    try { media = JSON.parse(row.mediaManifest || '[]'); } catch { media = []; }
    return { ...row, media };
  }

  function remoteMedia(peerId, sharedGigId, mediaId) {
    const record = contribution(peerId, sharedGigId);
    const media = record?.media.find((item) => item?.id === mediaId);
    return record && media ? { record, media } : null;
  }

  function peerRow(record) {
    return {
      id: record.peerRowId, peer_id: record.peerId, name: record.peerName,
      base_url: record.baseUrl, public_key: record.publicKey, status: record.status
    };
  }

  function ownerSharedGig(sharedGigId, requestingPeerId) {
    const row = database.prepare('SELECT id, attendees FROM gigs WHERE shared_id = ?').get(sharedGigId);
    if (!row) return null;
    let attendees = [];
    try { attendees = JSON.parse(row.attendees || '[]'); } catch { attendees = []; }
    return attendees.some((attendee) => attendee?.id === requestingPeerId) ? row : null;
  }

  function remoteHeaders(remote) {
    const names = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
    return Object.fromEntries(names.map((name) => [name, remote.headers.get(name)]).filter(([, value]) => value));
  }

  function containedMediaPath(filename) {
    const root = path.resolve(mediaDir);
    const candidate = path.resolve(root, String(filename || ''));
    return candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
  }

  async function serveIncoming(request, response) {
    try {
      const { payload, peer } = identity.verifyPeerEnvelope(await readBody(request));
      if (payload.type !== 'peer-media' || !payload.sharedGigId || !payload.mediaId) return sendError(response, 400, 'Invalid peer media request.');
      const gig = ownerSharedGig(payload.sharedGigId, peer.peer_id);
      if (!gig) return sendError(response, 403, 'This media is not shared with the requesting instance.');
      database.prepare(`UPDATE peer_instances SET status = 'connected', last_seen_at = ?, last_attempt_at = ?,
        last_error = NULL, consecutive_failures = 0, next_retry_at = NULL WHERE peer_id = ?`).run(now(), now(), peer.peer_id);
      const media = database.prepare('SELECT * FROM gig_media WHERE id = ? AND gig_id = ?').get(payload.mediaId, gig.id);
      if (!media || media.external_url) return sendError(response, 404, 'Shared media file not found.');
      const useCutout = payload.variant === 'cutout' && media.background_filename;
      const filename = useCutout ? media.background_filename : (payload.variant === 'original' ? media.filename : (media.playback_filename || media.filename));
      const mimeType = useCutout ? 'image/png' : (payload.variant === 'original' ? media.mime_type : (media.playback_mime || media.mime_type));
      const envelope = identity.signEnvelope({
        type: 'peer-media-response', requestNonce: payload.nonce, mediaId: media.id,
        mimeType, checksum: media.checksum || null, size: Number(media.size || 0)
      });
      const signedHeader = Buffer.from(JSON.stringify(envelope)).toString('base64url');
      const filePath = containedMediaPath(filename);
      if (!filePath) return sendError(response, 404, 'Shared media file not found.');
      return await streamFile(response, filePath, mimeType, request.headers.range, 'private, max-age=3600', {
        'X-Master-List-Peer-Envelope': signedHeader
      });
    } catch (error) {
      if (error.code === 'ENOENT') return sendError(response, 404, 'Shared media file not found.');
      return sendError(response, /signature|paired|expired|already been used/i.test(error.message) ? 401 : 400, error.message);
    }
  }

  async function proxy(request, response, match, url) {
    requireAccount(request);
    const [, peerId, sharedGigId, mediaId] = match;
    const selected = remoteMedia(peerId, sharedGigId, mediaId);
    if (!selected) return sendError(response, 404, 'Peer media is no longer listed for this shared show.');
    if (selected.media.externalUrl) return sendError(response, 400, 'External videos play directly from their provider.');
    try {
      const variant = url.searchParams.get('variant') === 'cutout' ? 'cutout' : 'playback';
      const remote = await transport.fetchMedia(peerRow(selected.record), { type: 'peer-media', sharedGigId, mediaId, variant }, { range: request.headers.range });
      response.writeHead(remote.response.status, remoteHeaders(remote.response));
      response.once?.('close', remote.abort);
      if (!remote.response.body) return response.end();
      return Readable.fromWeb(remote.response.body).pipe(response);
    } catch (error) {
      return sendError(response, 502, `Media from ${selected.record.peerName} is unavailable: ${error.message}`);
    }
  }

  function storageUsage() {
    return Number(database.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM gig_media WHERE external_url IS NULL').get().total || 0);
  }

  async function fileSignature(filePath) {
    const handle = await fs.open(filePath, 'r');
    try { const buffer = Buffer.alloc(16); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0); return buffer.subarray(0, bytesRead); }
    finally { await handle.close(); }
  }

  async function copyRemote({ selected, sharedGigId, mediaId, jobId, control }) {
    const targetGigId = selected.record.sourceGigId;
    const item = selected.media;
    const extension = mediaExtension(item.mimeType || 'application/octet-stream', item.filename || item.caption || 'peer-media');
    const storedFilename = `${randomUUID()}.${extension}`;
    const temporaryPath = path.join(mediaDir, `${storedFilename}.peer-copying`);
    const finalPath = path.join(mediaDir, storedFilename);
    let remote; let finalized = false; let persisted = false;
    try {
      jobs.save(jobId, 'Peer media copy', item.caption || item.filename || 'Shared media', 'running', 1);
      remote = await transport.fetchMedia(peerRow(selected.record), { type: 'peer-media', sharedGigId, mediaId, variant: 'original' }, { registerAbort: (abort) => { control.abort = abort; } });
      control.abort = remote.abort;
      if (jobs.get(jobId)?.status === 'cancelled') { remote.abort(); throw new Error('Copy cancelled.'); }
      const expectedSize = Number(item.size || remote.metadata.size || remote.response.headers.get('content-length') || 0);
      const initialStorage = storageUsage();
      if (initialStorage + expectedSize > maxStorageSize) throw new Error('This copy would exceed the configured media storage quota.');
      const output = await fs.open(temporaryPath, 'wx', 0o600);
      const checksum = createHash('sha256');
      let received = 0; let lastProgress = 1;
      try {
        for await (const chunk of remote.response.body) {
          if (jobs.get(jobId)?.status === 'cancelled') throw new Error('Copy cancelled.');
          const bytes = Buffer.from(chunk); received += bytes.length; checksum.update(bytes);
          if (initialStorage + received > maxStorageSize) throw new Error('This copy would exceed the configured media storage quota.');
          await output.write(bytes);
          const progress = expectedSize ? Math.min(98, Math.max(1, Math.round((received / expectedSize) * 98))) : Math.min(90, 5 + Math.floor(received / (64 * 1024 * 1024)));
          if (progress > lastProgress) { lastProgress = progress; jobs.save(jobId, 'Peer media copy', item.caption || item.filename || 'Shared media', 'running', progress); }
        }
      } finally { await output.close(); }
      if (!received) throw new Error('The peer returned an empty media file.');
      const mimeType = String(item.mimeType || remote.metadata.mimeType || remote.response.headers.get('content-type') || 'application/octet-stream');
      if (!/^image\/(jpeg|png|gif|webp)$|^video\/(mp4|webm|quicktime)$/.test(mimeType) || !validMediaSignature(await fileSignature(temporaryPath), mimeType)) throw new Error('The copied file does not match a supported media type.');
      const digest = checksum.digest('hex');
      if (item.checksum && digest !== item.checksum) throw new Error('The copied file failed its checksum verification.');
      const duplicate = item.checksum && database.prepare('SELECT id FROM gig_media WHERE gig_id = ? AND checksum = ? AND size = ?').get(targetGigId, item.checksum, received);
      if (duplicate) {
        await fs.rm(temporaryPath, { force: true });
        jobs.save(jobId, 'Peer media copy', item.caption || item.filename || 'Shared media', 'complete', 100);
        return;
      }
      await fs.rename(temporaryPath, finalPath);
      finalized = true;
      const id = randomUUID();
      const category = item.category === 'artifact' ? 'artifact' : 'show';
      const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ? AND category = ?').get(targetGigId, category).next;
      database.transaction(() => {
        const songIndex = Number(item.songIndex);
        const playbackStart = item.playbackStart == null || !Number.isFinite(Number(item.playbackStart)) ? null : Math.max(0, Number(item.playbackStart));
        const playbackEnd = item.playbackEnd == null || !Number.isFinite(Number(item.playbackEnd)) ? null : Math.max(0, Number(item.playbackEnd));
        database.prepare(`INSERT INTO gig_media
          (id, gig_id, filename, mime_type, caption, is_cover, sort_order, rotation, category, checksum, size,
            song_index, playback_preferred, playback_start, playback_end, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          id, targetGigId, storedFilename, mimeType, String(item.caption || item.filename || 'Shared media').slice(0, 500), sortOrder,
          Number.isFinite(Number(item.rotation)) ? Number(item.rotation) : 0, category, digest, received,
          Number.isInteger(songIndex) && songIndex >= 0 ? songIndex : null, item.playbackPreferred ? 1 : 0,
          playbackStart, playbackEnd, now()
        );
        if (!Array.isArray(item.playbackClips)) return;
        const insert = database.prepare(`INSERT INTO media_playback_clips
          (media_id, song_index, start_seconds, end_seconds, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        for (const clip of item.playbackClips) {
          const clipSongIndex = Number(clip.songIndex);
          if (!Number.isInteger(clipSongIndex) || clipSongIndex < 0) continue;
          const start = clip.startSeconds == null || !Number.isFinite(Number(clip.startSeconds)) ? null : Math.max(0, Number(clip.startSeconds));
          const end = clip.endSeconds == null || !Number.isFinite(Number(clip.endSeconds)) ? null : Math.max(0, Number(clip.endSeconds));
          insert.run(id, clipSongIndex, start, end, Math.max(0, Number(clip.priority || 0)), now(), now());
        }
      })();
      persisted = true;
      jobs.save(jobId, 'Peer media copy', item.caption || item.filename || 'Shared media', 'complete', 100);
      try { onImported({ id, gigId: targetGigId, filename: storedFilename, mimeType, caption: item.caption || item.filename || 'Shared media' }); } catch { /* The local copy remains valid if follow-up processing cannot start. */ }
    } catch (error) {
      remote?.abort?.();
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      if (finalized && !persisted) await fs.rm(finalPath, { force: true }).catch(() => {});
      if (jobs.get(jobId)?.status !== 'cancelled') jobs.save(jobId, 'Peer media copy', selected.media.caption || selected.media.filename || 'Shared media', 'error', 0, error.message);
    }
  }

  async function copy(request, response, match) {
    requireAccount(request);
    const [, peerId, sharedGigId, mediaId] = match;
    const selected = remoteMedia(peerId, sharedGigId, mediaId);
    if (!selected) return sendError(response, 404, 'Peer media is no longer listed for this shared show.');
    if (!selected.record.sourceGigId) return sendError(response, 409, 'Add this shared show to your local archive before saving its media.');
    if (selected.media.externalUrl) return sendError(response, 400, 'External provider videos cannot be copied.');
    const duplicate = selected.media.checksum && database.prepare('SELECT id FROM gig_media WHERE gig_id = ? AND checksum = ? AND size = ?').get(selected.record.sourceGigId, selected.media.checksum, Number(selected.media.size || 0));
    if (duplicate) return sendJson(response, 200, { duplicate: true, media: mediaRows(selected.record.sourceGigId).find((item) => item.id === duplicate.id) });
    const jobId = randomUUID();
    jobs.save(jobId, 'Peer media copy', selected.media.caption || selected.media.filename || 'Shared media', 'queued', 0);
    const control = { abort: () => {} };
    jobs.attach(jobId, { kill: () => control.abort() });
    schedule(() => copyRemote({ selected, sharedGigId, mediaId, jobId, control }));
    return sendJson(response, 202, jobs.get(jobId));
  }

  return async function handlePeerMedia(request, response, url) {
    if (request.method === 'POST' && url.pathname === '/api/sync/media') { await serveIncoming(request, response); return true; }
    const copyMatch = url.pathname.match(/^\/api\/peer-media\/([\w-]+)\/([\w-]+)\/([\w-]+)\/copy$/);
    if (request.method === 'POST' && copyMatch) { await copy(request, response, copyMatch); return true; }
    const proxyMatch = url.pathname.match(/^\/api\/peer-media\/([\w-]+)\/([\w-]+)\/([\w-]+)$/);
    if (request.method === 'GET' && proxyMatch) { await proxy(request, response, proxyMatch, url); return true; }
    return false;
  };
}

module.exports = { createPeerMediaRoutes };
