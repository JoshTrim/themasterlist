function createArchiveIntegrityService({ database, fs, path, mediaDir, databaseFile, profileImageFilename, now = () => new Date().toISOString() }) {
  function fileReferences() {
    const references = new Map();
    const add = (filename, detail) => {
      if (!filename) return;
      if (!references.has(filename)) references.set(filename, []);
      references.get(filename).push(detail);
    };
    const media = database.prepare(`SELECT m.id, m.gig_id AS gigId, m.filename, m.playback_filename AS playbackFilename,
      m.background_filename AS backgroundFilename, m.external_url AS externalUrl, m.checksum, m.size,
      m.category, m.mime_type AS mimeType, m.playback_status AS playbackStatus,
      g.artist, g.venue, g.date FROM gig_media m LEFT JOIN gigs g ON g.id = m.gig_id ORDER BY m.created_at`).all();
    for (const item of media) {
      const show = { mediaId: item.id, gigId: item.gigId, artist: item.artist, venue: item.venue, date: item.date };
      if (!item.externalUrl) add(item.filename, { kind: 'original', ...show });
      add(item.playbackFilename, { kind: 'playback', ...show });
      add(item.backgroundFilename, { kind: 'cutout', ...show });
    }
    for (const row of [...database.prepare('SELECT lookup_name AS owner, image FROM artist_info').all(), ...database.prepare('SELECT lookup_name AS owner, image FROM venue_info').all()]) {
      const filename = profileImageFilename(row.image);
      if (filename) add(filename, { kind: 'profile-image', owner: row.owner });
    }
    return { media, references };
  }

  async function diskFiles() {
    let entries = [];
    try { entries = (await fs.readdir(mediaDir, { withFileTypes: true })).filter((entry) => entry.isFile()); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const files = new Map();
    for (const entry of entries) {
      try { files.set(entry.name, (await fs.stat(path.join(mediaDir, entry.name))).size); } catch { /* file changed during scan */ }
    }
    return files;
  }

  async function report() {
    const { media, references } = fileReferences();
    const files = await diskFiles();
    const issues = [];
    for (const [filename, owners] of references) {
      if (files.has(filename)) continue;
      const owner = owners[0];
      issues.push({ id: `missing:${filename}`, type: 'missing', title: filename, detail: owner.kind === 'profile-image' ? `Missing profile image referenced by ${owner.owner}` : `Missing ${owner.kind} file for ${owner.artist || 'unknown artist'} at ${owner.venue || 'unknown venue'}`, href: owner.gigId ? `/edit?id=${encodeURIComponent(owner.gigId)}` : '/health' });
    }
    for (const [filename, size] of files) {
      if (references.has(filename) || /\.(?:uploading|processing|rotating|trimming)(?:\.|$)/i.test(filename)) continue;
      issues.push({ id: `orphan:${filename}`, type: 'orphan', title: filename, detail: `Unreferenced media file · ${size} bytes`, filename });
    }
    for (const item of media.filter((entry) => !entry.artist)) issues.push({ id: `reference:${item.id}`, type: 'reference', title: item.filename || item.id, detail: `Media record points to missing show ${item.gigId}` });
    const duplicates = database.prepare(`SELECT checksum, COUNT(*) AS count, GROUP_CONCAT(id) AS ids, GROUP_CONCAT(gig_id) AS gigIds
      FROM gig_media WHERE checksum IS NOT NULL AND checksum <> '' AND external_url IS NULL GROUP BY checksum HAVING COUNT(*) > 1`).all();
    for (const duplicate of duplicates) issues.push({ id: `duplicate:${duplicate.checksum}`, type: 'duplicate', title: `${duplicate.count} matching uploads`, detail: `These media records share checksum ${duplicate.checksum.slice(0, 12)}…`, mediaIds: duplicate.ids.split(','), href: `/edit?id=${encodeURIComponent(duplicate.gigIds.split(',')[0])}` });
    const foreignKeys = database.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeys.length) issues.push({ id: 'database:foreign-keys', type: 'database', title: 'Broken database relationships', detail: `${foreignKeys.length} foreign-key violation${foreignKeys.length === 1 ? '' : 's'} detected` });
    const quickCheck = database.prepare('PRAGMA quick_check').all().map((row) => Object.values(row)[0]);
    if (quickCheck.some((value) => value !== 'ok')) issues.push({ id: 'database:quick-check', type: 'database', title: 'SQLite integrity warning', detail: quickCheck.join('; ') });
    const counts = issues.reduce((result, issue) => { result[issue.type] = (result[issue.type] || 0) + 1; return result; }, {});
    const storage = {
      originals: 0, artifacts: 0, playbackCopies: 0, cutouts: 0, profileImages: 0, orphaned: 0,
      largestFiles: [], largestShows: []
    };
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const showTotals = new Map();
    for (const [filename, size] of files) {
      const owners = references.get(filename) || [];
      const owner = owners[0];
      let bucket = 'orphaned';
      if (owner?.kind === 'playback') bucket = 'playbackCopies';
      else if (owner?.kind === 'cutout') bucket = 'cutouts';
      else if (owner?.kind === 'profile-image') bucket = 'profileImages';
      else if (owner?.kind === 'original') {
        const record = mediaById.get(owner.mediaId);
        bucket = record?.category === 'artifact' ? 'artifacts' : 'originals';
      }
      storage[bucket] += size;
      const title = owner?.kind === 'profile-image' ? owner.owner : owner?.artist ? `${owner.artist}${owner.venue ? ` · ${owner.venue}` : ''}` : filename;
      storage.largestFiles.push({ filename, bytes: size, bucket, title, href: owner?.gigId ? `/edit?id=${encodeURIComponent(owner.gigId)}` : null });
      if (owner?.gigId) {
        const current = showTotals.get(owner.gigId) || { gigId: owner.gigId, artist: owner.artist || 'Unknown artist', venue: owner.venue || 'Unknown venue', date: owner.date || '', bytes: 0, files: 0 };
        current.bytes += size; current.files += 1; showTotals.set(owner.gigId, current);
      }
    }
    storage.largestFiles.sort((a, b) => b.bytes - a.bytes); storage.largestFiles = storage.largestFiles.slice(0, 10);
    storage.largestShows = [...showTotals.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 10).map((item) => ({ ...item, href: `/edit?id=${encodeURIComponent(item.gigId)}` }));
    return { healthy: issues.length === 0, scannedAt: now(), counts, issues, storage, summary: { database: quickCheck.every((value) => value === 'ok'), records: media.length, referencedFiles: references.size, diskFiles: files.size, diskBytes: [...files.values()].reduce((sum, size) => sum + size, 0) } };
  }

  async function removePlaybackCopies() {
    const rows = database.prepare("SELECT id, playback_filename AS filename FROM gig_media WHERE playback_filename IS NOT NULL AND playback_filename <> '' AND playback_status <> 'encoding'").all();
    let removed = 0; let bytesFreed = 0;
    for (const row of rows) {
      const filename = path.basename(row.filename);
      if (filename !== row.filename) continue;
      try { const stat = await fs.stat(path.join(mediaDir, filename)); bytesFreed += stat.size; } catch { /* already absent */ }
      await fs.rm(path.join(mediaDir, filename), { force: true });
      database.prepare("UPDATE gig_media SET playback_filename = NULL, playback_mime = NULL, playback_status = 'not_started', playback_error = NULL WHERE id = ?").run(row.id);
      removed += 1;
    }
    return { removed, bytesFreed, skipped: database.prepare("SELECT COUNT(*) AS count FROM gig_media WHERE playback_status = 'encoding'").get().count };
  }

  async function manifest() {
    const integrity = await report();
    const { media, references } = fileReferences();
    const files = [];
    for (const [filename, owners] of references) {
      try { files.push({ filename, size: (await fs.stat(path.join(mediaDir, filename))).size, present: true, owners }); }
      catch { files.push({ filename, size: null, present: false, owners }); }
    }
    return { format: 'the-master-list-media-manifest-v1', createdAt: now(), databaseFile: path.basename(databaseFile), mediaRecords: media.length, files, integrity: { healthy: integrity.healthy, counts: integrity.counts } };
  }

  return { fileReferences, report, manifest, removePlaybackCopies };
}

module.exports = { createArchiveIntegrityService };
