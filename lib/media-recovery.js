async function recoverMediaWork({ database, fs, path, mediaDir, now = () => new Date().toISOString() }) {
  const timestamp = now();
  const interrupted = 'Interrupted when the server restarted.';
  const jobs = database.prepare("UPDATE background_jobs SET status = 'error', error = ?, updated_at = ? WHERE status IN ('queued', 'running')").run(interrupted, timestamp).changes;
  const encodes = database.prepare("UPDATE gig_media SET playback_status = 'error', playback_error = ? WHERE playback_status = 'encoding'").run(interrupted).changes;
  const recognition = database.prepare("UPDATE gig_media SET recognition_status = 'error', recognition_error = ? WHERE recognition_status IN ('queued', 'running')").run(interrupted).changes;
  const backgrounds = database.prepare("UPDATE gig_media SET background_status = 'error', background_error = ? WHERE background_status = 'running'").run(interrupted).changes;
  let temporaryFiles = 0;
  const entries = await fs.readdir(mediaDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !/(?:\.uploading|\.processing\.png|\.rotating\.mp4|\.trimming\.mp4)$/i.test(entry.name)) continue;
    await fs.rm(path.join(mediaDir, entry.name), { force: true });
    temporaryFiles += 1;
  }
  return { jobs, encodes, recognition, backgrounds, temporaryFiles };
}

function resumeInterruptedMediaWork({ database, existsSync, path, mediaDir, encoding, recognition, startBackgroundRemoval, recognitionConfigured = false, logger = console }) {
  const interrupted = 'Interrupted when the server restarted.';
  const encodes = database.prepare(`SELECT id, gig_id AS gigId, filename, caption FROM gig_media
    WHERE playback_status = 'error' AND playback_error = ? AND external_url IS NULL AND mime_type LIKE 'video/%'`).all(interrupted);
  const backgrounds = database.prepare(`SELECT id FROM gig_media
    WHERE background_status = 'error' AND background_error = ? AND category = 'artifact' AND mime_type LIKE 'image/%'`).all(interrupted);
  const recognitionRows = recognitionConfigured ? database.prepare(`SELECT id, gig_id AS gigId, filename, caption FROM gig_media
    WHERE recognition_status = 'error' AND recognition_error = ? AND external_url IS NULL AND mime_type LIKE 'video/%'`).all(interrupted) : [];
  const result = { encodes: 0, backgrounds: 0, recognition: 0, missingOriginals: 0 };
  for (const media of encodes) {
    if (!existsSync(path.join(mediaDir, media.filename))) { result.missingOriginals += 1; continue; }
    encoding.start(media.id, media.gigId, media.filename, media.caption || media.filename); result.encodes += 1;
  }
  for (const media of backgrounds) {
    try { startBackgroundRemoval(media.id); result.backgrounds += 1; }
    catch (error) { logger.error?.('[media] background retry failed:', error.message); }
  }
  for (const media of recognitionRows) {
    if (!existsSync(path.join(mediaDir, media.filename))) { result.missingOriginals += 1; continue; }
    recognition.queue(media.gigId, media.id, path.join(mediaDir, media.filename), media.caption || media.filename); result.recognition += 1;
  }
  return result;
}

module.exports = { recoverMediaWork, resumeInterruptedMediaWork };
