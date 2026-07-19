const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { usageDay, usageProvider, usageMeta, createApiUsage } = require('../lib/api-usage');

describe('API usage accounting', () => {
  test('uses the provider reset day in Pacific time', () => {
    assert.equal(usageDay(new Date('2026-07-19T05:00:00Z')), '2026-07-18');
    assert.equal(usageDay(new Date('2026-07-19T08:00:00Z')), '2026-07-19');
  });

  test('normalizes providers and assigns YouTube operation costs', () => {
    assert.equal(usageProvider('', 'https://api.spotify.com/v1/me'), 'spotify');
    assert.equal(usageProvider('AudD', 'https://example.test'), 'audd');
    assert.deepEqual(usageMeta('https://www.googleapis.com/youtube/v3/search?part=snippet', {}, 'youtube'), {
      service: 'youtube', operation: 'youtube.search', quotaUnits: 100
    });
    assert.equal(usageMeta('https://oauth2.googleapis.com/token', { method: 'POST' }, 'youtube').quotaUnits, 0);
    assert.equal(usageMeta('https://www.googleapis.com/youtube/v3/playlists', { method: 'POST' }, 'youtube').quotaUnits, 50);
  });

  test('records successful and failed provider requests without hiding upstream errors', async () => {
    const database = new Database(':memory:');
    migrateSchema(database);
    const responses = [
      { ok: true, status: 200, json: async () => ({ items: [] }) },
      { ok: false, status: 403, json: async () => ({ error: { message: 'quota exceeded' } }) }
    ];
    const usage = createApiUsage({
      database, now: () => new Date('2026-07-19T08:00:00Z'), request: async () => responses.shift()
    });
    assert.deepEqual(await usage.requestJson('https://www.googleapis.com/youtube/v3/search', {}, 'youtube'), { items: [] });
    await assert.rejects(usage.requestJson('https://www.googleapis.com/youtube/v3/playlists', { method: 'POST' }, 'youtube'), /youtube: quota exceeded/);
    const rows = database.prepare('SELECT provider, operation, quota_units AS units, status, usage_day AS day FROM api_usage ORDER BY id').all();
    assert.deepEqual(rows, [
      { provider: 'youtube', operation: 'youtube.search', units: 100, status: 200, day: '2026-07-19' },
      { provider: 'youtube', operation: 'youtube.playlists', units: 50, status: 403, day: '2026-07-19' }
    ]);
    database.close();
  });

  test('records network failures before rethrowing them', async () => {
    const database = new Database(':memory:');
    migrateSchema(database);
    const usage = createApiUsage({ database, request: async () => { throw new Error('offline'); } });
    await assert.rejects(usage.requestJson('https://api.audd.io/', { method: 'POST' }, 'audd'), /offline/);
    assert.deepEqual(database.prepare('SELECT provider, status FROM api_usage').get(), { provider: 'audd', status: null });
    database.close();
  });
});
