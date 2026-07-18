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

module.exports = { recoverMediaWork };
