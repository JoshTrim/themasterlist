const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mkdtempSync, rmSync } = fs;
const { tmpdir } = require('node:os');
const { secureStorage } = require('../lib/storage-security');

test('private storage removes group and world access from existing archive files', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'master-list-permissions-'));
  const media = path.join(root, 'media');
  const backups = path.join(root, 'backups');
  fs.mkdirSync(media, { recursive: true });
  fs.mkdirSync(backups, { recursive: true });
  fs.writeFileSync(path.join(root, 'master-list.sqlite'), 'database', { mode: 0o644 });
  fs.writeFileSync(path.join(media, 'private.mp4'), 'media', { mode: 0o644 });
  fs.writeFileSync(path.join(backups, 'snapshot.sqlite'), 'backup', { mode: 0o644 });
  secureStorage({ fs, path, dataDir: root, mediaDir: media, backupDir: backups });
  assert.equal(fs.statSync(root).mode & 0o777, 0o700);
  assert.equal(fs.statSync(media).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(root, 'master-list.sqlite')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(media, 'private.mp4')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(backups, 'snapshot.sqlite')).mode & 0o777, 0o600);
  rmSync(root, { recursive: true, force: true });
});
