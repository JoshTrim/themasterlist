(function exposeUploadQueue(root, factory) {
  const uploadQueue = factory();
  if (typeof module === 'object' && module.exports) module.exports = uploadQueue;
  else root.MasterListUploadQueue = uploadQueue;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createUploadQueue() {
  function createState(category = 'show') {
    return { gigId: '', category, items: [], processing: false, startTimer: null, onUploaded: null, onDrained: null, completedSinceDrain: 0, releaseAfterDrain: false };
  }

  function enqueueFiles(state, files, idFactory = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`) {
    const selected = files.filter((file) => file && file.size > 0);
    const items = selected.map((file) => ({ id: idFactory(), file, name: file.name, size: file.size, status: state.gigId ? 'queued' : 'waiting', progress: 0, error: '' }));
    state.items.push(...items);
    return items;
  }

  function bindGig(state, gigId, category = state.category) {
    state.gigId = gigId;
    state.category = category;
    state.items.filter((item) => item.status === 'waiting').forEach((item) => { item.status = 'queued'; });
    return state;
  }

  function nextQueued(state) { return state.items.find((item) => item.status === 'queued') || null; }
  function retry(state, id) { const item = state.items.find((entry) => entry.id === id); if (item) Object.assign(item, { status: 'queued', error: '', progress: 0 }); return item; }
  function clearPending(state) { state.items = state.items.filter((item) => ['uploading', 'complete'].includes(item.status)); return state; }
  function isBusy(state) { return state.items.some((item) => ['waiting', 'queued', 'uploading'].includes(item.status)); }

  function itemLabel(item) {
    if (item.status === 'waiting') return 'Waiting for show';
    if (item.status === 'queued') return 'Queued';
    if (item.status === 'uploading') return `Uploading ${Math.round(item.progress || 0)}%`;
    if (item.status === 'complete') return 'Uploaded';
    return `Failed · ${item.error || 'Try again'}`;
  }

  function queueMarkup(state, { escapeHtml = String, formatSize = String, limit = 6 } = {}) {
    return (state?.items || []).slice(-limit).map((item) => {
      const retryButton = item.status === 'error' ? `<button type="button" class="mobile-upload-retry" data-upload-item="${escapeHtml(item.id)}">Retry</button>` : '';
      return `<div class="mobile-upload-item"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(itemLabel(item))} · ${escapeHtml(formatSize(item.size))}</span>${retryButton}</div><div class="mobile-upload-bar"><i style="width:${item.progress || (item.status === 'complete' ? 100 : 0)}%"></i></div></div>`;
    }).join('');
  }

  return { createState, enqueueFiles, bindGig, nextQueued, retry, clearPending, isBusy, itemLabel, queueMarkup };
}));
