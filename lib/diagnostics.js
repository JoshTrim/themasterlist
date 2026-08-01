'use strict';

const SAFE_CODE = /^[A-Z0-9_:-]{1,80}$/i;

function createDiagnosticLog({ now = () => new Date(), limit = 20 } = {}) {
  const events = [];
  return {
    record(area, error = {}) {
      const requestedStatus = Number(error.status);
      const status = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
      const code = SAFE_CODE.test(String(error.code || '')) ? String(error.code) : status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR';
      events.unshift({
        at: now().toISOString(),
        area: SAFE_CODE.test(String(area || '')) ? String(area) : 'application',
        code,
        status
      });
      events.length = Math.min(events.length, limit);
    },
    entries() { return events.map((event) => ({ ...event })); }
  };
}

function tableCount(database, table, where = '') {
  return Number(database.prepare(`SELECT COUNT(*) FROM ${table}${where}`).pluck().get() || 0);
}

function createDiagnostics({ database, status, recentErrors, appVersion, env = process.env, now = () => new Date(), runtime = process }) {
  return async function diagnostics() {
    const maintenance = await status();
    const media = database.prepare('SELECT COUNT(*) AS records, COALESCE(SUM(size), 0) AS bytes FROM gig_media').get();
    const integrity = maintenance.integrity || {};
    return {
      format: 'the-master-list-diagnostics-v1',
      generatedAt: now().toISOString(),
      application: {
        version: appVersion,
        node: runtime.version,
        platform: runtime.platform,
        architecture: runtime.arch,
        uptimeSeconds: Math.max(0, Math.round(runtime.uptime()))
      },
      configuration: {
        production: env.NODE_ENV === 'production',
        trustedOriginScheme: String(env.APP_ORIGIN || '').startsWith('https://') ? 'https' : String(env.APP_ORIGIN || '').startsWith('http://') ? 'http' : 'derived',
        secureCookies: Boolean(maintenance.secureCookies),
        scheduledBackups: Boolean(maintenance.backupSchedule?.enabled),
        integrations: {
          setlistFm: Boolean(env.SETLIST_FM_API_KEY),
          spotify: Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET),
          youtube: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
          appleMusic: Boolean(env.APPLE_MUSIC_DEVELOPER_TOKEN),
          audioRecognition: Boolean(env.AUDD_API_TOKEN),
          webSearch: Boolean(env.GOOGLE_CUSTOM_SEARCH_API_KEY && env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID)
        }
      },
      archive: {
        shows: tableCount(database, 'gigs'),
        mediaRecords: Number(media.records || 0),
        mediaBytes: Number(media.bytes || 0),
        peers: tableCount(database, 'peer_instances'),
        openConflicts: tableCount(database, 'peer_sync_conflicts', " WHERE status = 'open'")
      },
      storage: {
        databaseBytes: Number(maintenance.databaseSize || 0),
        backups: Number(maintenance.backupCount || 0),
        mediaFiles: Number(integrity.summary?.diskFiles || 0),
        mediaBytes: Number(integrity.summary?.diskBytes || 0),
        mediaWritable: Boolean(maintenance.mediaWritable),
        integrityHealthy: Boolean(integrity.healthy)
      },
      pending: {
        databaseRestore: Boolean(maintenance.restorePending),
        instanceImport: Boolean(maintenance.instanceImportPending)
      },
      recentErrors: recentErrors.entries()
    };
  };
}

module.exports = { createDiagnosticLog, createDiagnostics };
