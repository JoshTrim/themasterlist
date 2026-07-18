function createMediaMutationRoutes({
  database, fs, existsSync, path, mediaDir, randomUUID, schedule = setImmediate,
  requireAccount, readBody, sendJson, sendError, mediaRows, hashFile,
  encoding, recognition, processor, jobs
}) {
  function mediaById(id) {
    return database.prepare('SELECT * FROM gig_media WHERE id = ?').get(id);
  }

  function jobCancelled(jobId) {
    return jobs.get(jobId)?.status === 'cancelled';
  }

  async function patchMedia(request, response, id) {
    const media = mediaById(id);
    if (!media) return sendError(response, 404, 'Media not found.');
    const body = await readBody(request);
    const playbackStart = 'playbackStart' in body && body.playbackStart !== '' && body.playbackStart !== null ? Number(body.playbackStart) : null;
    const playbackEnd = 'playbackEnd' in body && body.playbackEnd !== '' && body.playbackEnd !== null ? Number(body.playbackEnd) : null;
    if ('playbackStart' in body && playbackStart !== null && (!Number.isFinite(playbackStart) || playbackStart < 0)) return sendError(response, 400, 'Playback start must be zero or greater.');
    if ('playbackEnd' in body && playbackEnd !== null && (!Number.isFinite(playbackEnd) || playbackEnd <= 0)) return sendError(response, 400, 'Playback end must be greater than zero.');
    const effectiveStart = 'playbackStart' in body ? playbackStart : media.playback_start;
    const effectiveEnd = 'playbackEnd' in body ? playbackEnd : media.playback_end;
    if (effectiveStart !== null && effectiveEnd !== null && Number(effectiveEnd) <= Number(effectiveStart)) return sendError(response, 400, 'Playback end must be after playback start.');
    const nextSongIndex = 'songIndex' in body ? (body.songIndex === null || body.songIndex === '' ? null : Number(body.songIndex)) : media.song_index;
    const nextPreferred = 'playbackPreferred' in body ? Boolean(body.playbackPreferred) : Boolean(media.playback_preferred);
    if (nextPreferred && nextSongIndex !== null) database.prepare('UPDATE gig_media SET playback_preferred = 0 WHERE gig_id = ? AND song_index = ? AND id <> ?').run(media.gig_id, nextSongIndex, media.id);
    if ('isCover' in body && body.isCover) database.prepare('UPDATE gig_media SET is_cover = 0 WHERE gig_id = ?').run(media.gig_id);
    database.prepare(`UPDATE gig_media SET caption = COALESCE(?, caption), is_cover = COALESCE(?, is_cover),
      sort_order = COALESCE(?, sort_order), rotation = COALESCE(?, rotation),
      song_index = CASE WHEN ? THEN ? ELSE song_index END,
      recognition_override = COALESCE(?, recognition_override),
      use_background_removed = COALESCE(?, use_background_removed),
      playback_preferred = COALESCE(?, playback_preferred),
      playback_start = CASE WHEN ? THEN ? ELSE playback_start END,
      playback_end = CASE WHEN ? THEN ? ELSE playback_end END WHERE id = ?`).run(
      'caption' in body ? String(body.caption || '').trim() : null,
      'isCover' in body ? (body.isCover ? 1 : 0) : null,
      'sortOrder' in body ? Number(body.sortOrder) : null,
      'rotation' in body ? ((Number(body.rotation) % 360) + 360) % 360 : null,
      'songIndex' in body ? 1 : 0, nextSongIndex,
      'recognitionOverride' in body ? (body.recognitionOverride ? 1 : 0) : null,
      'useBackgroundRemoved' in body ? (body.useBackgroundRemoved ? 1 : 0) : null,
      'playbackPreferred' in body ? (body.playbackPreferred ? 1 : 0) : null,
      'playbackStart' in body ? 1 : 0, playbackStart,
      'playbackEnd' in body ? 1 : 0, playbackEnd, id
    );
    return sendJson(response, 200, mediaRows(media.gig_id).find((entry) => entry.id === id));
  }

  async function deleteMedia(response, id) {
    const media = mediaById(id);
    if (!media) return sendError(response, 404, 'Media not found.');
    for (const filename of [media.filename, media.playback_filename, media.background_filename].filter(Boolean)) {
      await fs.rm(path.join(mediaDir, filename), { force: true });
    }
    database.prepare('DELETE FROM gig_media WHERE id = ?').run(id);
    return sendJson(response, 200, { ok: true });
  }

  function retryEncode(request, response, id) {
    requireAccount(request);
    const media = mediaById(id);
    if (!media || !String(media.mime_type || '').startsWith('video/') || media.external_url) return sendError(response, 400, 'Only uploaded videos can create a playback copy.');
    if (media.playback_status === 'encoding') return sendError(response, 409, 'Playback encoding is already running.');
    if (!existsSync(path.join(mediaDir, media.filename))) return sendError(response, 409, 'The original media file is missing from disk.');
    return sendJson(response, 202, { jobId: encoding.start(media.id, media.gig_id, media.filename, media.caption || media.filename) });
  }

  function retryRecognition(request, response, id) {
    requireAccount(request);
    const media = mediaById(id);
    if (!media || !String(media.mime_type || '').startsWith('video/') || media.external_url) return sendError(response, 400, 'Only uploaded videos can use track detection.');
    if (['queued', 'running'].includes(media.recognition_status)) return sendError(response, 409, 'Track detection is already running.');
    if (!recognition.configured()) return sendError(response, 409, 'AudD is not configured.');
    const sourcePath = path.join(mediaDir, media.filename);
    if (!existsSync(sourcePath)) return sendError(response, 409, 'The original media file is missing from disk.');
    recognition.queue(media.gig_id, media.id, sourcePath, media.caption || media.filename);
    return sendJson(response, 202, { ok: true });
  }

  function removeBackground(response, id) {
    const media = mediaById(id);
    if (!media) return sendError(response, 404, 'Media not found.');
    if (media.category !== 'artifact' || !media.mime_type.startsWith('image/')) return sendError(response, 400, 'Background removal is only available for artifact photos.');
    if (media.background_status === 'running') return sendError(response, 409, 'Background removal is already running.');
    const inputPath = path.join(mediaDir, media.filename);
    const outputName = `${path.parse(media.filename).name}.cutout.png`;
    const outputPath = path.join(mediaDir, outputName);
    const temporaryPath = `${outputPath}.processing.png`;
    const jobId = randomUUID();
    const jobName = media.caption || media.filename;
    database.prepare("UPDATE gig_media SET background_status = 'running', background_error = NULL WHERE id = ?").run(media.id);
    jobs.save(jobId, 'Remove background', jobName, 'running', 10);
    schedule(async () => {
      try {
        jobs.save(jobId, 'Remove background', jobName, 'running', 25);
        await processor.removeImageBackground(inputPath, temporaryPath, { onProcess: (child) => jobs.attach(jobId, child) });
        if (jobCancelled(jobId)) throw new Error('Background removal was cancelled.');
        jobs.save(jobId, 'Remove background', jobName, 'running', 90);
        await fs.rename(temporaryPath, outputPath);
        database.prepare("UPDATE gig_media SET background_filename = ?, background_status = 'complete', background_error = NULL, use_background_removed = 1 WHERE id = ?").run(outputName, media.id);
        jobs.save(jobId, 'Remove background', jobName, 'complete', 100);
      } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => {});
        database.prepare('UPDATE gig_media SET background_status = ?, background_error = ? WHERE id = ?').run(jobCancelled(jobId) ? 'not_started' : 'error', error.message, media.id);
        jobs.save(jobId, 'Remove background', jobName, jobCancelled(jobId) ? 'cancelled' : 'error', 0, error.message);
      }
    });
    return sendJson(response, 202, { jobId });
  }

  function trimVideo(response, url, id) {
    const media = mediaById(id);
    if (!media || !media.mime_type.startsWith('video/') || media.external_url) return sendError(response, 400, 'Only uploaded videos can be trimmed.');
    const start = Number(url.searchParams.get('start'));
    const end = Number(url.searchParams.get('end'));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return sendError(response, 400, 'Trim times are invalid.');
    const inputPath = path.join(mediaDir, media.filename);
    const outputPath = `${inputPath}.trimming.mp4`;
    const jobId = randomUUID();
    jobs.save(jobId, 'Trim video', media.filename, 'running', 5);
    schedule(async () => {
      try {
        await processor.trimVideo(inputPath, outputPath, start, end - start, {
          onProcess: (child) => jobs.attach(jobId, child),
          onProgress: (microseconds) => jobs.save(jobId, 'Trim video', media.filename, 'running', Math.min(99, Math.round((microseconds / 1_000_000 / (end - start)) * 100)))
        });
        if (jobCancelled(jobId)) throw new Error('Video trimming was cancelled.');
        await fs.rename(outputPath, inputPath);
        if (media.playback_filename) await fs.rm(path.join(mediaDir, media.playback_filename), { force: true });
        database.prepare("UPDATE gig_media SET playback_filename = NULL, playback_mime = NULL, playback_status = 'not_started', playback_error = NULL, size = ?, checksum = ? WHERE id = ?").run((await fs.stat(inputPath)).size, await hashFile(inputPath), media.id);
        jobs.save(jobId, 'Trim video', media.filename, 'complete', 100);
      } catch (error) {
        await fs.rm(outputPath, { force: true });
        jobs.save(jobId, 'Trim video', media.filename, jobCancelled(jobId) ? 'cancelled' : 'error', 0, error.message);
      }
    });
    return sendJson(response, 202, { jobId });
  }

  function rotateVideo(response, url, id) {
    const media = mediaById(id);
    if (!media) return sendError(response, 404, 'Media not found.');
    if (!media.mime_type.startsWith('video/') || media.external_url) return sendError(response, 400, 'Only uploaded videos can be rotated this way.');
    const inputPath = path.join(mediaDir, media.playback_filename || media.filename);
    const outputPath = `${inputPath}.rotating.mp4`;
    const direction = url.searchParams.get('direction') === 'counterclockwise' ? 'counterclockwise' : 'clockwise';
    const jobId = randomUUID();
    jobs.save(jobId, 'Rotate video', media.filename, 'running', 5);
    schedule(async () => {
      try {
        const duration = await processor.probeDuration(inputPath, { onProcess: (child) => jobs.attach(jobId, child) });
        if (jobCancelled(jobId)) return;
        await processor.rotateVideo(inputPath, outputPath, direction, {
          onProcess: (child) => jobs.attach(jobId, child),
          onProgress: (microseconds) => jobs.save(jobId, 'Rotate video', media.filename, 'running', duration ? Math.min(99, Math.round((microseconds / 1_000_000 / duration) * 100)) : 10)
        });
        if (jobCancelled(jobId)) throw new Error('Video rotation was cancelled.');
        await fs.rename(outputPath, inputPath);
        database.prepare('UPDATE gig_media SET rotation = 0 WHERE id = ?').run(media.id);
        jobs.save(jobId, 'Rotate video', media.filename, 'complete', 100);
      } catch (error) {
        await fs.rm(outputPath, { force: true });
        jobs.save(jobId, 'Rotate video', media.filename, jobCancelled(jobId) ? 'cancelled' : 'error', 0, error.message);
      }
    });
    return sendJson(response, 202, { jobId });
  }

  return async function handleMediaMutation(request, response, url) {
    const retryEncodeMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/retry-encode$/);
    if (request.method === 'POST' && retryEncodeMatch) { retryEncode(request, response, retryEncodeMatch[1]); return true; }
    const retryRecognitionMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/retry-recognition$/);
    if (request.method === 'POST' && retryRecognitionMatch) { retryRecognition(request, response, retryRecognitionMatch[1]); return true; }
    const backgroundMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/remove-background$/);
    if (request.method === 'POST' && backgroundMatch) { removeBackground(response, backgroundMatch[1]); return true; }
    const trimMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/trim$/);
    if (request.method === 'POST' && trimMatch) { trimVideo(response, url, trimMatch[1]); return true; }
    const rotateMatch = url.pathname.match(/^\/api\/media\/([\w-]+)\/rotate$/);
    if (request.method === 'POST' && rotateMatch) { rotateVideo(response, url, rotateMatch[1]); return true; }
    const rotateStatusMatch = url.pathname.match(/^\/api\/media\/rotate\/([\w-]+)$/);
    if (request.method === 'GET' && rotateStatusMatch) { sendJson(response, 200, jobs.get(rotateStatusMatch[1]) || { status: 'missing', progress: 0 }); return true; }
    const mediaMatch = url.pathname.match(/^\/api\/media\/([\w-]+)$/);
    if (request.method === 'PATCH' && mediaMatch) { await patchMedia(request, response, mediaMatch[1]); return true; }
    if (request.method === 'DELETE' && mediaMatch) { await deleteMedia(response, mediaMatch[1]); return true; }
    return false;
  };
}

module.exports = { createMediaMutationRoutes };
