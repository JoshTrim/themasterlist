(function exposePlaybackEditor(root, factory) {
  const playbackEditor = factory();
  if (typeof module === 'object' && module.exports) module.exports = playbackEditor;
  else root.MasterListPlaybackEditor = playbackEditor;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPlaybackEditor() {
  function validatePlan(songs = [], rows = []) {
    const results = rows.map((row) => ({ songIndex: row.songIndex, errors: [], warnings: [], assigned: Boolean(row.primaryId) }));
    const bySong = new Map(results.map((result) => [result.songIndex, result]));
    const clipsByMedia = new Map();
    rows.forEach((row) => {
      const result = bySong.get(row.songIndex); const sources = row.sources || [];
      if (!row.primaryId && sources.length) result.errors.push('Choose a primary source before adding fallbacks.');
      if (!row.primaryId) return;
      const seen = new Set();
      sources.forEach((source) => {
        const start = source.startValue === '' ? null : Number(source.startValue); const end = source.endValue === '' ? null : Number(source.endValue);
        const prefix = source.priority ? `Backup ${source.priority}: ` : '';
        if (!source.media) { result.errors.push(`${prefix}Source is unavailable.`); return; }
        if (seen.has(source.media.id)) result.errors.push(`${prefix}Source is already used for this track.`); seen.add(source.media.id);
        if (source.media.originalExists === false) result.errors.push(`${prefix}Source file is missing from disk.`);
        if (!source.priority && row.previewUnavailable) result.errors.push('Primary source could not be loaded in the preview player.');
        if (source.media.mimeType !== 'video/youtube' && source.media.playbackStatus === 'encoding') result.warnings.push(`${prefix}Mobile playback copy is still encoding.`);
        if (source.media.mimeType !== 'video/youtube' && source.media.playbackStatus === 'error') result.warnings.push(`${prefix}Playback copy failed; the original file will be used.`);
        if (start !== null && (!Number.isFinite(start) || start < 0)) result.errors.push(`${prefix}Start must be zero or greater.`);
        if (end !== null && (!Number.isFinite(end) || end <= 0)) result.errors.push(`${prefix}End must be greater than zero.`);
        if (start !== null && end !== null && end <= start) result.errors.push(`${prefix}End must be after start.`);
        if (!source.priority && row.duration && start !== null && start >= row.duration) result.errors.push('Start is beyond the end of the primary video.');
        if (!source.priority && row.duration && end !== null && end > row.duration + .1) result.errors.push('End is beyond the end of the primary video.');
        if (!clipsByMedia.has(source.media.id)) clipsByMedia.set(source.media.id, []);
        clipsByMedia.get(source.media.id).push({ result, songIndex: row.songIndex, start, end, title: songs[row.songIndex]?.title || `Track ${row.songIndex + 1}` });
      });
    });
    clipsByMedia.forEach((clips) => {
      clips.sort((a, b) => a.songIndex - b.songIndex);
      for (let index = 1; index < clips.length; index += 1) {
        const previous = clips[index - 1]; const current = clips[index]; let message = '';
        if (previous.start !== null && current.start !== null && current.start < previous.start) message = `Starts before the earlier track “${previous.title}”.`;
        else if (previous.end !== null && current.start !== null && current.start < previous.end) message = `Overlaps “${previous.title}” on the same video.`;
        if (message) current.result.errors.push(message);
      }
    });
    const errors = results.flatMap((result) => result.errors.map((message) => `${songs[result.songIndex]?.title || `Track ${result.songIndex + 1}`}: ${message}`));
    const warnings = results.flatMap((result) => result.warnings.map((message) => `${songs[result.songIndex]?.title || `Track ${result.songIndex + 1}`}: ${message}`));
    return { rows: results, errors, warnings, assigned: results.filter((result) => result.assigned).length, gaps: results.filter((result) => !result.assigned).length };
  }

  function clipsFromRows(rows = []) {
    return rows.flatMap((row) => (row.sources || []).filter((source) => source.media).map((source) => ({
      mediaId: source.media.id, songIndex: row.songIndex,
      startSeconds: source.startValue === '' ? null : Number(source.startValue), endSeconds: source.endValue === '' ? null : Number(source.endValue), priority: source.priority
    })));
  }

  function suggestionConfidence(suggestion) {
    const value = Number(suggestion?.confidence) || 0;
    if (value >= .9) return 'High confidence'; if (value >= .75) return 'Good confidence';
    if (/interpolated/i.test(suggestion?.reason || '')) return 'Timing estimate'; if (/estimated/i.test(suggestion?.reason || '')) return 'Rough timing'; return 'Possible match';
  }

  function suggestionTiming(suggestion, formatTime) {
    if (suggestion.startSeconds == null) return 'Timing not detected';
    return `${formatTime(suggestion.startSeconds)}–${suggestion.endSeconds == null ? 'video end' : formatTime(suggestion.endSeconds)}`;
  }

  return { validatePlan, clipsFromRows, suggestionConfidence, suggestionTiming };
}));
