'use strict';

function createPlaybackPlanRoutes({ database, requireAccount, readBody, sendJson, sendError, findGig, mediaRows, refreshMetadata, suggestPlaybackPlan, now = () => new Date().toISOString() }) {
  return async function handlePlaybackPlanRoute(request, response, url) {
    const suggestMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/playback-plan\/suggest$/);
    if (request.method === 'POST' && suggestMatch) {
      requireAccount(request);
      const gig = findGig(suggestMatch[1]);
      let media = mediaRows(gig.id);
      const metadataWarning = await refreshMetadata(gig.id, media);
      media = mediaRows(gig.id);
      const suggestions = suggestPlaybackPlan(gig, media);
      sendJson(response, 200, { suggestions, metadataWarning, inspected: media.filter((item) => item.category !== 'artifact' && String(item.mimeType || '').startsWith('video/')).length });
      return true;
    }

    const planMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/playback-plan$/);
    if (request.method !== 'PUT' || !planMatch) return false;
    requireAccount(request);
    const gig = database.prepare('SELECT id, songs FROM gigs WHERE id = ?').get(planMatch[1]);
    if (!gig) { sendError(response, 404, 'Gig not found.'); return true; }
    const songs = JSON.parse(gig.songs || '[]');
    const mediaIds = new Set(database.prepare("SELECT id FROM gig_media WHERE gig_id = ? AND mime_type LIKE 'video/%' AND category <> 'artifact'").all(gig.id).map((item) => item.id));
    const body = await readBody(request);
    if (!Array.isArray(body.clips)) { sendError(response, 400, 'Playback clips are required.'); return true; }
    if (body.clips.length > songs.length * 8) { sendError(response, 400, 'A track can have at most eight playback sources.'); return true; }

    const clips = []; const clipKeys = new Set();
    for (const [inputIndex, item] of body.clips.entries()) {
      const songIndex = Number(item.songIndex); const mediaId = String(item.mediaId || ''); const requestedPriority = Number(item.priority);
      const startSeconds = item.startSeconds === '' || item.startSeconds == null ? null : Number(item.startSeconds);
      const endSeconds = item.endSeconds === '' || item.endSeconds == null ? null : Number(item.endSeconds);
      if (!Number.isInteger(songIndex) || songIndex < 0 || songIndex >= songs.length || !mediaIds.has(mediaId)) { sendError(response, 400, 'Playback clip references an invalid song or video.'); return true; }
      if (startSeconds !== null && (!Number.isFinite(startSeconds) || startSeconds < 0)) { sendError(response, 400, `Invalid start point for track ${songIndex + 1}.`); return true; }
      if (endSeconds !== null && (!Number.isFinite(endSeconds) || endSeconds <= 0)) { sendError(response, 400, `Invalid end point for track ${songIndex + 1}.`); return true; }
      if (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds) { sendError(response, 400, `Playback end must follow the start for track ${songIndex + 1}.`); return true; }
      const key = `${songIndex}:${mediaId}`;
      if (clipKeys.has(key)) { sendError(response, 400, `Track ${songIndex + 1} contains the same playback source more than once.`); return true; }
      clipKeys.add(key);
      clips.push({ mediaId, songIndex, startSeconds, endSeconds, requestedPriority: Number.isInteger(requestedPriority) && requestedPriority >= 0 ? requestedPriority : inputIndex, inputIndex });
    }

    const clipsBySong = groupBy(clips, 'songIndex');
    if ([...clipsBySong.values()].some((entries) => entries.length > 8)) { sendError(response, 400, 'A track can have at most eight playback sources.'); return true; }
    clipsBySong.forEach((entries) => entries.sort((a, b) => a.requestedPriority - b.requestedPriority || a.inputIndex - b.inputIndex).forEach((clip, priority) => { clip.priority = priority; }));
    for (const entries of groupBy(clips, 'mediaId').values()) {
      entries.sort((a, b) => a.songIndex - b.songIndex);
      for (let index = 1; index < entries.length; index += 1) {
        const previous = entries[index - 1]; const current = entries[index];
        if (previous.startSeconds !== null && current.startSeconds !== null && current.startSeconds < previous.startSeconds) { sendError(response, 400, `Track ${current.songIndex + 1} starts before an earlier clip from the same video.`); return true; }
        if (previous.endSeconds !== null && current.startSeconds !== null && current.startSeconds < previous.endSeconds) { sendError(response, 400, `Track ${current.songIndex + 1} overlaps the previous clip from the same video.`); return true; }
      }
    }

    database.transaction((validated) => {
      database.prepare('DELETE FROM media_playback_clips WHERE media_id IN (SELECT id FROM gig_media WHERE gig_id = ?)').run(gig.id);
      database.prepare("UPDATE gig_media SET playback_clips_initialized = 1 WHERE gig_id = ? AND mime_type LIKE 'video/%'").run(gig.id);
      const insert = database.prepare('INSERT INTO media_playback_clips (media_id, song_index, start_seconds, end_seconds, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const timestamp = now();
      validated.forEach((clip) => insert.run(clip.mediaId, clip.songIndex, clip.startSeconds, clip.endSeconds, clip.priority, timestamp, timestamp));
    })(clips);
    sendJson(response, 200, { media: mediaRows(gig.id) }); return true;
  };
}

function groupBy(items, key) {
  const groups = new Map();
  items.forEach((item) => { if (!groups.has(item[key])) groups.set(item[key], []); groups.get(item[key]).push(item); });
  return groups;
}

module.exports = { createPlaybackPlanRoutes };
