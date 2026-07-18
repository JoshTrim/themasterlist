(function exposeMediaUi(root, factory) {
  const mediaUi = factory();
  if (typeof module === 'object' && module.exports) module.exports = mediaUi;
  else root.MasterListMediaUi = mediaUi;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMediaUi() {
  function recognitionMarkup(item, songs = [], escapeHtml = String) {
    if (item.recognitionOverride) {
      const title = item.songIndex !== null && item.songIndex !== undefined && songs[item.songIndex] ? songs[item.songIndex].title : 'Unassigned';
      return `<small class="media-detection media-detection-manual">Manual override: ${escapeHtml(title)}</small>`;
    }
    if (item.recognitionStatus === 'queued') return '<small class="media-detection">Queued for track detection…</small>';
    if (item.recognitionStatus === 'running') return '<small class="media-detection">Detecting track…</small>';
    if (item.recognitionStatus === 'error') return '<small class="media-detection media-detection-error">Track detection failed</small>';
    if (!item.recognitionTitle) return '';
    const details = [item.recognitionTitle, item.recognitionArtist].filter(Boolean).join(' — ');
    const status = item.recognitionStatus === 'matched' ? ' · matched to setlist' : '';
    return `<small class="media-detection">Detected: ${escapeHtml(details)}${status}</small>`;
  }

  function workspaceState(item) {
    const uploadedVideo = String(item.mimeType || '').startsWith('video/') && item.mimeType !== 'video/youtube';
    if (item.originalExists === false) return { key: 'failed', label: 'Missing original', detail: 'The database entry exists, but its file is missing from disk.' };
    if (item.backgroundStatus === 'error' || item.recognitionStatus === 'error' || (uploadedVideo && ['error', 'not_started'].includes(item.playbackStatus))) return { key: 'failed', label: 'Needs attention', detail: item.backgroundError || item.recognitionError || item.playbackError || 'A mobile playback copy still needs to be created.' };
    if (item.backgroundStatus === 'running') return { key: 'processing', label: 'Removing background', detail: 'Creating a transparent artifact cutout.' };
    if (item.recognitionStatus === 'running') return { key: 'processing', label: 'Detecting track', detail: item.playbackStatus === 'encoding' ? 'Track detection and playback encoding are running.' : 'Listening for a matching setlist track.' };
    if (item.recognitionStatus === 'queued') return { key: 'processing', label: 'Detection queued', detail: item.playbackStatus === 'encoding' ? 'Playback encoding is also running.' : 'Waiting to identify the track.' };
    if (uploadedVideo && item.playbackStatus === 'encoding') return { key: 'processing', label: 'Encoding playback', detail: 'Creating the mobile-friendly H.264 playback copy.' };
    if (String(item.mimeType || '').startsWith('video/') && item.category !== 'artifact' && (item.songIndex === null || item.songIndex === undefined)) return { key: 'unassigned', label: 'Unassigned', detail: 'Choose the matching setlist track.' };
    return { key: 'ready', label: 'Ready', detail: item.playbackStatus === 'ready' ? 'Original and playback copy are available.' : 'Available in the show memory.' };
  }

  function workspaceTotals(media = []) {
    const totals = { all: media.length, processing: 0, failed: 0, unassigned: 0, ready: 0 };
    media.forEach((item) => { totals[workspaceState(item).key] += 1; });
    return totals;
  }

  function createSelection() {
    const ids = new Set();
    return {
      has: (id) => ids.has(id),
      toggle(id) { if (ids.has(id)) ids.delete(id); else ids.add(id); return ids.has(id); },
      clear() { ids.clear(); },
      delete(id) { ids.delete(id); },
      prune(media) { const available = new Set(media.map((item) => item.id)); for (const id of ids) if (!available.has(id)) ids.delete(id); },
      selected(media) { return media.filter((item) => ids.has(item.id)); },
      get size() { return ids.size; }
    };
  }

  function safeShowPatch(entries, { attendees = [], songs = [] } = {}) {
    const patch = { ...entries, attendees, songs };
    for (const field of ['media', 'artifacts', 'mediaFiles', 'artifactFiles']) delete patch[field];
    return patch;
  }

  return { recognitionMarkup, workspaceState, workspaceTotals, createSelection, safeShowPatch };
}));
