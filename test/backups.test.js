const { afterEach, beforeEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('node:fs/promises');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBackupService } = require('../lib/backups');

describe('scheduled backup service', () => {
  let database;
  let directory;
  let values;
  let tick;
  let service;

  beforeEach(() => {
    database = new Database(':memory:');
    database.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records (value) VALUES (\'archive\')');
    directory = mkdtempSync(path.join(os.tmpdir(), 'master-list-backups-'));
    values = new Map([['backup_enabled', 'true'], ['backup_interval_hours', '24'], ['backup_retention_count', '2'], ['backup_last_status', 'never']]);
    tick = Date.parse('2026-07-18T00:00:00Z');
    service = createBackupService({ database, fs, path, backupDir: directory, getSetting: (key, fallback = null) => values.has(key) ? values.get(key) : fallback, setSetting: (key, value) => values.set(key, String(value)), now: () => new Date(tick), logger: {} });
  });

  afterEach(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });

  test('creates consistent SQLite snapshots and reports the latest status', async () => {
    const result = await service.create({ force: true });
    assert.match(result.filename, /^scheduled-.*\.sqlite$/);
    const snapshot = new Database(path.join(directory, result.filename), { readonly: true });
    assert.equal(snapshot.prepare('SELECT value FROM records').pluck().get(), 'archive');
    snapshot.close();
    assert.equal(service.settings().lastStatus, 'success');
    assert.equal(service.settings().lastBackupAt, '2026-07-18T00:00:00.000Z');
  });

  test('skips disabled and not-yet-due schedules unless forced', async () => {
    values.set('backup_enabled', 'false');
    assert.deepEqual(await service.create(), { skipped: true, reason: 'disabled' });
    await service.create({ force: true });
    values.set('backup_enabled', 'true');
    tick += 60 * 60 * 1000;
    assert.deepEqual(await service.create(), { skipped: true, reason: 'not-due' });
  });

  test('retains only the newest configured scheduled snapshots', async () => {
    for (let index = 0; index < 4; index += 1) { await service.create({ force: true }); tick += 1000; }
    const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sqlite'));
    assert.equal(files.length, 2);
    assert.ok(files.every((name) => name.startsWith('scheduled-')));
  });
});
