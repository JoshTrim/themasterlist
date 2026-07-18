function createMediaRepository({ database, mediaDir, path, existsSync, statSync }) {
  function format(media) {
    const useBackgroundRemoved = Boolean(media.useBackgroundRemoved && media.backgroundFilename);
    const external = Boolean(media.externalUrl);
    const originalExists = external || Boolean(media.filename && existsSync(path.join(mediaDir, media.filename)));
    const playbackExists = Boolean(media.playbackFilename && existsSync(path.join(mediaDir, media.playbackFilename)));
    let playbackSize = 0;
    if (playbackExists) {
      try { playbackSize = statSync(path.join(mediaDir, media.playbackFilename)).size; } catch { playbackSize = 0; }
    }
    return {
      ...media,
      isCover: Boolean(media.isCover),
      playbackPreferred: Boolean(media.playbackPreferred),
      playbackStart: media.playbackStart === null || media.playbackStart === undefined ? null : Number(media.playbackStart),
      playbackEnd: media.playbackEnd === null || media.playbackEnd === undefined ? null : Number(media.playbackEnd),
      sourceDuration: media.sourceDuration === null || media.sourceDuration === undefined ? null : Number(media.sourceDuration),
      recognitionOverride: Boolean(media.recognitionOverride),
      useBackgroundRemoved,
      rotation: Number(media.rotation || 0),
      songIndex: media.songIndex === null ? null : Number(media.songIndex),
      originalExists,
      playbackExists,
      playbackSize,
      playbackStatus: external ? 'external' : !String(media.mimeType || '').startsWith('video/') ? 'not_required' : !originalExists ? 'missing' : playbackExists ? 'ready' : media.playbackStatus || 'not_started',
      url: media.externalUrl || `/api/media/${media.id}${useBackgroundRemoved ? '?variant=cutout' : ''}`
    };
  }

  function list(gigId) {
    const rows = database.prepare('SELECT id, filename, playback_filename AS playbackFilename, playback_mime AS playbackMime, playback_status AS playbackStatus, playback_error AS playbackError, mime_type AS mimeType, caption, is_cover AS isCover, sort_order AS sortOrder, rotation, category, external_url AS externalUrl, song_index AS songIndex, playback_preferred AS playbackPreferred, playback_start AS playbackStart, playback_end AS playbackEnd, source_description AS sourceDescription, source_duration AS sourceDuration, source_metadata_at AS sourceMetadataAt, size, created_at AS createdAt, recognition_status AS recognitionStatus, recognition_title AS recognitionTitle, recognition_artist AS recognitionArtist, recognition_album AS recognitionAlbum, recognition_error AS recognitionError, recognition_override AS recognitionOverride, background_filename AS backgroundFilename, background_status AS backgroundStatus, background_error AS backgroundError, use_background_removed AS useBackgroundRemoved FROM gig_media WHERE gig_id = ? ORDER BY sort_order, created_at').all(gigId).map(format);
    const clips = database.prepare(`SELECT clips.media_id AS mediaId, clips.song_index AS songIndex,
      clips.start_seconds AS startSeconds, clips.end_seconds AS endSeconds, clips.priority
      FROM media_playback_clips clips JOIN gig_media media ON media.id = clips.media_id
      WHERE media.gig_id = ? ORDER BY clips.song_index, clips.priority, clips.created_at`).all(gigId);
    const byMedia = new Map();
    for (const clip of clips) {
      if (!byMedia.has(clip.mediaId)) byMedia.set(clip.mediaId, []);
      byMedia.get(clip.mediaId).push({
        songIndex: Number(clip.songIndex),
        startSeconds: clip.startSeconds === null ? null : Number(clip.startSeconds),
        endSeconds: clip.endSeconds === null ? null : Number(clip.endSeconds),
        priority: Number(clip.priority) || 0
      });
    }
    for (const media of rows) media.playbackClips = byMedia.get(media.id) || [];
    return rows;
  }

  return { format, list };
}

module.exports = { createMediaRepository };
