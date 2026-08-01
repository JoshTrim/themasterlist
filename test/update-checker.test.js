const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, createUpdateChecker, parseVersion } = require('../lib/update-checker');

describe('release update checker', () => {
  test('parses and compares semantic release versions', () => {
    assert.equal(parseVersion('v1.2.3').normalized, '1.2.3');
    assert.equal(compareVersions('0.2.1', '0.2.0'), 1);
    assert.equal(compareVersions('0.2.0', '0.2.0'), 0);
    assert.equal(compareVersions('0.2.0-rc.1', '0.2.0'), -1);
    assert.equal(parseVersion('latest'), null);
  });

  test('checks the fixed GitHub release endpoint and caches successful results', async () => {
    let requests = 0; let timestamp = Date.parse('2026-08-01T00:00:00Z');
    const check = createUpdateChecker({
      currentVersion: '0.2.0', now: () => timestamp,
      request: async (url, options) => {
        requests += 1;
        assert.equal(url, 'https://api.github.com/repos/JoshTrim/themasterlist/releases/latest');
        assert.equal(options.headers['User-Agent'], 'the-master-list/0.2.0');
        return { ok: true, json: async () => ({ tag_name: 'v0.3.0', published_at: '2026-08-02T00:00:00Z' }) };
      }
    });
    const first = await check();
    assert.equal(first.updateAvailable, true);
    assert.equal(first.latestVersion, '0.3.0');
    assert.equal(first.cached, false);
    timestamp += 1000;
    assert.equal((await check()).cached, true);
    assert.equal(requests, 1);
    await check({ refresh: true });
    assert.equal(requests, 2);
  });

  test('returns safe errors for unavailable or malformed releases', async () => {
    const unavailable = createUpdateChecker({ currentVersion: '0.2.0', request: async () => ({ ok: false, status: 404 }) });
    await assert.rejects(unavailable(), /No published release/);
    const malformed = createUpdateChecker({ currentVersion: '0.2.0', request: async () => ({ ok: true, json: async () => ({ tag_name: 'latest' }) }) });
    await assert.rejects(malformed(), /invalid release version/);
  });
});
