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
    restoreInput: { files: [] }, stageRestore: button(), downloadLink: { addEventListener() {} },
    exportArchive: button(), importArchive: { files: [], value: '', addEventListener() {} },
    exportInstance: { addEventListener() {} }, importInstance: { files: [], value: '', addEventListener() {} },
    stageInstanceImport: button(), transferStatus: { textContent: '', classList: classList() }
  };
}

const integrity = { healthy: false, summary: { records: 2, diskFiles: 3, diskBytes: 100 }, counts: { orphan: 1 }, issues: [{ type: 'orphan', title: '<Orphan>', detail: 'Unused', href: '/maintenance' }] };
const status = { appVersion: '0.1.0', appOrigin: 'https://archive.example', secureCookies: true, originCookieMismatch: false, databaseSize: 200, backupCount: 2, latestBackup: 'the-master-list-2026-07-19.sqlite', restorePending: false, backupSchedule: { enabled: true, intervalHours: 24, retentionCount: 7, lastBackupAt: null, lastStatus: 'ok' }, integrity };

describe('maintenance page', () => {
  test('renders escaped integrity details and normalized backup names', () => {
    assert.match(maintenance.integrityMarkup(integrity, { escapeHtml, formatBytes }), /&lt;Orphan&gt;/);
    const markup = maintenance.statusMarkup(status, { escapeHtml, formatBytes });
    assert.match(markup, />2026-07-19</);
    assert.doesNotMatch(markup, /the-master-list-/);
    assert.match(markup, /v0\.1\.0/);
    assert.match(markup, /https:\/\/archive\.example/);
    assert.match(maintenance.statusMarkup({ ...status, instanceImportPending: { stagedAt: 'now' } }, { escapeHtml, formatBytes }), /Full instance import staged/);
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

  test('exports a dated JSON archive through a temporary download', async () => {
    const elements = elementsFixture();
    const link = { href: '', download: '', clicked: false, click() { this.clicked = true; } };
    let revoked = '';
    class BlobStub { constructor(parts, options) { this.parts = parts; this.options = options; } }
    const controller = maintenance.createController({
      page: 'maintenance', escapeHtml, formatBytes, confirmAction: () => true, elements,
      fetchJson: async () => ({ gigs: [{ id: 'g1' }] }), document: { createElement: () => link }, BlobClass: BlobStub,
      URLApi: { createObjectURL: () => 'blob:archive', revokeObjectURL: (value) => { revoked = value; } },
      now: () => new Date('2026-07-19T00:00:00Z')
    });
    await controller.exportShowsArchive();
    assert.equal(link.download, 'the-master-list-export-2026-07-19.json');
    assert.equal(link.clicked, true);
    assert.equal(revoked, 'blob:archive');
    assert.equal(elements.message.textContent, 'Shows JSON exported.');
  });

  test('imports a selected JSON archive and reloads after persistence', async () => {
    const elements = elementsFixture();
    elements.importArchive.files = [{ text: async () => JSON.stringify({ gigs: [{ id: 'g1' }, { id: 'g2' }] }) }];
    elements.importArchive.value = 'archive.json';
    let request;
    let reloaded = false;
    const controller = maintenance.createController({
      page: 'maintenance', escapeHtml, formatBytes, confirmAction: () => true, elements,
      fetchJson: async (url, options) => { request = [url, options]; return {}; }, reload: () => { reloaded = true; }
    });
    await controller.importShowsArchive();
    assert.equal(request[0], '/api/archive/import');
    assert.equal(JSON.parse(request[1].body).gigs.length, 2);
    assert.equal(elements.message.textContent, 'Imported 2 shows. Reloading…');
    assert.equal(elements.importArchive.value, '');
    assert.equal(reloaded, true);
  });

  test('uploads a full instance bundle with progress and reports restart requirement', async () => {
    const elements = elementsFixture();
    const file = { name: 'archive.tml-instance', size: 1000, slice: (start, end) => ({ start, end, size: end - start }) };
    elements.importInstance.files = [file]; elements.importInstance.value = 'archive.tml-instance';
    const requests = [];
    class XhrStub {
      constructor() { this.upload = {}; this.headers = {}; }
      open(method, url) { this.method = method; this.url = url; }
      setRequestHeader(name, value) { this.headers[name] = value; }
      send(body) {
        this.body = body; requests.push(this);
        this.status = body.end === file.size ? 202 : 200;
        this.responseText = JSON.stringify({ complete: body.end === file.size, offset: body.end, bytes: file.size });
        this.upload.onprogress({ lengthComputable: true, loaded: body.size, total: body.size }); this.onload();
      }
    }
    const controller = maintenance.createController({
      page: 'maintenance', escapeHtml, formatBytes, confirmAction: () => true, elements,
      XMLHttpRequestClass: XhrStub, fetchJson: async () => status, instanceChunkSize: 400, createUploadId: () => 'test-upload-id'
    });
    await controller.stageFullInstanceImport();
    assert.equal(requests.length, 3);
    assert.equal(requests[1].headers['X-Upload-Offset'], '400');
    assert.equal(requests[2].url, '/api/maintenance/instance-import/chunk');
    assert.equal(elements.transferStatus.textContent, 'Full instance import staged (1000 bytes). Restart the server to apply it.');
    assert.equal(elements.importInstance.value, '');
    assert.equal(elements.stageInstanceImport.disabled, false);
  });

  test('retries an interrupted instance chunk and resumes from the server offset', async () => {
    const elements = elementsFixture();
    const file = { name: 'large.tml-instance', size: 800, slice: (start, end) => ({ start, end, size: end - start }) };
    let requestCount = 0;
    class XhrStub {
      constructor() { this.upload = {}; this.headers = {}; }
      open() {}
      setRequestHeader(name, value) { this.headers[name] = value; }
      send(body) {
        requestCount += 1;
        if (requestCount === 1) { this.onerror(); return; }
        this.status = body.end === file.size ? 202 : 200;
        this.responseText = JSON.stringify({ complete: body.end === file.size, offset: body.end, bytes: file.size });
        this.upload.onprogress({ lengthComputable: true, loaded: body.size, total: body.size });
        this.onload();
      }
    }
    const controller = maintenance.createController({
      page: 'maintenance', escapeHtml, formatBytes, confirmAction: () => true, elements,
      XMLHttpRequestClass: XhrStub, fetchJson: async () => status, instanceChunkSize: 400,
      createUploadId: () => 'retry-upload-id', setTimeoutFn: (callback) => callback()
    });
    const result = await controller.uploadInstanceBundle(file);
    assert.equal(result.complete, true);
    assert.equal(requestCount, 3);
  });
});
