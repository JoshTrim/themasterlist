'use strict';

function recognitionKey(value) {
  return String(value || '').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^a-z0-9]+/g, '');
}

function youtubeVideoId(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
    return parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop() || '';
  } catch { return ''; }
}

function isoDurationSeconds(value) {
  const match = String(value || '').match(/^P(?:([\d.]+)D)?T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/i);
  if (!match) return null;
  return (Number(match[1]) || 0) * 86400 + (Number(match[2]) || 0) * 3600 + (Number(match[3]) || 0) * 60 + (Number(match[4]) || 0);
}

function chapterSeconds(value) {
  const parts = String(value || '').split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null;
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return seconds >= 0 ? seconds : null;
}

function parsePlaybackChapters(description) {
  const timestamp = '(?:\\d{1,2}:)?\\d{1,2}:\\d{2}';
  const leading = new RegExp(`^\\s*(?:[-*#]\\s*)?(${timestamp})\\s*(?:[-–—|:]\\s*)?(.+?)\\s*$`);
  const trailing = new RegExp(`^\\s*(.+?)\\s+(?:[-–—|]\\s*)?(${timestamp})\\s*$`);
  const chapters = [];
  String(description || '').split(/\r?\n/).forEach((line) => {
    const match = line.match(leading);
    const reverse = match ? null : line.match(trailing);
    const seconds = chapterSeconds(match?.[1] || reverse?.[2]);
    const title = String(match?.[2] || reverse?.[1] || '').replace(/^\d+[.)]\s*/, '').trim();
    if (seconds !== null && title) chapters.push({ seconds, title });
  });
  return chapters.filter((chapter, index) => index === 0 || chapter.seconds > chapters[index - 1].seconds).slice(0, 200);
}

function playbackMatchTokens(value, artist = '') {
  const artistTokens = new Set(String(artist || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  const ignored = new Set(['live', 'official', 'video', 'audio', 'lyrics', 'concert', 'full', 'show', 'set', 'tour', 'feat', 'featuring', ...artistTokens]);
  return String(value || '').toLowerCase().replace(/&amp;/g, ' and ').split(/[^a-z0-9]+/).filter((token) => token && !ignored.has(token));
}

function playbackTitleScore(value, song, gig) {
  const candidateKey = recognitionKey(value);
  const songKey = recognitionKey(song.title);
  if (!candidateKey || !songKey) return 0;
  if (candidateKey === songKey) return 1;
  if (songKey.length >= 4 && candidateKey.includes(songKey)) return .94;
  const candidateTokens = new Set(playbackMatchTokens(value, song.artist || gig.artist));
  const songTokens = new Set(playbackMatchTokens(song.title));
  if (!candidateTokens.size || !songTokens.size) return 0;
  const matched = [...songTokens].filter((token) => candidateTokens.has(token)).length;
  const recall = matched / songTokens.size;
  const precision = matched / candidateTokens.size;
  return (recall * .75) + (precision * .25);
}

function bestPlaybackSong(gig, value, minimum = .55) {
  let best = null;
  (gig.songs || []).forEach((song, songIndex) => {
    const score = playbackTitleScore(value, song, gig);
    if (score >= minimum && (!best || score > best.score)) best = { songIndex, score };
  });
  return best;
}

function estimateFullShowTimings(songCount, duration, anchors = [], terminalSeconds = null) {
  const count = Number(songCount);
  const naturalEnd = Number(duration);
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(naturalEnd) || naturalEnd <= 0) return [];
  const requestedEnd = Number(terminalSeconds);
  const end = Number.isFinite(requestedEnd) && requestedEnd > 0 && requestedEnd <= naturalEnd ? requestedEnd : naturalEnd;
  const bySong = new Map();
  anchors.forEach((anchor) => {
    const songIndex = Number(anchor.songIndex);
    const seconds = Number(anchor.seconds);
    if (!Number.isInteger(songIndex) || songIndex < 0 || songIndex >= count || !Number.isFinite(seconds) || seconds < 0 || seconds >= end) return;
    const current = bySong.get(songIndex);
    if (!current || Number(anchor.weight || 0) >= Number(current.weight || 0)) bySong.set(songIndex, { ...anchor, songIndex, seconds });
  });
  const detected = [...bySong.values()].sort((a, b) => a.songIndex - b.songIndex);
  const monotonic = [];
  detected.forEach((anchor) => { if (!monotonic.length || anchor.seconds > monotonic[monotonic.length - 1].seconds) monotonic.push(anchor); });
  const realAnchorCount = monotonic.length;
  if (!monotonic.length || monotonic[0].songIndex > 0) monotonic.unshift({ songIndex: 0, seconds: 0, synthetic: true });
  monotonic.push({ songIndex: count, seconds: end, synthetic: true });
  const confidence = realAnchorCount >= 2 ? .68 : realAnchorCount === 1 ? .58 : .48;
  const reason = realAnchorCount >= 2 ? 'Interpolated between detected full-show timestamps'
    : realAnchorCount === 1 ? 'Estimated around one detected timestamp — review timing'
      : 'Estimated evenly across the full-show duration — review timing';
  const estimates = [];
  for (let anchorIndex = 0; anchorIndex < monotonic.length - 1; anchorIndex += 1) {
    const startAnchor = monotonic[anchorIndex];
    const endAnchor = monotonic[anchorIndex + 1];
    const trackSpan = endAnchor.songIndex - startAnchor.songIndex;
    const timeSpan = endAnchor.seconds - startAnchor.seconds;
    if (trackSpan <= 0 || timeSpan <= 0) continue;
    for (let songIndex = startAnchor.songIndex; songIndex < endAnchor.songIndex; songIndex += 1) {
      const offset = songIndex - startAnchor.songIndex;
      const startSeconds = startAnchor.seconds + ((timeSpan * offset) / trackSpan);
      const endSeconds = startAnchor.seconds + ((timeSpan * (offset + 1)) / trackSpan);
      estimates.push({ songIndex, startSeconds: Math.round(startSeconds * 10) / 10, endSeconds: Math.round(endSeconds * 10) / 10, confidence, reason });
    }
  }
  return estimates;
}

function suggestPlaybackPlan(gig, media) {
  const existingBySong = new Map();
  media.forEach((item) => (item.playbackClips || []).forEach((clip) => { if (!existingBySong.has(clip.songIndex)) existingBySong.set(clip.songIndex, new Set()); existingBySong.get(clip.songIndex).add(item.id); }));
  const suggestionBuckets = new Map();
  const setlistStarts = (gig.songs || []).map((song) => {
    if (song.startSeconds === null || song.startSeconds === undefined || song.startSeconds === '') return null;
    const value = Number(song.startSeconds);
    return Number.isFinite(value) && value >= 0 ? value : null;
  });
  const offer = (songIndex, item, startSeconds, endSeconds, confidence, reason) => {
    if (!Number.isInteger(songIndex) || existingBySong.get(songIndex)?.has(item.id)) return;
    if (!suggestionBuckets.has(songIndex)) suggestionBuckets.set(songIndex, new Map());
    const bucket = suggestionBuckets.get(songIndex);
    const current = bucket.get(item.id);
    if (!current || confidence > current.confidence) bucket.set(item.id, { songIndex, mediaId: item.id, startSeconds, endSeconds, confidence: Math.round(confidence * 100) / 100, reason, sourceLabel: item.caption || item.filename || 'Video', localSource: item.mimeType !== 'video/youtube' });
  };
  media.filter((item) => item.category !== 'artifact' && String(item.mimeType || '').startsWith('video/')).forEach((item) => {
    if (Number.isInteger(item.songIndex)) offer(item.songIndex, item, item.playbackStart, item.playbackEnd, .9, 'Existing track assignment');
    if (item.recognitionTitle) {
      const match = bestPlaybackSong(gig, item.recognitionTitle, .5);
      if (match) offer(match.songIndex, item, item.playbackStart, item.playbackEnd, .9 + (.08 * match.score), `AudD matched “${item.recognitionTitle}”`);
    }
    const chapters = item.mimeType === 'video/youtube' ? parsePlaybackChapters(item.sourceDescription) : [];
    const chapterMatches = [];
    chapters.forEach((chapter, chapterIndex) => {
      const match = bestPlaybackSong(gig, chapter.title, .5);
      if (!match || (chapterMatches.length && match.songIndex <= chapterMatches[chapterMatches.length - 1].songIndex)) return;
      chapterMatches.push({ ...chapter, ...match, chapterIndex });
    });
    const sourceText = `${item.caption || ''} ${item.sourceDescription || ''}`.toLowerCase();
    const artistWords = String(gig.artist || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    const venueWords = String(gig.venue || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    const duration = Number(item.sourceDuration);
    const explicitFullShow = /(?:full|complete|whole|entire)\s+(?:set|show|concert)|concert\s+(?:film|video)/.test(sourceText);
    const venueConcert = venueWords.some((word) => sourceText.includes(word)) && /concert|live\s+at|full\s+performance/.test(sourceText);
    const plausibleDuration = Number.isFinite(duration) && duration >= Math.max(8 * 60, (gig.songs || []).length * 75);
    const artistMatches = artistWords.some((word) => sourceText.includes(word));
    const looksLikeFullShow = Number.isFinite(duration) && duration > 0 && (chapterMatches.length >= 2 || (artistMatches && (explicitFullShow || (plausibleDuration && venueConcert))));
    const lastChapterMatch = chapterMatches[chapterMatches.length - 1];
    const followingChapter = lastChapterMatch ? chapters[lastChapterMatch.chapterIndex + 1] : null;
    const terminalSeconds = lastChapterMatch?.songIndex === (gig.songs || []).length - 1 ? followingChapter?.seconds : null;
    const timingAnchors = [
      ...setlistStarts.map((seconds, songIndex) => seconds === null ? null : ({ songIndex, seconds, weight: 1 })).filter(Boolean),
      ...chapterMatches.map((match) => ({ songIndex: match.songIndex, seconds: match.seconds, weight: 2 }))
    ];
    const estimates = looksLikeFullShow ? estimateFullShowTimings((gig.songs || []).length, duration, timingAnchors, terminalSeconds) : [];
    const estimateBySong = new Map(estimates.map((estimate) => [estimate.songIndex, estimate]));
    estimates.forEach((estimate) => offer(estimate.songIndex, item, estimate.startSeconds, estimate.endSeconds, estimate.confidence, estimate.reason));
    chapterMatches.forEach((match) => {
      const estimate = estimateBySong.get(match.songIndex);
      const nextChapter = chapters[match.chapterIndex + 1];
      offer(match.songIndex, item, match.seconds, estimate?.endSeconds ?? nextChapter?.seconds ?? item.sourceDuration ?? null, .74 + (.24 * match.score), `YouTube chapter “${match.title}”`);
    });
    if (looksLikeFullShow) setlistStarts.forEach((start, songIndex) => {
      if (start === null) return;
      const estimate = estimateBySong.get(songIndex);
      const next = setlistStarts.slice(songIndex + 1).find((value) => value !== null && value > start);
      offer(songIndex, item, start, estimate?.endSeconds ?? next ?? item.sourceDuration ?? null, .72, 'Setlist timestamp matched to a full-show video');
    });
    const titleMatch = bestPlaybackSong(gig, item.caption, .62);
    if (titleMatch) offer(titleMatch.songIndex, item, item.playbackStart, item.playbackEnd, .58 + (.28 * titleMatch.score), 'Video title matches the setlist');
    if (!chapters.length && item.sourceDescription) {
      String(item.sourceDescription).split(/\r?\n/).filter((line) => line.trim().length >= 3 && line.trim().length <= 140).slice(0, 100).forEach((line) => {
        const match = bestPlaybackSong(gig, line, .82);
        if (match) offer(match.songIndex, item, item.playbackStart, item.playbackEnd, .55 + (.2 * match.score), `Video description mentions “${line.trim()}”`);
      });
    }
  });
  return [...suggestionBuckets.entries()].map(([songIndex, bucket]) => {
    const ranked = [...bucket.values()].sort((a, b) => b.confidence - a.confidence || Number(b.localSource) - Number(a.localSource)).slice(0, 4);
    const primary = ranked.shift();
    return { ...primary, fallbackOnly: existingBySong.has(songIndex), alternatives: ranked };
  }).sort((a, b) => a.songIndex - b.songIndex);
}

module.exports = {
  recognitionKey,
  youtubeVideoId,
  isoDurationSeconds,
  chapterSeconds,
  parsePlaybackChapters,
  playbackMatchTokens,
  playbackTitleScore,
  bestPlaybackSong,
  estimateFullShowTimings,
  suggestPlaybackPlan
};
