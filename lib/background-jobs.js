function createBackgroundJobs({ database, now = () => new Date().toISOString() }) {
  const activeProcesses = new Map();

  function row(id) {
    return database.prepare('SELECT id, type, name, status, progress, error FROM background_jobs WHERE id = ?').get(id) || null;
  }

  function save(id, type, name, status, progress = 0, error = null) {
    const existing = row(id);
    if (existing?.status === 'cancelled' && status !== 'cancelled') return existing;
    const timestamp = now();
    const normalizedProgress = Math.max(0, Math.min(100, Number(progress) || 0));
    database.prepare(`INSERT INTO background_jobs
      (id, type, name, status, progress, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET type=excluded.type, name=excluded.name,
        status=excluded.status, progress=excluded.progress, error=excluded.error,
        updated_at=excluded.updated_at`).run(id, type, name, status, normalizedProgress, error, timestamp, timestamp);
    if (!['queued', 'running'].includes(status)) activeProcesses.delete(id);
    return row(id);
  }

  function listActive() {
    return database.prepare("SELECT id, type, name, status, progress, error FROM background_jobs WHERE status IN ('running', 'queued') ORDER BY created_at").all();
  }

  function attach(id, childProcess) {
    if (!childProcess || typeof childProcess.kill !== 'function') return;
    activeProcesses.set(id, childProcess);
    const detach = () => {
      if (activeProcesses.get(id) === childProcess) activeProcesses.delete(id);
    };
    childProcess.once?.('close', detach);
    childProcess.once?.('error', detach);
  }

  function cancel(id) {
    const job = row(id);
    if (!job) return null;
    if (!['queued', 'running'].includes(job.status)) return job;
    const childProcess = activeProcesses.get(id);
    if (childProcess) {
      try { childProcess.kill('SIGTERM'); } catch { /* process may already have exited */ }
    }
    return save(id, job.type, job.name, 'cancelled', job.progress, null);
  }

  return { save, get: row, listActive, attach, cancel };
}

module.exports = { createBackgroundJobs };
