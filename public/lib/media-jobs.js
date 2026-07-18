(function exposeMediaJobs(root, factory) {
  const mediaJobs = factory();
  if (typeof module === 'object' && module.exports) module.exports = mediaJobs;
  else root.MasterListMediaJobs = mediaJobs;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMediaJobs() {
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  async function poll({ fetchStatus, isActive = (status) => ['queued', 'running'].includes(status?.status), onUpdate = () => {}, interval = 1000, maxAttempts = 120, sleep = wait }) {
    let status = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      status = await fetchStatus(attempt);
      await onUpdate(status, attempt);
      if (!isActive(status)) return status;
      await sleep(interval);
    }
    throw new Error('Background job status timed out.');
  }

  async function pollRecognition({ fetchMedia, onUpdate = () => {}, interval = 1500, maxAttempts = 20, sleep = wait }) {
    return poll({
      fetchStatus: fetchMedia,
      isActive: (media) => media.some((item) => ['queued', 'running'].includes(item.recognitionStatus)),
      onUpdate,
      interval,
      maxAttempts,
      sleep
    });
  }

  return { poll, pollRecognition };
}));
