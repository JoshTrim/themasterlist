const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseEnv, loadEnvFile } = require('../lib/env');

describe('environment loading', () => {
  test('parses whitespace and quoted values while ignoring comments', () => {
    assert.deepEqual(parseEnv('PORT=3000\n SECRET = "value with spaces" \n# comment\nINVALID-key=no'), { PORT: '3000', SECRET: 'value with spaces' });
  });

  test('does not overwrite values already supplied by the process', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'master-list-env-'));
    const filename = path.join(directory, '.env');
    writeFileSync(filename, 'PORT=3000\nHOST=0.0.0.0\n');
    const target = { PORT: '4000' };
    loadEnvFile(filename, target);
    assert.deepEqual(target, { PORT: '4000', HOST: '0.0.0.0' });
    assert.deepEqual(loadEnvFile(path.join(directory, 'missing'), target), {});
    rmSync(directory, { recursive: true, force: true });
  });
});
