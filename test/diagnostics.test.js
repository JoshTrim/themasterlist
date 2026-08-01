const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createDiagnosticLog, createDiagnostics } = require('../lib/diagnostics');

describe('privacy-safe diagnostics', () => {
  test('reports useful runtime and archive state without values, paths or personal records', async () => {
    const database = new Database(':memory:');
    migrateSchema(database);
    database.prepare("INSERT INTO gigs (id, artist, venue, city, date, songs, created_at, shared_id) VALUES ('gig', 'Private Artist', 'Private Venue', 'Private City', '2026-01-01', '[]', 'now', 'shared')").run();
    const log = createDiagnosticLog({ now: () => new Date('2026-08-01T00:00:00Z') });
    log.record('request', { code: 'SQLITE_BUSY', status: 500, message: '/Users/private/archive.sqlite is locked' });
    const report = await createDiagnostics({
      database, recentErrors: log, appVersion: '0.2.0', now: () => new Date('2026-08-01T01:00:00Z'),
      runtime: { version: 'v24.16.0', platform: 'linux', arch: 'arm64', uptime: () => 42.4 },
      env: { NODE_ENV: 'production', APP_ORIGIN: 'https://private.example', SETLIST_FM_API_KEY: 'secret-key', SPOTIFY_CLIENT_ID: 'client', SPOTIFY_CLIENT_SECRET: 'secret' },
      status: async () => ({ databaseSize: 4096, mediaWritable: true, backupCount: 2, secureCookies: true, backupSchedule: { enabled: true }, restorePending: false, instanceImportPending: null, integrity: { healthy: true, summary: { diskFiles: 1, diskBytes: 123 }, counts: {} } })
    })();
    assert.equal(report.application.architecture, 'arm64');
    assert.equal(report.archive.shows, 1);
    assert.equal(report.configuration.integrations.spotify, true);
    assert.equal(report.storage.mediaWritable, true);
    assert.deepEqual(report.recentErrors, [{ at: '2026-08-01T00:00:00.000Z', area: 'request', code: 'SQLITE_BUSY', status: 500 }]);
    const serialized = JSON.stringify(report);
    for (const privateValue of ['Private Artist', 'Private Venue', 'Private City', 'private.example', 'secret-key', 'client', 'secret', '/Users/private']) assert.equal(serialized.includes(privateValue), false, privateValue);
    database.close();
  });

  test('sanitizes arbitrary error areas and codes and retains only the newest entries', () => {
    let minute = 0;
    const log = createDiagnosticLog({ limit: 2, now: () => new Date(`2026-08-01T00:0${minute++}:00Z`) });
    log.record('request', { code: 'FIRST', status: 500 });
    log.record('/private/show/id', { code: '/private/path', status: 503 });
    log.record('backup', { code: 'THIRD', status: 400 });
    assert.deepEqual(log.entries().map(({ area, code, status }) => ({ area, code, status })), [
      { area: 'backup', code: 'THIRD', status: 400 },
      { area: 'application', code: 'SERVER_ERROR', status: 503 }
    ]);
  });
});
