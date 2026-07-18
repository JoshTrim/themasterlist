function createMediaRecognition({
  database, fs, token, jobs, processor, providerResponse, findGig, recognitionKey,
  randomUUID, schedule = setImmediate,
  createForm = () => new FormData(),
  createBlob = (content, options) => new Blob(content, options)
}) {
  function configured() {
    return Boolean(token());
  }

  async function recognize(gigId, mediaId, filePath, filename) {
    if (!configured()) return null;
    const jobId = randomUUID();
    const samplePath = `${filePath}.${mediaId}.recognition.mp3`;
    jobs.save(jobId, 'Detect track', filename, 'running', 5);
    database.prepare("UPDATE gig_media SET recognition_status = 'running', recognition_error = NULL WHERE id = ?").run(mediaId);
    try {
      const duration = await processor.probeDuration(filePath, { onProcess: (child) => jobs.attach(jobId, child) });
      if (jobs.get(jobId)?.status === 'cancelled') throw new Error('Track detection was cancelled.');
      const start = duration > 18 ? Math.max(0, Math.min(120, (duration / 2) - 6)) : 0;
      await processor.extractRecognitionSample(filePath, samplePath, start, { onProcess: (child) => jobs.attach(jobId, child) });
      if (jobs.get(jobId)?.status === 'cancelled') throw new Error('Track detection was cancelled.');
      jobs.save(jobId, 'Detect track', filename, 'running', 45);
      const audio = await fs.readFile(samplePath);
      const form = createForm();
      form.append('api_token', token());
      form.append('return', 'apple_music,spotify');
      form.append('file', createBlob([audio], { type: 'audio/mpeg' }), `${mediaId}.mp3`);
      const payload = await providerResponse('https://api.audd.io/', { method: 'POST', body: form }, 'audd');
      if (payload?.status !== 'success') throw new Error(payload?.error?.error_message || payload?.error || 'AudD could not identify this clip.');
      const result = payload.result || null;
      const title = result?.title ? String(result.title) : null;
      const artist = result?.artist ? String(result.artist) : null;
      const album = result?.album ? String(result.album) : null;
      const songs = findGig(gigId).songs || [];
      const matchIndex = title ? songs.findIndex((song) => recognitionKey(song.title) === recognitionKey(title)) : -1;
      const status = matchIndex >= 0 ? 'matched' : result ? 'identified' : 'not_found';
      database.prepare(`UPDATE gig_media SET recognition_status = ?, recognition_result = ?,
        recognition_title = ?, recognition_artist = ?, recognition_album = ?, recognition_error = NULL,
        song_index = CASE WHEN song_index IS NULL AND recognition_override = 0 AND ? >= 0 THEN ? ELSE song_index END
        WHERE id = ?`).run(status, result ? JSON.stringify(result) : null, title, artist, album, matchIndex, matchIndex >= 0 ? matchIndex : null, mediaId);
      jobs.save(jobId, 'Detect track', filename, 'complete', 100);
    } catch (error) {
      const cancelled = jobs.get(jobId)?.status === 'cancelled';
      database.prepare('UPDATE gig_media SET recognition_status = ?, recognition_error = ? WHERE id = ?').run(cancelled ? 'not_started' : 'error', error.message, mediaId);
      jobs.save(jobId, 'Detect track', filename, cancelled ? 'cancelled' : 'error', 0, error.message);
    } finally {
      await fs.rm(samplePath, { force: true }).catch(() => {});
    }
    return jobs.get(jobId);
  }

  function queue(gigId, mediaId, filePath, filename) {
    database.prepare("UPDATE gig_media SET recognition_status = 'queued', recognition_error = NULL WHERE id = ?").run(mediaId);
    schedule(() => recognize(gigId, mediaId, filePath, filename));
  }

  return { configured, recognize, queue };
}

module.exports = { createMediaRecognition };
