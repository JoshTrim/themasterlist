function createMediaUploadRoutes({
  database, fs, legacyFs, path, mediaDir, maxMediaSize, randomUUID, createHash,
  mediaExtension, mediaCategory, validMediaSignature, hashFile, mediaRows, readBody, sendJson, sendError,
  startPlaybackEncode, recognizeVideoTrack, auddConfigured = () => false, logger = console,
  now = () => new Date().toISOString(), schedule = setImmediate, maxStorageSize = Infinity
}) {
  const sessions = new Map();
  const acceptedMedia = /^image\/(jpeg|png|gif|webp)$|^video\/(mp4|webm|quicktime)$/;
  const acceptedArtifact = /^image\/(jpeg|png|gif|webp)$/;

  function storageUsage() {
    return Number(database.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM gig_media WHERE external_url IS NULL').get().total || 0);
  }

  function hasCapacity(bytes, exceptUploadId = null) {
    const reserved = [...sessions].filter(([id, entry]) => id !== exceptUploadId && !entry.complete).reduce((sum, [, entry]) => sum + Number(entry.total || 0), 0);
    return storageUsage() + reserved + Number(bytes || 0) <= maxStorageSize;
  }

  async function signatureFor(filePath) {
    const handle = await fs.open(filePath, 'r');
    try { const buffer = Buffer.alloc(16); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0); return buffer.subarray(0, bytesRead); }
    finally { await handle.close(); }
  }

  function matches(pathname) {
    const chunk = pathname.match(/^\/api\/gigs\/([\w-]+)\/(media|artifacts)\/chunk$/);
    const collection = pathname.match(/^\/api\/gigs\/([\w-]+)\/(media|artifacts)$/);
    return { chunk, collection };
  }

  function queueVideo(gigId, id, storedFilename, displayName) {
    startPlaybackEncode(id, gigId, storedFilename, displayName);
    schedule(() => recognizeVideoTrack(gigId, id, path.join(mediaDir, storedFilename), displayName));
  }

  function markRecognitionQueued(id, mimeType) {
    if (auddConfigured() && mimeType.startsWith('video/')) {
      database.prepare("UPDATE gig_media SET recognition_status = 'queued' WHERE id = ?").run(id);
    }
  }

  function insertUpload({ id, gigId, storedFilename, mimeType, caption, category, checksum = null, size, isCover = false }) {
    const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ? AND category = ?').get(gigId, category).next;
    database.prepare(`INSERT INTO gig_media
      (id, gig_id, filename, mime_type, caption, is_cover, sort_order, rotation, category, checksum, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`).run(id, gigId, storedFilename, mimeType, caption, isCover ? 1 : 0, sortOrder, category, checksum, size, now());
    markRecognitionQueued(id, mimeType);
  }

  function duplicate(gigId, checksum, size, category) {
    return database.prepare('SELECT id FROM gig_media WHERE gig_id = ? AND checksum = ? AND size = ? AND category = ?').get(gigId, checksum, size, category);
  }

  async function handleChunk(request, response, url, match) {
    const gigId = match[1];
    const category = match[2] === 'artifacts' ? 'artifact' : mediaCategory(url.searchParams.get('category') || request.headers['x-media-category']);
    const uploadId = String(request.headers['x-upload-id'] || '');
    const filename = decodeURIComponent(String(request.headers['x-media-filename'] || 'upload')).slice(0, 180);
    const total = Number(request.headers['x-upload-total'] || 0);
    const offset = Number(request.headers['x-upload-offset'] || 0);
    const mimeType = String(request.headers['content-type'] || 'video/mp4').split(';')[0].trim();
    logger.log(`[media] ${category === 'artifact' ? 'artifact ' : ''}chunk upload request for gig ${gigId} offset ${offset}`);
    if (!uploadId || !total || total > maxMediaSize) return sendError(response, 400, 'Invalid upload session.');
    if (!acceptedMedia.test(mimeType)) return sendError(response, 415, 'Upload an image or video file.');
    if (category === 'artifact' && !acceptedArtifact.test(mimeType)) return sendError(response, 415, 'Artifacts must be uploaded as photos.');
    if (!database.prepare('SELECT id FROM gigs WHERE id = ?').get(gigId)) return sendError(response, 404, 'Gig not found.');

    for (const [sessionId, entry] of sessions) if (entry.expiresAt && entry.expiresAt < Date.now()) sessions.delete(sessionId);
    let session = sessions.get(uploadId);
    if (session && (session.gigId !== gigId || session.total !== total || session.category !== category)) return sendError(response, 409, 'Upload session details do not match.');
    if (session?.complete) return sendJson(response, 200, { complete: true, offset: session.total, media: mediaRows(gigId).find((entry) => entry.id === session.mediaId) });
    if (!session) {
      if (!hasCapacity(total, uploadId)) return sendError(response, 507, 'This upload would exceed the configured media storage quota.');
      const stored = `${randomUUID()}.${mediaExtension(mimeType, filename)}`;
      session = { gigId, filename, total, category, mimeType, offset: 0, stored, path: path.join(mediaDir, `${stored}.uploading`) };
      await fs.mkdir(mediaDir, { recursive: true });
      sessions.set(uploadId, session);
    }
    if (offset !== session.offset) return sendJson(response, 409, { offset: session.offset });

    const output = legacyFs.createWriteStream(session.path, { flags: offset ? 'a' : 'w' });
    for await (const chunk of request) {
      session.offset += chunk.length;
      if (session.offset > session.total || session.offset > maxMediaSize) {
        output.destroy();
        await fs.rm(session.path, { force: true });
        sessions.delete(uploadId);
        return sendError(response, 413, 'Upload exceeded its declared size.');
      }
      if (!output.write(chunk)) await new Promise((resolve) => output.once('drain', resolve));
    }
    await new Promise((resolve, reject) => output.end((error) => error ? reject(error) : resolve()));
    if (session.offset < session.total) return sendJson(response, 200, { complete: false, offset: session.offset });

    if (!validMediaSignature(await signatureFor(session.path), mimeType)) {
      await fs.rm(session.path, { force: true }); sessions.delete(uploadId);
      return sendError(response, 415, 'The uploaded file contents do not match the declared media type.');
    }
    await fs.rename(session.path, path.join(mediaDir, session.stored));
    const checksum = await hashFile(path.join(mediaDir, session.stored));
    const existing = duplicate(gigId, checksum, session.total, category);
    if (existing) {
      await fs.rm(path.join(mediaDir, session.stored), { force: true });
      sessions.set(uploadId, { ...session, complete: true, mediaId: existing.id, expiresAt: Date.now() + 10 * 60 * 1000 });
      return sendJson(response, 200, { complete: true, duplicate: true, offset: session.total, media: mediaRows(gigId).find((entry) => entry.id === existing.id) });
    }
    const id = randomUUID();
    insertUpload({ id, gigId, storedFilename: session.stored, mimeType, caption: filename, category, checksum, size: session.total });
    sessions.set(uploadId, { ...session, complete: true, mediaId: id, expiresAt: Date.now() + 10 * 60 * 1000 });
    if (mimeType.startsWith('video/')) queueVideo(gigId, id, session.stored, filename);
    return sendJson(response, 201, { complete: true, media: mediaRows(gigId).find((entry) => entry.id === id) });
  }

  async function handleRawUpload(request, response, url, gigId, category, mimeType) {
    const filename = decodeURIComponent(String(request.headers['x-media-filename'] || 'upload')).slice(0, 180);
    const expectedSize = Number(request.headers['content-length'] || 0);
    if (!acceptedMedia.test(mimeType)) return sendError(response, 415, 'Upload an image or video file.');
    if (category === 'artifact' && !acceptedArtifact.test(mimeType)) return sendError(response, 415, 'Artifacts must be uploaded as photos.');
    if (expectedSize > maxMediaSize) return sendError(response, 413, 'Each upload is larger than the configured limit.');
    if (expectedSize && !hasCapacity(expectedSize)) return sendError(response, 507, 'This upload would exceed the configured media storage quota.');
    await fs.mkdir(mediaDir, { recursive: true });
    const id = randomUUID();
    const storedFilename = `${id}.${mediaExtension(mimeType, filename)}`;
    const temporaryPath = path.join(mediaDir, `${storedFilename}.uploading`);
    const output = legacyFs.createWriteStream(temporaryPath, { flags: 'wx' });
    const checksum = createHash('sha256');
    let size = 0;
    try {
      for await (const chunk of request) {
        size += chunk.length;
        checksum.update(chunk);
        if (size > maxMediaSize) throw new Error('Upload exceeded the configured size limit.');
        if (!output.write(chunk)) await new Promise((resolve) => output.once('drain', resolve));
      }
      if (!size) throw new Error('The uploaded file was empty.');
      await new Promise((resolve, reject) => output.end((error) => error ? reject(error) : resolve()));
      await fs.rename(temporaryPath, path.join(mediaDir, storedFilename));
    } catch (error) {
      output.destroy();
      await fs.rm(temporaryPath, { force: true });
      return sendError(response, 413, error.message);
    }
    if (!validMediaSignature(await signatureFor(path.join(mediaDir, storedFilename)), mimeType)) {
      await fs.rm(path.join(mediaDir, storedFilename), { force: true });
      return sendError(response, 415, 'The uploaded file contents do not match the declared media type.');
    }
    if (!hasCapacity(size)) { await fs.rm(path.join(mediaDir, storedFilename), { force: true }); return sendError(response, 507, 'This upload would exceed the configured media storage quota.'); }
    const digest = checksum.digest('hex');
    const existing = duplicate(gigId, digest, size, category);
    if (existing) {
      await fs.rm(path.join(mediaDir, storedFilename), { force: true });
      return sendJson(response, 200, { duplicate: true, media: mediaRows(gigId).find((entry) => entry.id === existing.id) });
    }
    const caption = decodeURIComponent(String(request.headers['x-media-caption'] || filename)).trim();
    insertUpload({ id, gigId, storedFilename, mimeType, caption, category, checksum: digest, size });
    logger.log(`[media] upload complete: ${id}`);
    if (mimeType.startsWith('video/')) queueVideo(gigId, id, storedFilename, filename);
    return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
  }

  async function handleJsonUpload(request, response, gigId, category) {
    const body = await readBody(request);
    if (body.externalUrl) {
      let parsed;
      try { parsed = new URL(String(body.externalUrl)); } catch { return sendError(response, 400, 'Enter a valid YouTube URL.'); }
      if (!['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(parsed.hostname.toLowerCase())) return sendError(response, 400, 'Only YouTube URLs can be added as external media.');
      const id = randomUUID();
      const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM gig_media WHERE gig_id = ?').get(gigId).next;
      database.prepare(`INSERT INTO gig_media
        (id, gig_id, filename, mime_type, caption, is_cover, sort_order, rotation, category, external_url, song_index, source_description, size, created_at)
        VALUES (?, ?, 'external', 'video/youtube', ?, 0, ?, 0, 'other', ?, ?, ?, 0, ?)`).run(id, gigId, String(body.caption || 'YouTube video').trim(), sortOrder, parsed.toString(), Number.isInteger(body.songIndex) ? body.songIndex : null, String(body.sourceDescription || ''), now());
      return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
    }
    const mimeType = String(body.mimeType || '');
    const filename = String(body.filename || 'upload').slice(0, 180);
    if (!acceptedMedia.test(mimeType)) return sendError(response, 415, 'Upload an image or video file.');
    if (category === 'artifact' && !acceptedArtifact.test(mimeType)) return sendError(response, 415, 'Artifacts must be uploaded as photos.');
    const file = Buffer.from(String(body.data || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!file.length || file.length > maxMediaSize) return sendError(response, 413, 'Upload size is outside the configured limit.');
    if (!validMediaSignature(file.subarray(0, 16), mimeType)) return sendError(response, 415, 'The uploaded file contents do not match the declared media type.');
    if (!hasCapacity(file.length)) return sendError(response, 507, 'This upload would exceed the configured media storage quota.');
    await fs.mkdir(mediaDir, { recursive: true });
    const id = randomUUID();
    const storedFilename = `${id}.${mediaExtension(mimeType, filename)}`;
    await fs.writeFile(path.join(mediaDir, storedFilename), file);
    insertUpload({ id, gigId, storedFilename, mimeType, caption: String(body.caption || filename).trim(), category, size: file.length, isCover: body.isCover });
    if (mimeType.startsWith('video/')) schedule(() => recognizeVideoTrack(gigId, id, path.join(mediaDir, storedFilename), filename));
    return sendJson(response, 201, mediaRows(gigId).find((media) => media.id === id));
  }

  return async function handleMediaUpload(request, response, url) {
    const { chunk, collection } = matches(url.pathname);
    if (request.method === 'POST' && chunk) {
      await handleChunk(request, response, url, chunk);
      return true;
    }
    if (!collection) return false;
    const gigId = collection[1];
    const category = collection[2] === 'artifacts' ? 'artifact' : mediaCategory(url.searchParams.get('category') || request.headers['x-media-category']);
    if (request.method === 'GET' && collection[2] === 'media') {
      if (!database.prepare('SELECT id FROM gigs WHERE id = ?').get(gigId)) sendError(response, 404, 'Gig not found.');
      else sendJson(response, 200, mediaRows(gigId));
      return true;
    }
    if (request.method !== 'POST') return false;
    logger.log(`[media] upload request for gig ${gigId}: ${request.headers['content-type'] || 'unknown'} (${request.headers['content-length'] || 'unknown'} bytes)`);
    if (!database.prepare('SELECT id FROM gigs WHERE id = ?').get(gigId)) {
      sendError(response, 404, 'Gig not found.');
      return true;
    }
    const contentType = String(request.headers['content-type'] || '');
    if (contentType.includes('application/json')) await handleJsonUpload(request, response, gigId, category);
    else await handleRawUpload(request, response, url, gigId, category, contentType.split(';')[0].trim());
    return true;
  };
}

module.exports = { createMediaUploadRoutes };
