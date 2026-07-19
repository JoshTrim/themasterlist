(function initMediaWorkspaceController(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListMediaWorkspaceController = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function mediaWorkspaceControllerFactory() {
  function statsMarkup(totals) {
    return `<span><b>${totals.all}</b>Total</span><span><b>${totals.processing}</b>Processing</span><span><b>${totals.failed}</b>Needs attention</span><span><b>${totals.unassigned}</b>Unassigned</span><span><b>${totals.ready}</b>Ready</span>`;
  }

  function createController({
    document, fetchJson, escapeHtml, formatSize, mediaUi, mediaJobs, updateJob,
    pollRecognition, renderGallery, renderPlaybackEditor, elements
  }) {
    const { gallery, stats, filters, empty, refreshButton } = elements;
    let filter = 'all';
    let activeGig = null;

    function applyFilter() {
      if (!gallery || !empty) return 0;
      let visible = 0;
      gallery.querySelectorAll('.media-item').forEach((card) => {
        const show = filter === 'all' || card.dataset.processingState === filter;
        card.hidden = !show;
        if (show) visible += 1;
      });
      empty.hidden = visible > 0;
      filters?.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.mediaFilter === filter));
      return visible;
    }

    async function refresh(gig = activeGig) {
      if (!gig) return [];
      const media = await fetchJson(`/api/gigs/${gig.id}/media`);
      gig.media = media;
      render(gig, media);
      return media;
    }

    function decorate(container, media, gig) {
      stats.innerHTML = statsMarkup(mediaUi.workspaceTotals(media));
      container.querySelectorAll('.media-item').forEach((card) => {
        const item = media.find((entry) => entry.id === card.dataset.mediaId);
        if (!item) return;
        const state = mediaUi.workspaceState(item);
        card.dataset.processingState = state.key;
        const health = document.createElement('div');
        health.className = `media-processing-state is-${state.key}`;
        const sizeLine = item.mimeType === 'video/youtube' ? 'YouTube embed' : `${formatSize(item.size || 0)} original${item.playbackSize ? ` · ${formatSize(item.playbackSize)} playback` : ''}`;
        health.innerHTML = `<div><span class="media-processing-badge">${escapeHtml(state.label)}</span><small>${escapeHtml(sizeLine)}</small></div><p>${escapeHtml(state.detail)}</p><div class="media-processing-actions"></div>`;
        const actions = health.querySelector('.media-processing-actions');
        const uploadedVideo = String(item.mimeType || '').startsWith('video/') && item.mimeType !== 'video/youtube';
        if (uploadedVideo && item.originalExists !== false && ['error', 'not_started'].includes(item.playbackStatus)) {
          const retryEncode = document.createElement('button');
          retryEncode.type = 'button';
          retryEncode.textContent = item.playbackStatus === 'not_started' ? 'Create playback copy' : 'Retry playback copy';
          retryEncode.addEventListener('click', async () => {
            retryEncode.disabled = true;
            retryEncode.textContent = 'Queued…';
            try {
              const job = await fetchJson(`/api/media/${item.id}/retry-encode`, { method: 'POST' });
              updateJob(job.jobId, { id: job.jobId, type: 'Encode video', name: item.caption || item.filename, status: 'running', progress: 1 });
              const status = await mediaJobs.poll({ fetchStatus: () => fetchJson(`/api/jobs/${job.jobId}`), onUpdate: (current) => updateJob(job.jobId, current) });
              if (status.status === 'error') throw new Error(status.error || 'Playback encoding failed.');
              await refresh(gig);
            } catch (error) { retryEncode.disabled = false; retryEncode.textContent = error.message; }
          });
          actions.append(retryEncode);
        }
        if (uploadedVideo && item.originalExists !== false && !['queued', 'running'].includes(item.recognitionStatus)) {
          const detect = document.createElement('button');
          detect.type = 'button';
          detect.textContent = item.recognitionStatus === 'error' ? 'Retry audio detection' : item.recognitionTitle ? 'Detect audio again' : 'Detect audio';
          detect.addEventListener('click', async () => {
            detect.disabled = true;
            detect.textContent = 'Detecting…';
            try {
              await fetchJson(`/api/media/${item.id}/retry-recognition`, { method: 'POST' });
              await pollRecognition(gig.id, (mediaUpdate) => { gig.media = mediaUpdate; render(gig, mediaUpdate); });
            } catch (error) { detect.disabled = false; detect.textContent = error.message; }
          });
          actions.append(detect);
        }
        if (!actions.childElementCount) actions.remove();
        card.querySelector('figcaption')?.insertAdjacentElement('afterend', health);
      });
      applyFilter();
    }

    function render(gig, media = []) {
      if (!gallery || !stats) return;
      activeGig = gig;
      gig.media = media;
      renderGallery(gallery, media, {
        editable: true,
        songs: gig.songs || [],
        onDelete: (removed) => { const ids = new Set(removed.map((item) => item.id)); gig.media = gig.media.filter((item) => !ids.has(item.id)); },
        afterRender: (container, current) => { decorate(container, current, gig); renderPlaybackEditor(gig); }
      });
    }

    function bind() {
      filters?.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { filter = button.dataset.mediaFilter; applyFilter(); }));
      refreshButton?.addEventListener('click', async () => {
        refreshButton.disabled = true;
        refreshButton.textContent = 'Refreshing…';
        try { await refresh(); }
        finally { refreshButton.disabled = false; refreshButton.textContent = 'Refresh status'; }
      });
    }

    return { applyFilter, refresh, decorate, render, bind, getFilter: () => filter, getGig: () => activeGig };
  }

  return { statsMarkup, createController };
}));
