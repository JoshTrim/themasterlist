const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMaintenanceRoutes } = require('../lib/routes/maintenance');

function harness({ account = { isAdmin: true }, body = {} } = {}) {
  const replies = []; const values = []; let pruned = null;
  const handle = createMaintenanceRoutes({
    requireAccount: () => account, readBody: async () => body,
    sendJson: (_response, status, payload, headers) => replies.push({ status, payload, headers }), sendError: (_response, status, error) => replies.push({ status, error }),
    status: async () => ({ ok: true }), settings: () => ({ enabled: true }), setSetting: (...args) => values.push(args), pruneBackups: async (count) => { pruned = count; },
    createBackup: async () => ({ created: true }), manifest: async () => ({ format: 'manifest' }), integrity: async () => ({ healthy: true }), restore: async () => ({ staged: true })
  });
  return { handle, replies, values, pruned: () => pruned };
}

test('maintenance routes expose status and clamp backup settings', async () => {
  const state = harness({ body: { enabled: false, intervalHours: 0, retentionCount: 9999 } });
  assert.equal(await state.handle({ method: 'GET' }, {}, new URL('http://x/api/maintenance/status')), true);
  assert.deepEqual(state.replies[0], { status: 200, payload: { ok: true }, headers: undefined });
  await state.handle({ method: 'PATCH' }, {}, new URL('http://x/api/maintenance/backup-settings'));
  assert.deepEqual(state.values, [['backup_enabled', 'false'], ['backup_interval_hours', 24], ['backup_retention_count', 365]]);
  assert.equal(state.pruned(), 365);
});

test('maintenance routes enforce owner actions and restore content types', async () => {
  const member = harness({ account: { isAdmin: false } });
  await member.handle({ method: 'POST' }, {}, new URL('http://x/api/maintenance/backup-now'));
  assert.equal(member.replies[0].status, 403);
  const restore = harness();
  await restore.handle({ method: 'POST', headers: { 'content-type': 'text/plain' } }, {}, new URL('http://x/api/maintenance/restore'));
  assert.equal(restore.replies[0].status, 415);
});
