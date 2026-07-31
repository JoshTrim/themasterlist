(function exposeMaintenancePage(root, factory) {
  const maintenancePage = factory();
  if (typeof module === 'object' && module.exports) module.exports = maintenancePage;
  else root.MasterListMaintenancePage = maintenancePage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMaintenancePageModule() {
  function integrityMarkup(data, { escapeHtml, formatBytes }) {
    const summary = data.summary || {};
    const heading = `<div class="integrity-summary"><article class="${data.healthy ? 'is-healthy' : ''}"><strong>${data.healthy ? '✓' : data.issues.length}</strong><span>${data.healthy ? 'Archive healthy' : 'Issues found'}</span></article><article><strong>${summary.records || 0}</strong><span>Media records</span></article><article><strong>${summary.diskFiles || 0}</strong><span>Files on disk</span></article><article><strong>${formatBytes(summary.diskBytes)}</strong><span>Media storage</span></article></div>`;
    const issues = data.issues?.length ? `<div class="integrity-issues">${data.issues.map((issue) => `<article class="integrity-issue integrity-${escapeHtml(issue.type)}"><span>${escapeHtml(issue.type)}</span><div><strong>${escapeHtml(issue.title)}</strong><p>${escapeHtml(issue.detail)}</p></div>${issue.href ? `<a class="text-button" href="${escapeHtml(issue.href)}">Open</a>` : ''}</article>`).join('')}</div>` : '<div class="empty-state">SQLite and all referenced files passed the integrity check.</div>';
    return heading + issues;
  }

  function statusMarkup(data, { escapeHtml, formatBytes }) {
    const backup = data.latestBackup ? escapeHtml(data.latestBackup.replace(/^the-master-list-|^pre-restore-/, '').replace(/\.sqlite$/, '')) : '—';
    const pending = data.instanceImportPending || data.restorePending;
    const pendingLabel = data.instanceImportPending ? 'Full instance import staged — restart required' : data.restorePending ? 'Database restore staged — restart required' : 'No restore pending';
    const origin = escapeHtml(data.appOrigin || '—');
    const imported = data.lastInstanceImport?.summary;
    const importedCard = data.lastInstanceImport
      ? `<article class="is-healthy"><strong>${imported ? `${imported.gigs || 0} / ${imported.media || 0}` : '✓'}</strong><span>Last full import${imported ? ' · shows / media' : ''}</span></article>`
      : '';
    return `<article><strong>v${escapeHtml(data.appVersion || '—')}</strong><span>Running version</span></article><article class="${data.originCookieMismatch ? 'has-warning' : ''}"><strong title="${origin}">${origin}</strong><span>Trusted browser origin · ${data.secureCookies ? 'secure cookies' : 'standard cookies'}</span></article><article><strong>${formatBytes(data.databaseSize)}</strong><span>Database size</span></article><article><strong>${data.backupCount}</strong><span>Saved database backups</span></article><article><strong>${backup}</strong><span>Latest backup</span></article><article class="${pending ? 'has-warning' : ''}"><strong>${pending ? '!' : '✓'}</strong><span>${pendingLabel}</span></article>${importedCard}`;
  }

  function backupSchedulePayload(form) {
    return { enabled: form.elements.enabled.checked, intervalHours: form.elements.intervalHours.value, retentionCount: form.elements.retentionCount.value };
  }

  function createController({ page, fetchJson, escapeHtml, formatBytes, confirmAction, setTimeoutFn = globalThis.setTimeout, document, BlobClass = globalThis.Blob, URLApi = globalThis.URL, XMLHttpRequestClass = globalThis.XMLHttpRequest, createUploadId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`, instanceChunkSize = 4 * 1024 * 1024, now = () => new Date(), reload = () => globalThis.location.reload(), elements }) {
    const { summary, message, integrityList, cleanup, scheduleForm, scheduleStatus, backupNow, refreshIntegrity, restoreInput, stageRestore, downloadLink, exportArchive, importArchive, exportInstance, importInstance, stageInstanceImport, transferStatus } = elements;

    function renderIntegrity(data) {
      if (!integrityList) return;
      integrityList.innerHTML = integrityMarkup(data, { escapeHtml, formatBytes });
      cleanup.disabled = !data.counts?.orphan;
    }

    function renderStatus(data) {
      if (!summary) return;
      summary.innerHTML = statusMarkup(data, { escapeHtml, formatBytes });
      if (scheduleForm && data.backupSchedule) {
        scheduleForm.elements.enabled.checked = Boolean(data.backupSchedule.enabled);
        scheduleForm.elements.intervalHours.value = data.backupSchedule.intervalHours;
        scheduleForm.elements.retentionCount.value = data.backupSchedule.retentionCount;
        const last = data.backupSchedule.lastBackupAt ? new Date(data.backupSchedule.lastBackupAt).toLocaleString() : 'Never';
        scheduleStatus.textContent = data.backupSchedule.lastStatus === 'error' ? `Last backup failed: ${data.backupSchedule.lastError || 'Unknown error'}` : `Last scheduled backup: ${last}`;
        scheduleStatus.classList.toggle('error', data.backupSchedule.lastStatus === 'error');
      }
      renderIntegrity(data.integrity);
    }

    async function render() {
      if (page !== 'maintenance' || !summary) return;
      try { renderStatus(await fetchJson('/api/maintenance/status')); message.classList.remove('error'); }
      catch (error) { message.textContent = error.message; message.classList.add('error'); }
    }

    async function saveSchedule() {
      const button = scheduleForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await fetchJson('/api/maintenance/backup-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backupSchedulePayload(scheduleForm)) });
        message.textContent = 'Backup schedule saved.';
        message.classList.remove('error');
        await render();
      } catch (error) { message.textContent = error.message; message.classList.add('error'); }
      finally { button.disabled = false; }
    }

    async function createBackup() {
      backupNow.disabled = true;
      backupNow.textContent = 'Backing up…';
      try {
        await fetchJson('/api/maintenance/backup-now', { method: 'POST' });
        message.textContent = 'Database snapshot created.';
        message.classList.remove('error');
        await render();
      } catch (error) { message.textContent = error.message; message.classList.add('error'); }
      finally { backupNow.disabled = false; backupNow.textContent = 'Back up now'; }
    }

    async function checkIntegrity() {
      refreshIntegrity.disabled = true;
      refreshIntegrity.textContent = 'Checking…';
      message.textContent = 'Scanning database and media files…';
      message.classList.remove('error');
      try { renderIntegrity(await fetchJson('/api/maintenance/integrity')); message.textContent = 'Integrity check complete.'; }
      catch (error) { message.textContent = error.message; message.classList.add('error'); }
      finally { refreshIntegrity.disabled = false; refreshIntegrity.textContent = 'Run check'; }
    }

    async function stageDatabaseRestore() {
      const file = restoreInput.files?.[0];
      if (!file) { message.textContent = 'Choose a SQLite backup first.'; message.classList.add('error'); return; }
      if (!confirmAction('Stage this database for restore? It will replace the live database the next time the server starts.')) return;
      stageRestore.disabled = true;
      message.classList.remove('error');
      message.textContent = `Validating ${file.name}…`;
      try {
        const result = await fetchJson('/api/maintenance/restore', { method: 'POST', headers: { 'Content-Type': 'application/vnd.sqlite3' }, body: file });
        message.textContent = `Restore staged (${formatBytes(result.size)}). Restart the server to apply it.`;
        await render();
      } catch (error) { message.textContent = error.message; message.classList.add('error'); }
      finally { stageRestore.disabled = false; }
    }

    async function cleanupOrphans() {
      if (!confirmAction('Permanently delete files that are not referenced by any show or profile?')) return;
      cleanup.disabled = true;
      try {
        const result = await fetchJson('/api/media/cleanup', { method: 'POST' });
        message.textContent = `Removed ${result.removed} orphan file${result.removed === 1 ? '' : 's'}.`;
        await render();
      } catch (error) { message.textContent = error.message; message.classList.add('error'); }
      finally { cleanup.disabled = false; }
    }

    async function exportShowsArchive() {
      try {
        const data = await fetchJson('/api/archive/export');
        const blob = new BlobClass([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URLApi.createObjectURL(blob);
        link.download = `the-master-list-export-${now().toISOString().slice(0, 10)}.json`;
        link.click();
        URLApi.revokeObjectURL(link.href);
        message.textContent = 'Shows JSON exported.';
        message.classList.remove('error');
      } catch (error) { message.textContent = error.message; message.classList.add('error'); }
    }

    async function importShowsArchive() {
      const file = importArchive.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        await fetchJson('/api/archive/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        message.textContent = `Imported ${data.gigs?.length || 0} shows. Reloading…`;
        message.classList.remove('error');
        reload();
      } catch (error) { message.textContent = error.message; message.classList.add('error'); }
      finally { importArchive.value = ''; }
    }

    function uploadInstanceChunk(file, uploadId, offset) {
      return new Promise((resolve, reject) => {
        const end = Math.min(offset + instanceChunkSize, file.size);
        const chunk = file.slice(offset, end);
        const xhr = new XMLHttpRequestClass();
        xhr.open('POST', '/api/maintenance/instance-import/chunk');
        xhr.timeout = 10 * 60 * 1000;
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('X-Upload-Id', uploadId);
        xhr.setRequestHeader('X-Upload-Offset', String(offset));
        xhr.setRequestHeader('X-Upload-Total', String(file.size));
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) { transferStatus.textContent = `Uploading ${file.name}…`; return; }
          const uploaded = Math.min(file.size, offset + event.loaded);
          const percent = Math.round((uploaded / file.size) * 100);
          transferStatus.textContent = percent === 100 ? `Validating ${file.name}…` : `Uploading ${file.name}… ${percent}%`;
        };
        xhr.onload = () => {
          let payload = {};
          try { payload = JSON.parse(xhr.responseText || '{}'); } catch { /* handled below */ }
          resolve({ status: xhr.status, payload });
        };
        xhr.onerror = () => reject(new Error('The instance upload was interrupted.'));
        xhr.ontimeout = () => reject(new Error('The instance upload chunk timed out.'));
        xhr.send(chunk);
      });
    }

    async function uploadInstanceBundle(file) {
      const uploadId = createUploadId().replaceAll(/[^A-Za-z0-9_-]/g, '').slice(0, 128).padEnd(8, '0');
      let offset = 0;
      let attempts = 0;
      while (offset < file.size) {
        try {
          const { status, payload } = await uploadInstanceChunk(file, uploadId, offset);
          if (status === 409 && Number.isSafeInteger(payload.offset)) {
            offset = payload.offset;
            attempts = 0;
            continue;
          }
          if (status < 200 || status >= 300) {
            const error = new Error(payload.error || `Import failed with HTTP ${status}.`);
            error.retryable = status >= 500;
            throw error;
          }
          if (!Number.isSafeInteger(payload.offset) || payload.offset <= offset) throw new Error('The server did not accept the instance upload chunk.');
          offset = payload.offset;
          attempts = 0;
          if (payload.complete) return payload;
        } catch (error) {
          attempts += 1;
          if (error.retryable === false || attempts > 4) throw new Error(`${error.message} Check the connection and try again.`);
          transferStatus.textContent = `Connection interrupted. Retrying ${file.name} from ${Math.round((offset / file.size) * 100)}%…`;
          await new Promise((resolve) => setTimeoutFn(resolve, Math.min(1000 * (2 ** (attempts - 1)), 8000)));
        }
      }
      throw new Error('The instance upload completed without a validation result.');
    }

    async function stageFullInstanceImport() {
      const file = importInstance?.files?.[0];
      if (!file) { transferStatus.textContent = 'Choose a full instance bundle first.'; transferStatus.classList.add('error'); return; }
      if (!confirmAction("Stage this full instance import? On restart it will replace the database, media, local identity and owner account. You will sign in using the source instance's credentials.")) return;
      stageInstanceImport.disabled = true; transferStatus.classList.remove('error');
      transferStatus.textContent = `Starting ${file.name}…`;
      try {
        const result = await uploadInstanceBundle(file);
        const imported = result.summary ? ` Verified ${result.summary.gigs || 0} shows and ${result.summary.media || 0} media records.` : '';
        transferStatus.textContent = `Full instance import staged (${formatBytes(result.bytes)}).${imported} Restart the server to apply it, then sign in with the source account.`;
        importInstance.value = '';
        await render();
      } catch (error) { transferStatus.textContent = error.message; transferStatus.classList.add('error'); }
      finally { stageInstanceImport.disabled = false; }
    }

    function bind() {
      scheduleForm?.addEventListener('submit', (event) => { event.preventDefault(); saveSchedule(); });
      backupNow?.addEventListener('click', createBackup);
      refreshIntegrity?.addEventListener('click', checkIntegrity);
      downloadLink?.addEventListener('click', () => { message.textContent = 'Creating a consistent SQLite snapshot…'; setTimeoutFn(render, 1800); });
      stageRestore?.addEventListener('click', stageDatabaseRestore);
      cleanup?.addEventListener('click', cleanupOrphans);
      exportArchive?.addEventListener('click', exportShowsArchive);
      importArchive?.addEventListener('change', importShowsArchive);
      exportInstance?.addEventListener('click', () => { transferStatus.textContent = 'Preparing a streamed full instance bundle…'; transferStatus.classList.remove('error'); });
      stageInstanceImport?.addEventListener('click', stageFullInstanceImport);
    }

    return { render, renderStatus, renderIntegrity, saveSchedule, createBackup, checkIntegrity, stageDatabaseRestore, cleanupOrphans, exportShowsArchive, importShowsArchive, uploadInstanceBundle, stageFullInstanceImport, bind };
  }

  return { integrityMarkup, statusMarkup, backupSchedulePayload, createController };
}));
