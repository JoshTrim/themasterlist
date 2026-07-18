'use strict';

function createBackupService({ database, fs, path, backupDir, getSetting, setSetting, now = () => new Date(), logger = console }) {
  let running = false;

  function settings() {
    return {
      enabled: getSetting('backup_enabled', 'true') === 'true',
      intervalHours: Math.max(1, Number(getSetting('backup_interval_hours', '24')) || 24),
      retentionCount: Math.max(1, Number(getSetting('backup_retention_count', '14')) || 14),
      lastBackupAt: getSetting('backup_last_at'),
      lastStatus: getSetting('backup_last_status', 'never'),
      lastError: getSetting('backup_last_error') || null
    };
  }

  async function prune(retentionCount) {
    await fs.mkdir(backupDir, { recursive: true });
    const files = (await fs.readdir(backupDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^scheduled-.*\.sqlite$/.test(entry.name))
      .map((entry) => entry.name).sort().reverse();
    for (const filename of files.slice(retentionCount)) await fs.rm(path.join(backupDir, filename), { force: true });
    return Math.min(files.length, retentionCount);
  }

  async function create({ force = false } = {}) {
    const current = settings();
    if ((!current.enabled && !force) || running) return { skipped: true, reason: running ? 'running' : 'disabled' };
    const lastTime = Date.parse(current.lastBackupAt || '');
    if (!force && Number.isFinite(lastTime) && now().getTime() - lastTime < current.intervalHours * 60 * 60 * 1000) return { skipped: true, reason: 'not-due' };
    running = true;
    try {
      await fs.mkdir(backupDir, { recursive: true });
      const timestamp = now().toISOString();
      const filename = `scheduled-${timestamp.replace(/[:.]/g, '-')}.sqlite`;
      await database.backup(path.join(backupDir, filename));
      await prune(current.retentionCount);
      setSetting('backup_last_at', timestamp);
      setSetting('backup_last_status', 'success');
      setSetting('backup_last_error', '');
      logger.log?.(`[maintenance] scheduled database backup created: ${filename}`);
      return { ok: true, filename, createdAt: timestamp };
    } catch (error) {
      setSetting('backup_last_status', 'error');
      setSetting('backup_last_error', error.message);
      logger.error?.('[maintenance] scheduled database backup failed:', error.message);
      throw error;
    } finally { running = false; }
  }

  async function runCheck() {
    try { return await create(); } catch { return { ok: false, error: settings().lastError }; }
  }

  return { settings, prune, create, runCheck };
}

module.exports = { createBackupService };
