function createMediaEncoding({ database, fs, path, mediaDir, jobs, processor, safeMediaName, randomUUID, schedule = setImmediate }) {
  function start(mediaId, gigId, sourceFilename, displayName) {
    const media = database.prepare('SELECT id FROM gig_media WHERE id = ? AND gig_id = ?').get(mediaId, gigId);
    if (!media) throw new Error('Media not found.');
    const gig = database.prepare('SELECT artist, venue, date FROM gigs WHERE id = ?').get(gigId);
    const proxyName = `${safeMediaName(gig?.artist)}-${safeMediaName(gig?.venue)}-${safeMediaName(gig?.date)}-${mediaId.slice(0, 8)}-playback.mp4`;
    const sourcePath = path.join(mediaDir, sourceFilename);
    const outputPath = path.join(mediaDir, proxyName);
    const jobId = randomUUID();
    const jobName = displayName || sourceFilename;
    database.prepare("UPDATE gig_media SET playback_status = 'encoding', playback_error = NULL WHERE id = ?").run(mediaId);
    jobs.save(jobId, 'Encode video', jobName, 'running', 1);
    schedule(async () => {
      const duration = await processor.probeDuration(sourcePath, { onProcess: (child) => jobs.attach(jobId, child) });
      if (jobs.get(jobId)?.status === 'cancelled') {
        database.prepare("UPDATE gig_media SET playback_status = 'not_started', playback_error = 'Encoding cancelled.' WHERE id = ?").run(mediaId);
        return;
      }
      const encoded = await processor.createPlaybackProxy(sourcePath, outputPath, {
        onProcess: (child) => jobs.attach(jobId, child),
        onProgress: (microseconds) => {
          const progress = duration ? Math.min(99, Math.max(1, Math.round((microseconds / 1_000_000 / duration) * 100))) : 10;
          jobs.save(jobId, 'Encode video', jobName, 'running', progress);
        }
      });
      if (encoded) {
        database.prepare("UPDATE gig_media SET playback_filename = ?, playback_mime = 'video/mp4', playback_status = 'ready', playback_error = NULL WHERE id = ?").run(proxyName, mediaId);
        jobs.save(jobId, 'Encode video', jobName, 'complete', 100);
      } else if (jobs.get(jobId)?.status === 'cancelled') {
        await fs.rm(outputPath, { force: true }).catch(() => {});
        database.prepare("UPDATE gig_media SET playback_status = 'not_started', playback_error = 'Encoding cancelled.' WHERE id = ?").run(mediaId);
      } else {
        database.prepare("UPDATE gig_media SET playback_status = 'error', playback_error = 'Playback encode failed.' WHERE id = ?").run(mediaId);
        jobs.save(jobId, 'Encode video', jobName, 'error', 0, 'Playback encode failed.');
      }
    });
    return jobId;
  }

  return { start };
}

module.exports = { createMediaEncoding };
