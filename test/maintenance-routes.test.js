const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMaintenanceRoutes } = require('../lib/routes/maintenance');

function harness({ account = { isAdmin: true }, body = {}, importError = null, chunkResult = { complete: false, offset: 4 } } = {}) {
  const replies = []; const values = []; let pruned = null; let exported = false; let imported = false; let chunked = false;
  const handle = createMaintenanceRoutes({
    requireAccount: () => account, readBody: async () => body,
    sendJson: (_response, status, payload, headers) => replies.push({ status, payload, headers }), sendError: (_response, status, error) => replies.push({ status, error }),
    status: async () => ({ ok: true }), diagnostics: async () => ({ format: 'the-master-list-diagnostics-v1' }), settings: () => ({ enabled: true }), setSetting: (...args) => values.push(args), pruneBackups: async (count) => { pruned = count; },
    createBackup: async () => ({ created: true }), manifest: async () => ({ format: 'manifest' }), integrity: async () => ({ healthy: true }), restore: async () => ({ staged: true }),
    exportInstance: async () => { exported = true; }, importInstance: async () => { imported = true; if (importError) throw importError; return { staged: true, restartRequired: true }; },
    importInstanceChunk: async () => { chunked = true; if (importError) throw importError; return chunkResult; }
  });
  return { handle, replies, values, pruned: () => pruned, exported: () => exported, imported: () => imported, chunked: () => chunked };
}

test('maintenance routes expose status and clamp backup settings', async () => {
  const state = harness({ body: { enabled: false, intervalHours: 0, retentionCount: 9999 } });
  assert.equal(await state.handle({ method: 'GET' }, {}, new URL('http://x/api/maintenance/status')), true);
  assert.deepEqual(state.replies[0], { status: 200, payload: { ok: true }, headers: undefined });
  await state.handle({ method: 'PATCH' }, {}, new URL('http://x/api/maintenance/backup-settings'));
  assert.deepEqual(state.values, [['backup_enabled', 'false'], ['backup_interval_hours', 24], ['backup_retention_count', 365]]);
  assert.equal(state.pruned(), 365);
});

test('maintenance routes provide owner-only downloadable diagnostics', async () => {
  const state = harness();
  await state.handle({ method: 'GET' }, {}, new URL('http://x/api/maintenance/diagnostics'));
  assert.equal(state.replies[0].status, 200);
  assert.equal(state.replies[0].payload.format, 'the-master-list-diagnostics-v1');
  assert.match(state.replies[0].headers['Content-Disposition'], /the-master-list-diagnostics-.*\.json/);
  const member = harness({ account: { isAdmin: false } });
  await member.handle({ method: 'GET' }, {}, new URL('http://x/api/maintenance/diagnostics'));
  assert.equal(member.replies[0].status, 403);
});

test('maintenance routes enforce owner actions and restore content types', async () => {
  const member = harness({ account: { isAdmin: false } });
  await member.handle({ method: 'POST' }, {}, new URL('http://x/api/maintenance/backup-now'));
  assert.equal(member.replies[0].status, 403);
  const restore = harness();
  await restore.handle({ method: 'POST', headers: { 'content-type': 'text/plain' } }, {}, new URL('http://x/api/maintenance/restore'));
  assert.equal(restore.replies[0].status, 415);
});

test('maintenance routes stream exports and stage validated instance imports for the owner', async () => {
  const state = harness();
  await state.handle({ method: 'GET' }, {}, new URL('http://x/api/maintenance/instance-export'));
  assert.equal(state.exported(), true);
  await state.handle({ method: 'POST', headers: { 'content-type': 'application/vnd.the-master-list.instance' } }, {}, new URL('http://x/api/maintenance/instance-import'));
  assert.equal(state.imported(), true);
  assert.equal(state.replies.at(-1).status, 202);
});

test('maintenance routes accept resumable instance chunks and report offsets', async () => {
  const state = harness({ chunkResult: { complete: false, offset: 4194304 } });
  await state.handle({ method: 'POST', headers: { 'content-type': 'application/octet-stream' } }, {}, new URL('http://x/api/maintenance/instance-import/chunk'));
  assert.equal(state.chunked(), true);
  assert.deepEqual(state.replies.at(-1), { status: 200, payload: { complete: false, offset: 4194304 }, headers: undefined });

  const conflict = harness({ chunkResult: { conflict: true, complete: false, offset: 12 } });
  await conflict.handle({ method: 'POST', headers: { 'content-type': 'application/octet-stream' } }, {}, new URL('http://x/api/maintenance/instance-import/chunk'));
  assert.equal(conflict.replies.at(-1).status, 409);
});

test('full instance transfer enforces ownership, content type, and upload status errors', async () => {
  const member = harness({ account: { isAdmin: false } });
  await member.handle({ method: 'GET' }, {}, new URL('http://x/api/maintenance/instance-export'));
  assert.equal(member.replies[0].status, 403);
  const invalid = harness();
  await invalid.handle({ method: 'POST', headers: { 'content-type': 'text/plain' } }, {}, new URL('http://x/api/maintenance/instance-import'));
  assert.equal(invalid.replies[0].status, 415);
  const tooLarge = new Error('Too large'); tooLarge.status = 413;
  const rejected = harness({ importError: tooLarge });
  await rejected.handle({ method: 'POST', headers: { 'content-type': 'application/octet-stream' } }, {}, new URL('http://x/api/maintenance/instance-import'));
  assert.equal(rejected.replies[0].status, 413);
});
