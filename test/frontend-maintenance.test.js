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
  const storageSubmit = button();
  const storageSettingsForm = { elements: { warningPercent: { value: '' } }, querySelector: () => storageSubmit, addEventListener() {}, submit: storageSubmit };
  return {
    summary: { innerHTML: '' }, message: { textContent: '', classList: classList() }, integrityList: { innerHTML: '' }, cleanup: button(),
    updateStatus: { innerHTML: '' }, checkUpdates: button(), deployment: { innerHTML: '' }, integrityDisclosure: { open: false },
    storageOverview: { innerHTML: '' }, storageSettingsForm, storageDisclosure: { open: false }, removePlaybackCopies: button(), regeneratePlaybackCopies: button(),
    scheduleForm, scheduleStatus: { textContent: '', classList: classList() }, backupNow: button(), refreshIntegrity: button(),
    restoreInput: { files: [] }, stageRestore: button(), downloadLink: { addEventListener() {} },
    exportArchive: button(), importArchive: { files: [], value: '', addEventListener() {} },
    exportInstance: { addEventListener() {} }, importInstance: { files: [], value: '', addEventListener() {} },
    stageInstanceImport: button(), transferStatus: { textContent: '', classList: classList() }
  };
}

const integrity = { healthy: false, summary: { records: 2, diskFiles: 3, diskBytes: 100 }, counts: { orphan: 1 }, issues: [{ type: 'orphan', title: '<Orphan>', detail: 'Unused', href: '/maintenance' }] };
const storage = { usedBytes: 100, quotaBytes: 1000, usedPercent: 10, warningPercent: 85, originals: 60, artifacts: 10, playbackCopies: 20, cutouts: 0, profileImages: 4, orphaned: 6, databaseFile: '/data/master-list.sqlite', mediaDirectory: '/media', largestFiles: [{ filename: 'clip.mp4', title: 'Artist · Venue', bytes: 60, href: '/edit?id=gig' }], largestShows: [{ gigId: 'gig', artist: 'Artist', venue: 'Venue', date: '2026-01-01', bytes: 90, href: '/edit?id=gig' }] };
const status = { appVersion: '0.2.0', appOrigin: 'https://archive.example', secureCookies: true, originCookieMismatch: false, schemaMigration: { previousVersion: 0, version: 1, migrated: true }, databaseSize: 200, backupCount: 2, latestBackup: 'the-master-list-2026-07-19.sqlite', restorePending: false, backupSchedule: { enabled: true, intervalHours: 24, retentionCount: 7, lastBackupAt: null, lastStatus: 'ok' }, storage, integrity };
const update = { installedVersion: '0.2.0', latestVersion: '0.3.0', updateAvailable: true, checkedAt: '2026-08-01T00:00:00Z' };

describe('maintenance page', () => {
  test('renders compact archive status and detailed deployment facts', () => {
    assert.match(maintenance.integrityMarkup(integrity, { escapeHtml, formatBytes }), /&lt;Orphan&gt;/);
    const markup = maintenance.statusMarkup(status, { escapeHtml, formatBytes });
    assert.match(markup, /v0\.2\.0/);
    assert.match(markup, /Archive needs attention/);
    assert.doesNotMatch(markup, /https:\/\/archive\.example/);
    const deployment = maintenance.deploymentMarkup(status, { escapeHtml });
    assert.match(deployment, /https:\/\/archive\.example/);
    assert.match(deployment, />2026-07-19</);
    assert.doesNotMatch(deployment, /the-master-list-/);
    assert.match(maintenance.statusMarkup({ ...status, instanceImportPending: { stagedAt: 'now' } }, { escapeHtml, formatBytes }), /Full instance import staged/);
    assert.match(maintenance.statusMarkup({ ...status, storage: { ...storage, warning: true } }, { escapeHtml, formatBytes }), /Media storage warning/);
    const storageHtml = maintenance.storageMarkup(storage, { escapeHtml, formatBytes });
    assert.match(storageHtml, /Original media/);
    assert.match(storageHtml, /Largest files/);
    assert.match(storageHtml, /Artist/);
    assert.match(storageHtml, /\/data\/master-list\.sqlite/);
  });

  test('renders update, migration and backup readiness without trusting release URLs', () => {
    const markup = maintenance.updateStatusMarkup(update, status, { escapeHtml });
    assert.match(markup, /v0\.3\.0/);
    assert.match(markup, /Update available/);
    assert.match(markup, /Migration applied at this startup/);
    assert.match(markup, /Backup available/);
    assert.match(markup, /github\.com\/JoshTrim\/themasterlist\/releases\/latest/);
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
    const controller = maintenance.createController({ page: 'maintenance', fetchJson: async (url) => url.includes('update-status') ? update : status, escapeHtml, formatBytes, confirmAction: () => true, elements });
    await controller.render();
    assert.match(elements.summary.innerHTML, /200 bytes/);
    assert.equal(elements.scheduleForm.elements.enabled.checked, true);
    assert.equal(elements.scheduleForm.elements.intervalHours.value, 24);
    assert.equal(elements.cleanup.disabled, false);
    assert.match(elements.integrityList.innerHTML, /Orphan/);
    assert.match(elements.updateStatus.innerHTML, /Update available/);
    assert.match(elements.deployment.innerHTML, /archive\.example/);
    assert.match(elements.storageOverview.innerHTML, /clip\.mp4/);
    assert.equal(elements.storageSettingsForm.elements.warningPercent.value, 85);
  });

  test('saves storage thresholds and safely manages replaceable playback copies', async () => {
    const elements = elementsFixture(); const requests = [];
    const controller = maintenance.createController({
      page: 'maintenance', escapeHtml, formatBytes, confirmAction: () => true, elements,
      fetchJson: async (url, options) => { requests.push([url, options]); if (url.endsWith('/remove')) return { removed: 2, bytesFreed: 100, skipped: 0 }; if (url.endsWith('/regenerate')) return { queued: 3, missingOriginals: 1 }; return status; }
    });
    elements.storageSettingsForm.elements.warningPercent.value = '90';
    await controller.saveStorageSettings();
    await controller.removeDerivedPlaybackCopies();
    await controller.regenerateMissingPlaybackCopies();
    assert.equal(requests[0][0], '/api/maintenance/storage-settings');
    assert.deepEqual(JSON.parse(requests[0][1].body), { warningPercent: '90' });
    assert.ok(requests.some(([url]) => url === '/api/maintenance/playback-copies/remove'));
    assert.ok(requests.some(([url]) => url === '/api/maintenance/playback-copies/regenerate'));
    assert.match(elements.message.textContent, /Queued 3 playback copies/);
  });

  test('opens the integrity disclosure when a fresh check runs', async () => {
    const elements = elementsFixture();
    const controller = maintenance.createController({ page: 'maintenance', fetchJson: async () => integrity, escapeHtml, formatBytes, confirmAction: () => true, elements });
    await controller.checkIntegrity();
    assert.equal(elements.integrityDisclosure.open, true);
    assert.equal(elements.refreshIntegrity.disabled, false);
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
    assert.equal(elements.transferStatus.textContent, 'Full instance import staged (1000 bytes). Restart the server to apply it, then sign in with the source account.');
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
