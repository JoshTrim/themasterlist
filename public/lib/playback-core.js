(function exposePlaybackCore(root, factory) {
  const playback = factory();
  if (typeof module === 'object' && module.exports) module.exports = playback;
  else root.MasterListPlaybackCore = playback;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPlaybackCore() {
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));

  function sourceLabel(item) {
    const type = item?.mimeType === 'video/youtube' ? 'YouTube' : 'Upload';
    return `${type} · ${item?.caption || item?.filename || 'Untitled video'}`;
  }

  function candidates(gig) {
    return (gig?.media || []).filter((item) => item.category !== 'artifact' && String(item.mimeType || '').startsWith('video/'));
  }

  function clipFor(item, songIndex) {
    return (item?.playbackClips || []).filter((clip) => clip.songIndex === songIndex).sort((a, b) => (a.priority || 0) - (b.priority || 0))[0] || null;
  }

  function sourcesForSong(gig, songIndex) {
    const videos = candidates(gig);
    const planned = videos.flatMap((media) => (media.playbackClips || []).filter((clip) => clip.songIndex === songIndex).map((clip) => ({ media, clip }))).sort((a, b) => (a.clip.priority || 0) - (b.clip.priority || 0));
    if (planned.length) return planned;
    const legacy = videos.find((item) => !(item.playbackClips || []).length && item.songIndex === songIndex);
    return legacy ? [{ media: legacy, clip: { songIndex, startSeconds: legacy.playbackStart ?? null, endSeconds: legacy.playbackEnd ?? null, priority: 0 } }] : [];
  }

  function bounds(source, duration = 0) {
    const media = source?.media || source;
    const clip = source?.clip || null;
    const requestedStart = Math.max(0, Number(clip?.startSeconds ?? media?.playbackStart) || 0);
    const requestedEnd = Number(clip?.endSeconds ?? media?.playbackEnd);
    const naturalEnd = Number(duration) > 0 ? Number(duration) : null;
    const start = naturalEnd ? Math.min(requestedStart, naturalEnd) : requestedStart;
    const end = Number.isFinite(requestedEnd) && requestedEnd > start ? (naturalEnd ? Math.min(requestedEnd, naturalEnd) : requestedEnd) : naturalEnd;
    return { start, end, length: end && end > start ? end - start : null };
  }

  function fraction(source, current, duration) {
    const range = bounds(source, duration);
    if (!range.length) return duration > 0 ? clamp(current / duration) : 0;
    return clamp((current - range.start) / range.length);
  }

  function timeAt(source, position, duration) {
    const range = bounds(source, duration);
    const bounded = clamp(position);
    if (range.length) return range.start + (range.length * bounded);
    return range.end !== null ? range.start + (Math.max(0, range.end - range.start) * bounded) : range.start;
  }

  function activateSource(entry, sourceIndex = 0) {
    entry.sourceIndex = clamp(sourceIndex, 0, Math.max(0, (entry.sources || []).length - 1));
    const source = entry.sources?.[entry.sourceIndex] || null;
    entry.media = source?.media || null;
    entry.clip = source?.clip || null;
    return source;
  }

  function entryTitle(gig, entry) {
    return entry?.isUnknown ? 'Unknown' : gig?.songs?.[entry?.songIndex]?.title || 'Unknown';
  }

  function entryKey(entry) {
    if (!entry?.isUnknown) return `song:${entry?.songIndex}`;
    const range = bounds(entry);
    return `unknown:${entry.media?.id || ''}:${range.start}:${range.end ?? ''}`;
  }

  function unknownEntry(media, startSeconds, endSeconds) {
    const clip = { songIndex: null, startSeconds, endSeconds, priority: 0 };
    const source = { media, clip };
    return { isUnknown: true, songIndex: null, sources: [source], sourceIndex: 0, media, clip };
  }

  function buildQueue(gig) {
    const base = (gig?.songs || []).map((song, songIndex) => {
      const entry = { songIndex, sources: sourcesForSong(gig, songIndex), sourceIndex: 0, media: null, clip: null };
      activateSource(entry, 0);
      return entry;
    });
    const queue = [];
    let previousPlayable = null;
    base.forEach((entry) => {
      if (entry.media) {
        const current = bounds(entry);
        if (!previousPlayable && current.start > .5) queue.push(unknownEntry(entry.media, 0, current.start));
        if (previousPlayable?.media?.id === entry.media.id) {
          const previous = bounds(previousPlayable);
          if (previous.end !== null && current.start > previous.end + .5) queue.push(unknownEntry(entry.media, previous.end, current.start));
        }
        previousPlayable = entry;
      }
      queue.push(entry);
    });
    if (previousPlayable) {
      const range = bounds(previousPlayable);
      const duration = Number(previousPlayable.media?.sourceDuration) || 0;
      if (range.end !== null && duration > range.end + .5) queue.push(unknownEntry(previousPlayable.media, range.end, duration));
    }
    return queue;
  }

  function nextPlayableIndex(queue, start, direction = 1) {
    for (let index = start; index >= 0 && index < queue.length; index += direction) if (queue[index]?.media) return index;
    return -1;
  }

  function validChapterStart(song) {
    if (song?.startSeconds === null || song?.startSeconds === undefined || song?.startSeconds === '') return null;
    const value = Number(song.startSeconds);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function planLengths(gig, queue) {
    const lengths = queue.map((entry, index) => {
      const range = bounds(entry);
      if (range.length) return range.length;
      const nextSameSource = entry.media ? queue.slice(index + 1).find((candidate) => candidate.media?.id === entry.media.id && bounds(candidate).start > range.start) : null;
      if (nextSameSource) return bounds(nextSameSource).start - range.start;
      const chapterStart = entry.isUnknown ? null : validChapterStart(gig.songs[entry.songIndex]);
      const nextEntry = index < queue.length - 1 ? queue[index + 1] : null;
      const nextChapterStart = nextEntry && !nextEntry.isUnknown ? validChapterStart(gig.songs[nextEntry.songIndex]) : null;
      return chapterStart !== null && nextChapterStart !== null && nextChapterStart > chapterStart ? nextChapterStart - chapterStart : null;
    });
    const known = lengths.filter((length) => Number.isFinite(length) && length > 0).sort((a, b) => a - b);
    const fallback = known.length ? known[Math.floor(known.length / 2)] : 180;
    return lengths.map((length) => Number.isFinite(length) && length > 0 ? length : fallback);
  }

  function timelineModel(gig, queue) {
    if (!queue.length) return [];
    const lengths = planLengths(gig, queue);
    const total = lengths.reduce((sum, length) => sum + length, 0) || queue.length;
    let elapsed = 0;
    return queue.map((entry, index) => {
      const start = elapsed / total;
      elapsed += lengths[index];
      return { entry, index, marker: start, start, end: index === queue.length - 1 ? 1 : elapsed / total };
    });
  }

  function focusedTimelineModel(gig, queue, activeIndex, zoom) {
    const full = timelineModel(gig, queue);
    if (zoom === 'all' || full.length <= Number(zoom)) return full;
    const visible = Math.max(1, Number(zoom) || 3);
    const startIndex = Math.max(0, Math.min(full.length - visible, activeIndex - Math.floor(visible / 2)));
    const window = full.slice(startIndex, startIndex + visible);
    const rangeStart = window[0].start;
    const rangeEnd = window[window.length - 1].end;
    const range = rangeEnd - rangeStart || 1;
    return window.map((item) => ({ ...item, marker: (item.start - rangeStart) / range, start: (item.start - rangeStart) / range, end: (item.end - rangeStart) / range }));
  }

  function seekTarget(model, ratio) {
    if (!model.length) return null;
    const bounded = clamp(ratio);
    let segment = model.find((item) => bounded <= item.end) || model[model.length - 1];
    if (!segment.entry.media) {
      const index = model.indexOf(segment);
      segment = model.slice(index).find((item) => item.entry.media) || [...model.slice(0, index)].reverse().find((item) => item.entry.media) || segment;
    }
    const position = segment.end > segment.start ? clamp((bounded - segment.start) / (segment.end - segment.start)) : 0;
    return { segment, fraction: position, ratio: bounded };
  }

  function progressModel(segment, mediaFraction) {
    const position = clamp(mediaFraction);
    return segment ? segment.start + ((segment.end - segment.start) * position) : 0;
  }

  return { clamp, sourceLabel, candidates, clipFor, sourcesForSong, bounds, fraction, timeAt, activateSource, entryTitle, entryKey, unknownEntry, buildQueue, nextPlayableIndex, validChapterStart, planLengths, timelineModel, focusedTimelineModel, seekTarget, progressModel };
}));
