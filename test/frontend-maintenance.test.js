const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const maintenance = require('../public/lib/maintenance-page');

const escapeHtml = (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const formatBytes = (value = 0) => `${value} bytes`;
function classList() { const values = new Set(); return { add: (name) => values.add(name), remove: (name) => values.delete(name), toggle: (name, active) => active ? values.add(name) : values.delete(name), contains: (name) => values.has(name) }; }
function button() { return { disabled: false, textContent: '', addEventListener() {} }; }
function elementsFixture() {
  const submit = button();
  const scheduleForm = {
    elements: { enabled: { checked: false }, intervalHours: { value: '' }, retentionCount: { value: '' } },
    querySelector: () => submit, addEventListener() {}, submit
  };
  return {
    summary: { innerHTML: '' }, message: { textContent: '', classList: classList() }, integrityList: { innerHTML: '' }, cleanup: button(),
    scheduleForm, scheduleStatus: { textContent: '', classList: classList() }, backupNow: button(), refreshIntegrity: button(),
    restoreInput: { files: [] }, stageRestore: button(), downloadLink: { addEventListener() {} }
  };
}

const integrity = { healthy: false, summary: { records: 2, diskFiles: 3, diskBytes: 100 }, counts: { orphan: 1 }, issues: [{ type: 'orphan', title: '<Orphan>', detail: 'Unused', href: '/maintenance' }] };
const status = { databaseSize: 200, backupCount: 2, latestBackup: 'the-master-list-2026-07-19.sqlite', restorePending: false, backupSchedule: { enabled: true, intervalHours: 24, retentionCount: 7, lastBackupAt: null, lastStatus: 'ok' }, integrity };

describe('maintenance page', () => {
  test('renders escaped integrity details and normalized backup names', () => {
    assert.match(maintenance.integrityMarkup(integrity, { escapeHtml, formatBytes }), /&lt;Orphan&gt;/);
    const markup = maintenance.statusMarkup(status, { escapeHtml, formatBytes });
    assert.match(markup, />2026-07-19</);
    assert.doesNotMatch(markup, /the-master-list-/);
  });

  test('serializes the backup schedule without unrelated form data', () => {
    const elements = elementsFixture();
    elements.scheduleForm.elements.enabled.checked = true;
    elements.scheduleForm.elements.intervalHours.value = '12';
    elements.scheduleForm.elements.retentionCount.value = '5';
    assert.deepEqual(maintenance.backupSchedulePayload(elements.scheduleForm), { enabled: true, intervalHours: '12', retentionCount: '5' });
  });

  test('loads maintenance status, schedule and integrity state', async () => {
    const elements = elementsFixture();
    const controller = maintenance.createController({ page: 'maintenance', fetchJson: async () => status, escapeHtml, formatBytes, confirmAction: () => true, elements });
    await controller.render();
    assert.match(elements.summary.innerHTML, /200 bytes/);
    assert.equal(elements.scheduleForm.elements.enabled.checked, true);
    assert.equal(elements.scheduleForm.elements.intervalHours.value, 24);
    assert.equal(elements.cleanup.disabled, false);
    assert.match(elements.integrityList.innerHTML, /Orphan/);
  });

  test('saves schedule settings and restores the submit button', async () => {
    const elements = elementsFixture();
    const requests = [];
    const controller = maintenance.createController({ page: 'maintenance', escapeHtml, formatBytes, confirmAction: () => true, elements, fetchJson: async (url, options) => { requests.push([url, options]); return status; } });
    elements.scheduleForm.elements.enabled.checked = true;
    elements.scheduleForm.elements.intervalHours.value = '48';
    elements.scheduleForm.elements.retentionCount.value = '3';
    await controller.saveSchedule();
    assert.equal(requests[0][0], '/api/maintenance/backup-settings');
    assert.deepEqual(JSON.parse(requests[0][1].body), { enabled: true, intervalHours: '48', retentionCount: '3' });
    assert.equal(elements.scheduleForm.submit.disabled, false);
  });

  test('refuses restore without a file and stages a confirmed SQLite backup', async () => {
    const elements = elementsFixture();
    const requests = [];
    const controller = maintenance.createController({ page: 'maintenance', escapeHtml, formatBytes, confirmAction: () => true, elements, fetchJson: async (url, options) => { requests.push([url, options]); return url === '/api/maintenance/restore' ? { size: 500 } : status; } });
    await controller.stageDatabaseRestore();
    assert.equal(requests.length, 0);
    assert.equal(elements.message.textContent, 'Choose a SQLite backup first.');
    const file = { name: 'backup.sqlite' };
    elements.restoreInput.files = [file];
    await controller.stageDatabaseRestore();
    assert.equal(requests[0][0], '/api/maintenance/restore');
    assert.equal(requests[0][1].body, file);
    assert.equal(elements.stageRestore.disabled, false);
  });

  test('requires confirmation before deleting orphan files', async () => {
    const elements = elementsFixture();
    let requested = false;
    const controller = maintenance.createController({ page: 'maintenance', escapeHtml, formatBytes, confirmAction: () => false, elements, fetchJson: async () => { requested = true; return {}; } });
    await controller.cleanupOrphans();
    assert.equal(requested, false);
  });
});
