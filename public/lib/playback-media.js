(function exposePlaybackMedia(root, factory) {
  const media = factory();
  if (typeof module === 'object' && module.exports) module.exports = media;
  else root.MasterListPlaybackMedia = media;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPlaybackMedia() {
  function youtubeVideoId(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'youtu.be' ? parsed.pathname.split('/').filter(Boolean)[0] || '' : parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop() || '';
    } catch { return ''; }
  }

  function sourcePresentation(entry) {
    const media = entry?.media;
    const kind = media?.mimeType === 'video/youtube' ? 'YouTube' : media ? 'Your upload' : 'No source';
    const sourceIndex = Number(entry?.sourceIndex || 0);
    return {
      kind: sourceIndex ? `${kind} · Backup ${sourceIndex}` : kind,
      label: media ? (media.caption || media.filename || 'Untitled video') : 'This track will be skipped'
    };
  }

  function stageMarkup({ entry, next, songTitle, escapeHtml, youtubeEmbedUrl }) {
    const current = entry.media.mimeType === 'video/youtube'
      ? `<iframe src="${youtubeEmbedUrl(entry.media.url)}" title="${escapeHtml(songTitle)}" allowfullscreen></iframe>`
      : `<video class="set-player-current" src="${entry.media.url}" controls autoplay playsinline></video>`;
    const preload = next?.media?.id === entry.media.id ? '' : next?.media?.mimeType === 'video/youtube'
      ? `<iframe class="set-player-preload" src="${youtubeEmbedUrl(next.media.url)}" title="Preloaded next track" aria-hidden="true"></iframe>`
      : next?.media ? `<video class="set-player-preload" src="${next.media.url}" preload="auto" muted playsinline></video>` : '';
    return current + preload;
  }

  return { youtubeVideoId, sourcePresentation, stageMarkup };
}));
