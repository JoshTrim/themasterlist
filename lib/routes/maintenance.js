function createMaintenanceRoutes({ requireAccount, readBody, sendJson, sendError, status, diagnostics, updateStatus, settings, setSetting, pruneBackups, createBackup, manifest, integrity, restore, exportInstance, importInstance, importInstanceChunk, removePlaybackCopies, regeneratePlaybackCopies }) {
  return async function handleMaintenanceRoute(request, response, url) {
    if (!url.pathname.startsWith('/api/maintenance/')) return false;
    if (request.method === 'GET' && url.pathname === '/api/maintenance/status') {
      requireAccount(request); sendJson(response, 200, await status()); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/maintenance/diagnostics') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can download diagnostics.'); return true; }
      const filename = `the-master-list-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
      sendJson(response, 200, await diagnostics(), { 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' }); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/maintenance/update-status') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can check for updates.'); return true; }
      try { sendJson(response, 200, await updateStatus({ refresh: url.searchParams.get('refresh') === '1' })); }
      catch (error) { sendError(response, 502, error.message); }
      return true;
    }
    if (request.method === 'PATCH' && url.pathname === '/api/maintenance/backup-settings') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can change backup settings.'); return true; }
      const body = await readBody(request);
      const intervalHours = Math.max(1, Math.min(24 * 30, Math.round(Number(body.intervalHours) || 24)));
      const retentionCount = Math.max(1, Math.min(365, Math.round(Number(body.retentionCount) || 14)));
      setSetting('backup_enabled', body.enabled === false ? 'false' : 'true');
      setSetting('backup_interval_hours', intervalHours); setSetting('backup_retention_count', retentionCount);
      await pruneBackups(retentionCount); sendJson(response, 200, settings()); return true;
    }
    if (request.method === 'PATCH' && url.pathname === '/api/maintenance/storage-settings') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can change storage settings.'); return true; }
      const body = await readBody(request);
      const warningPercent = Math.max(50, Math.min(99, Math.round(Number(body.warningPercent) || 85)));
      setSetting('media_storage_warning_percent', warningPercent);
      sendJson(response, 200, { warningPercent }); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/maintenance/backup-now') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can run backups.'); return true; }
      try { sendJson(response, 201, await createBackup({ force: true })); }
      catch (error) { sendError(response, 500, error.message); }
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/maintenance/manifest') {
      requireAccount(request);
      const filename = `the-master-list-media-manifest-${new Date().toISOString().slice(0, 10)}.json`;
      sendJson(response, 200, await manifest(), { 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' }); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/maintenance/integrity') {
      requireAccount(request); sendJson(response, 200, await integrity()); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/maintenance/playback-copies/remove') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can remove playback copies.'); return true; }
      sendJson(response, 200, await removePlaybackCopies()); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/maintenance/playback-copies/regenerate') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can regenerate playback copies.'); return true; }
      sendJson(response, 202, await regeneratePlaybackCopies()); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/maintenance/restore') {
      requireAccount(request);
      const contentType = String(request.headers['content-type'] || '');
      if (!contentType.includes('application/vnd.sqlite3') && !contentType.includes('application/octet-stream')) { sendError(response, 415, 'Upload a SQLite database file.'); return true; }
      try { sendJson(response, 202, await restore(request)); }
      catch (error) { sendError(response, /smaller than 2 GB/i.test(error.message) ? 413 : 400, error.message); }
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/maintenance/instance-export') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can export the full instance.'); return true; }
      await exportInstance(response); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/maintenance/instance-import') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can import a full instance.'); return true; }
      const contentType = String(request.headers['content-type'] || '');
      if (!contentType.includes('application/vnd.the-master-list.instance') && !contentType.includes('application/octet-stream')) { sendError(response, 415, 'Upload a The Master List instance bundle.'); return true; }
      try { sendJson(response, 202, await importInstance(request)); }
      catch (error) { sendError(response, error.status || 400, error.message); }
      return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/maintenance/instance-import/chunk') {
      const account = requireAccount(request);
      if (!account.isAdmin) { sendError(response, 403, 'Only the instance owner can import a full instance.'); return true; }
      const contentType = String(request.headers['content-type'] || '');
      if (!contentType.includes('application/octet-stream')) { sendError(response, 415, 'Upload an instance bundle chunk.'); return true; }
      try {
        const result = await importInstanceChunk(request);
        sendJson(response, result.conflict ? 409 : result.complete ? 202 : 200, result);
      } catch (error) { sendError(response, error.status || 400, error.message); }
      return true;
    }
    return false;
  };
}

module.exports = { createMaintenanceRoutes };
