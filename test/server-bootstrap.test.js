const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const dataDir = mkdtempSync(path.join(tmpdir(), 'master-list-bootstrap-'));
process.env.MASTER_LIST_DATA_DIR = dataDir;
process.env.MASTER_LIST_SKIP_ENV = 'true';

const application = require('../server');

after(async () => {
  await application.ready;
  application.database.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('server composes without opening a listener or leaving undefined dependencies', async () => {
  await application.ready;
  assert.equal(typeof application.server.listen, 'function');
  assert.equal(application.server.listening, false);
  assert.ok(application.database.open);
});
