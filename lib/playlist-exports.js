function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function createPlaylistExportService({
  database, jobs, providers, getAccessToken, randomUUID,
  schedule = setImmediate, now = () => new Date().toISOString()
}) {
  const columns = `id, gig_id AS gigId, provider, status, phase, progress,
    playlist_id AS playlistId, playlist_url AS url, matched,
    unmatched_json AS unmatchedJson, state_json AS stateJson,
    error, error_code AS errorCode, created_at AS createdAt, updated_at AS updatedAt`;

  function hydrate(row) {
    if (!row) return null;
    const { unmatchedJson, stateJson, ...exportRow } = row;
    return { ...exportRow, unmatched: parseJson(unmatchedJson, []), state: parseJson(stateJson, {}) };
  }

  function get(id) {
    return hydrate(database.prepare(`SELECT ${columns} FROM playlist_exports WHERE id = ?`).get(id));
  }

  function latestResumable(gigId, provider) {
    if (provider !== 'youtube') return null;
    return hydrate(database.prepare(`SELECT ${columns} FROM playlist_exports
      WHERE gig_id = ? AND provider = ? AND status IN ('queued', 'running', 'error')
      ORDER BY created_at DESC LIMIT 1`).get(gigId, provider));
  }

  function save(record) {
    const timestamp = now();
    const progress = Math.max(0, Math.min(100, Math.round(Number(record.progress) || 0)));
    database.prepare(`INSERT INTO playlist_exports
      (id, gig_id, provider, status, phase, progress, playlist_id, playlist_url, matched,
       unmatched_json, state_json, error, error_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, phase=excluded.phase,
        progress=excluded.progress, playlist_id=excluded.playlist_id,
        playlist_url=excluded.playlist_url, matched=excluded.matched,
        unmatched_json=excluded.unmatched_json, state_json=excluded.state_json,
        error=excluded.error, error_code=excluded.error_code,
        updated_at=excluded.updated_at`).run(
      record.id, record.gigId, record.provider, record.status, record.phase || 'queued', progress,
      record.playlistId || null, record.url || null, Number(record.matched) || 0,
      JSON.stringify(record.unmatched || []), JSON.stringify(record.state || {}),
      record.error || null, record.errorCode || null, record.createdAt || timestamp, timestamp
    );
    return get(record.id);
  }

  function phaseName(provider, phase, current, total, artist) {
    const providerName = provider === 'apple-music' ? 'Apple Music' : provider === 'youtube' ? 'YouTube' : 'Spotify';
    const activity = phase === 'searching' ? 'Searching' : phase === 'adding' ? 'Adding' : phase === 'creating' ? 'Creating playlist' : phase === 'complete' ? 'Complete' : 'Queued';
    const count = total && ['searching', 'adding'].includes(phase) ? ` ${current}/${total}` : '';
    return `${providerName} · ${artist} · ${activity}${count}`;
  }

  async function run(record, gig, details, musicUserToken) {
    const provider = providers[record.provider];
    const type = 'Export playlist';
    try {
      const accessToken = record.provider === 'apple-music' ? null : await getAccessToken(record.provider);
      let current = save({ ...record, status: 'running', phase: record.phase || 'searching', error: null, errorCode: null });
      jobs.save(record.id, type, phaseName(record.provider, current.phase, 0, (gig.songs || []).length, gig.artist), 'running', current.progress);
      const result = await provider.exportPlaylist({
        gig, accessToken, musicUserToken, details, resumeState: current.state,
        shouldCancel: () => jobs.get(record.id)?.status === 'cancelled',
        onProgress: async (update = {}) => {
          if (jobs.get(record.id)?.status === 'cancelled') throw Object.assign(new Error('Playlist export cancelled.'), { code: 'cancelled' });
          current = save({
            ...current, ...update, status: 'running',
            state: update.state || current.state,
            unmatched: update.unmatched || current.unmatched,
            error: null, errorCode: null
          });
          jobs.save(record.id, type, phaseName(record.provider, current.phase, update.current, update.total, gig.artist), 'running', current.progress);
        }
      });
      if (jobs.get(record.id)?.status === 'cancelled') throw Object.assign(new Error('Playlist export cancelled.'), { code: 'cancelled' });
      current = save({ ...current, ...result, state: result.state || current.state, status: 'complete', phase: 'complete', progress: 100, error: null, errorCode: null });
      jobs.save(record.id, type, phaseName(record.provider, 'complete', 0, 0, gig.artist), 'complete', 100);
    } catch (error) {
      const cancelled = jobs.get(record.id)?.status === 'cancelled' || error.code === 'cancelled';
      const current = get(record.id) || record;
      save({ ...current, status: cancelled ? 'cancelled' : 'error', error: cancelled ? null : error.message, errorCode: error.code || null });
      jobs.save(record.id, type, phaseName(record.provider, current.phase, 0, 0, gig.artist), cancelled ? 'cancelled' : 'error', current.progress, cancelled ? null : error.message);
    }
  }

  function start({ gig, provider, details, musicUserToken }) {
    const active = latestResumable(gig.id, provider);
    if (active && ['queued', 'running'].includes(active.status)) return active;
    const resumable = active && active.status !== 'complete' ? active : null;
    const record = save({
      id: resumable?.id || randomUUID(), gigId: gig.id, provider,
      status: 'queued', phase: resumable?.phase || 'queued', progress: resumable?.progress || 0,
      playlistId: resumable?.playlistId, url: resumable?.url, matched: resumable?.matched || 0,
      unmatched: resumable?.unmatched || [], state: resumable?.state || {}, error: null, errorCode: null,
      createdAt: resumable?.createdAt
    });
    jobs.save(record.id, 'Export playlist', phaseName(provider, 'queued', 0, 0, gig.artist), 'queued', record.progress);
    schedule(() => run(record, gig, details, musicUserToken));
    return record;
  }

  function publicStatus(id) {
    const record = get(id);
    if (!record) return null;
    const { state, ...safe } = record;
    return safe;
  }

  return { get, publicStatus, start, latestResumable };
}

module.exports = { createPlaylistExportService };
