(function initMobileUploadController(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListMobileUploadController = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function mobileUploadControllerFactory() {
  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function createController({
    document, navigator, isMobile, queue, uploadFiles, pendingFiles, escapeHtml,
    setTimeoutFn = globalThis.setTimeout, clearTimeoutFn = globalThis.clearTimeout
  }) {
    const states = new WeakMap();
    const renderTimers = new WeakMap();
    let wakeLock = null;
    let activeWakeLockUsers = 0;

    async function retainWakeLock() {
      if (!isMobile() || !navigator.wakeLock) return;
      activeWakeLockUsers += 1;
      if (wakeLock) return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener?.('release', () => { wakeLock = null; });
      } catch { wakeLock = null; }
    }

    function releaseWakeLock() {
      if (!isMobile()) return;
      activeWakeLockUsers = Math.max(0, activeWakeLockUsers - 1);
      if (!activeWakeLockUsers && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    }

    function stateFor(input, gigId = '', category = 'show') {
      let state = states.get(input);
      if (!state) { state = queue.createState(category); states.set(input, state); }
      if (gigId) queue.bindGig(state, gigId, category);
      else if (category) state.category = category;
      return state;
    }

    function statusContainer(input) { return input?.closest('.media-upload')?.querySelector('.media-upload-status'); }

    function scheduleRender(input, state = states.get(input), immediate = false) {
      const timer = renderTimers.get(input);
      if (immediate && timer) { clearTimeoutFn(timer); renderTimers.delete(input); }
      if (immediate) { render(input, state); return; }
      if (timer) return;
      renderTimers.set(input, setTimeoutFn(() => { renderTimers.delete(input); render(input, state); }, 180));
    }

    function render(input, state = states.get(input)) {
      const container = statusContainer(input);
      if (!container) return;
      const items = state?.items?.slice(-6) || [];
      container.hidden = !items.length;
      if (!items.length) { container.replaceChildren(); return; }
      container.innerHTML = queue.queueMarkup(state, { escapeHtml, formatSize });
      container.querySelectorAll('.mobile-upload-retry').forEach((button) => button.addEventListener('click', () => {
        const item = queue.retry(state, button.dataset.uploadItem);
        if (!item) return;
        render(input, state);
        process(input, state);
      }));
    }

    function queueFiles(input, files) {
      const state = stateFor(input);
      const selectedFiles = files.filter((file) => file && file.size > 0);
      if (!selectedFiles.length) return [];
      const items = queue.enqueueFiles(state, selectedFiles);
      if (!state.gigId) pendingFiles.set(input, [...(pendingFiles.get(input) || []), ...selectedFiles]);
      render(input, state);
      if (state.gigId && !state.startTimer) {
        state.startTimer = setTimeoutFn(() => { state.startTimer = null; process(input, state); }, 200);
      }
      return items;
    }

    async function process(input, state = states.get(input)) {
      if (!state?.gigId || state.processing) return state?.runningPromise;
      state.processing = true;
      await retainWakeLock();
      state.runningPromise = (async () => {
        while (true) {
          const item = queue.nextQueued(state);
          if (!item) break;
          Object.assign(item, { status: 'uploading', progress: 0 });
          render(input, state);
          try {
            await uploadFiles(state.gigId, [item.file], (_file, fraction) => { item.progress = fraction * 100; scheduleRender(input, state); }, state.category);
            Object.assign(item, { status: 'complete', progress: 100, file: null });
            render(input, state);
            state.completedSinceDrain += 1;
            if (state.onUploaded) { try { await state.onUploaded(item); } catch { /* upload remains successful if a view refresh fails */ } }
          } catch (error) {
            Object.assign(item, { status: 'error', error: error.message });
            render(input, state);
          }
        }
      })().finally(() => {
        state.processing = false;
        state.runningPromise = null;
        const hasQueued = state.items.some((item) => ['queued', 'waiting', 'uploading'].includes(item.status));
        const needsRetry = state.items.some((item) => ['queued', 'error'].includes(item.status));
        if (!hasQueued && state.completedSinceDrain && state.onDrained) {
          const completedCount = state.completedSinceDrain;
          state.completedSinceDrain = 0;
          Promise.resolve(state.onDrained(completedCount)).catch(() => {});
        }
        if (state.releaseAfterDrain && !needsRetry) { state.gigId = ''; state.releaseAfterDrain = false; }
        releaseWakeLock();
        render(input, state);
      });
      return state.runningPromise;
    }

    function start(input, gigId, onUploaded, onDrained, category = 'show') {
      const state = stateFor(input, gigId, category);
      state.onUploaded = onUploaded || state.onUploaded;
      state.onDrained = onDrained || state.onDrained;
      queue.bindGig(state, gigId, category);
      pendingFiles.set(input, []);
      render(input, state);
      return process(input, state);
    }

    function setup(input, category = 'show') {
      if (!input || !isMobile()) return;
      pendingFiles.set(input, []);
      stateFor(input, '', category);
      input.addEventListener('change', () => {
        const files = [...(input.files || [])];
        input.value = '';
        queueFiles(input, files);
      });
    }

    function addClearButton(input) {
      if (!input) return null;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-secondary file-clear';
      button.textContent = 'Clear queued files';
      button.addEventListener('click', () => {
        input.value = '';
        if (pendingFiles.has(input)) pendingFiles.set(input, []);
        const state = states.get(input);
        if (!state) return;
        if (state.startTimer) { clearTimeoutFn(state.startTimer); state.startTimer = null; }
        queue.clearPending(state);
        if (!state.items.some((item) => item.status === 'uploading')) { state.gigId = ''; state.releaseAfterDrain = false; }
        render(input, state);
      });
      input.insertAdjacentElement('afterend', button);
      return button;
    }

    function isBusy(input) { const state = states.get(input); return Boolean(state && queue.isBusy(state)); }

    function bind() {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && activeWakeLockUsers && !wakeLock) retainWakeLock();
      });
    }

    return { stateFor, render, scheduleRender, queueFiles, process, start, setup, addClearButton, isBusy, bind };
  }

  return { formatSize, createController };
}));
