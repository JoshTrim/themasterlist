(function initPlaybackEditorController(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListPlaybackEditorController = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function playbackEditorControllerFactory() {
  function createController({
    document, fetchJson, escapeHtml, formatPlaybackTime, youtubeEmbedUrl, loadYouTubeApi,
    playbackCore, playbackEditor, getGigs, onGigs, editGigId,
    EventClass = Event, setIntervalFn = globalThis.setInterval, clearIntervalFn = globalThis.clearInterval,
    now = () => Date.now(), elements
  }) {
    const {
      list: playbackEditorList, health: playbackEditorHealth, suggestions: playbackEditorSuggestions,
      message: playbackEditorMessage, suggestButton: autoBuildPlaybackPlan, saveButton: savePlaybackPlan
    } = elements;
    let activeGig = null;

    function playbackSourceLabel(item) {
      return playbackCore.sourceLabel(item);
    }

    function playbackCandidates(gig) {
      return playbackCore.candidates(gig);
    }

    function playbackClipFor(item, songIndex) {
      return playbackCore.clipFor(item, songIndex);
    }

    function playbackSourcesForSong(gig, songIndex) {
      return playbackCore.sourcesForSong(gig, songIndex);
    }

    function playbackFallbackOptions(gig, selectedId = '') {
      return playbackEditor.fallbackOptions(gig, selectedId, { candidates: playbackCandidates, sourceLabel: playbackSourceLabel, escapeHtml });
    }

    function playbackFallbackMarkup(gig, entry = {}) {
      return playbackEditor.fallbackMarkup(gig, entry, { candidates: playbackCandidates, sourceLabel: playbackSourceLabel, escapeHtml });
    }

    function refreshPlaybackFallbacks(row) {
      const fallbacks = [...row.querySelectorAll('.playback-fallback-row')];
      fallbacks.forEach((fallback, index) => { fallback.querySelector('.playback-fallback-rank').textContent = `Backup ${index + 1}`; });
      row.querySelector('.playback-fallback-count').textContent = fallbacks.length ? String(fallbacks.length) : 'None';
      const primary = row.querySelector('.playback-source');
      row.querySelector('.add-playback-fallback').disabled = !primary.value || primary.options.length <= 2 || fallbacks.length >= 7;
    }

    function setupPlaybackFallbackEditor(gig, row) {
      const list = row.querySelector('.playback-fallback-list');
      const add = row.querySelector('.add-playback-fallback');
      const changed = () => { refreshPlaybackFallbacks(row); playbackEditorHealthCheck(gig); };
      add.addEventListener('click', () => {
        if (!row.querySelector('.playback-source').value) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = playbackFallbackMarkup(gig);
        list.append(wrapper.firstElementChild);
        changed();
      });
      list.addEventListener('input', changed);
      list.addEventListener('change', changed);
      list.addEventListener('click', (event) => {
        const button = event.target.closest('[data-fallback-action]');
        if (!button) return;
        const fallback = button.closest('.playback-fallback-row');
        if (button.dataset.fallbackAction === 'remove') fallback.remove();
        if (button.dataset.fallbackAction === 'up' && fallback.previousElementSibling) list.insertBefore(fallback, fallback.previousElementSibling);
        if (button.dataset.fallbackAction === 'down' && fallback.nextElementSibling) list.insertBefore(fallback.nextElementSibling, fallback);
        changed();
      });
      refreshPlaybackFallbacks(row);
    }

    let activePlaybackEditorPreview = null;
    function closePlaybackEditorPreview() {
      if (!activePlaybackEditorPreview) return;
      clearIntervalFn(activePlaybackEditorPreview.timer);
      try { activePlaybackEditorPreview.player?.destroy?.(); } catch {}
      activePlaybackEditorPreview.video?.pause?.();
      const preview = activePlaybackEditorPreview.row?.querySelector('.playback-preview');
      if (preview) { preview.hidden = true; preview.querySelector('.playback-preview-stage').innerHTML = ''; }
      activePlaybackEditorPreview.row?.querySelector('.playback-preview-toggle')?.setAttribute('aria-expanded', 'false');
      activePlaybackEditorPreview = null;
    }

    function playbackEditorRowSources(gig, row) {
      return playbackEditor.rowSources(gig, row);
    }

    function playbackEditorRows(gig) {
      return playbackEditor.rowsFromList(gig, playbackEditorList);
    }

    function playbackEditorHealthCheck(gig) {
      const editorRows = playbackEditorRows(gig);
      const health = playbackEditor.validatePlan(gig.songs || [], editorRows);
      health.rows.forEach((result) => {
        const row = editorRows.find((entry) => entry.songIndex === result.songIndex).element;
        const rowHealth = row.querySelector('.playback-row-health');
        row.classList.remove('is-invalid', 'has-warning'); rowHealth.textContent = '';
        if (result.errors.length) { row.classList.add('is-invalid'); rowHealth.textContent = result.errors.join(' '); }
        else if (result.warnings.length) { row.classList.add('has-warning'); rowHealth.textContent = result.warnings.join(' '); }
      });
      playbackEditorHealth.innerHTML = playbackEditor.healthMarkup(health, editorRows.length);
      savePlaybackPlan.disabled = Boolean(health.errors.length); savePlaybackPlan.title = health.errors[0] || '';
      return health;
    }
    function openPlaybackEditorPreview(gig, row) {
      if (activePlaybackEditorPreview?.row === row) { closePlaybackEditorPreview(); return; }
      closePlaybackEditorPreview();
      const media = (gig.media || []).find((item) => item.id === row.querySelector('.playback-source').value);
      if (!media) return;
      const preview = row.querySelector('.playback-preview');
      const stage = preview.querySelector('.playback-preview-stage');
      const time = preview.querySelector('.playback-preview-time');
      const toggle = row.querySelector('.playback-preview-toggle');
      row.dataset.previewUnavailable = '';
      preview.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      let currentTime = 0;
      let duration = 0;
      const updateTime = () => { time.textContent = `${formatPlaybackTime(currentTime)}${duration ? ` / ${formatPlaybackTime(duration)}` : ''}`; };
      const setDuration = (value) => { duration = Number(value) || 0; row.dataset.mediaDuration = duration || ''; playbackEditorHealthCheck(gig); updateTime(); };
      const previewState = { row, player: null, video: null, timer: null, current: () => currentTime, seek: () => {} };
      const markUnavailable = () => { row.dataset.previewUnavailable = 'true'; time.textContent = 'Video preview unavailable.'; playbackEditorHealthCheck(gig); };
      activePlaybackEditorPreview = previewState;
      if (media.mimeType === 'video/youtube') {
        const frameId = `playback-editor-youtube-${now()}`;
        stage.innerHTML = `<iframe id="${frameId}" src="${youtubeEmbedUrl(media.url)}" title="Preview ${escapeHtml(playbackSourceLabel(media))}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        loadYouTubeApi().then((YT) => {
          if (activePlaybackEditorPreview !== previewState) return;
          previewState.player = new YT.Player(frameId, { events: { onReady: (event) => { setDuration(event.target.getDuration()); const start = Number(row.querySelector('.playback-start').value) || 0; if (start) event.target.seekTo(start, true); }, onError: markUnavailable } });
          previewState.seek = (seconds) => previewState.player?.seekTo?.(seconds, true);
          previewState.timer = setIntervalFn(() => { currentTime = Number(previewState.player?.getCurrentTime?.()) || 0; if (!duration) setDuration(previewState.player?.getDuration?.()); else updateTime(); }, 250);
        }).catch(markUnavailable);
      } else {
        stage.innerHTML = `<video src="${escapeHtml(media.url)}" controls preload="metadata" playsinline></video>`;
        const video = stage.querySelector('video');
        previewState.video = video;
        previewState.seek = (seconds) => { video.currentTime = seconds; };
        video.addEventListener('loadedmetadata', () => { setDuration(video.duration); const start = Number(row.querySelector('.playback-start').value) || 0; if (start) video.currentTime = start; });
        video.addEventListener('timeupdate', () => { currentTime = video.currentTime; updateTime(); });
        video.addEventListener('error', markUnavailable, { once: true });
      }
      preview.querySelector('.set-preview-start').onclick = () => { row.querySelector('.playback-start').value = currentTime.toFixed(1); playbackEditorHealthCheck(gig); };
      preview.querySelector('.set-preview-end').onclick = () => { row.querySelector('.playback-end').value = currentTime.toFixed(1); playbackEditorHealthCheck(gig); };
      preview.querySelector('.jump-preview-start').onclick = () => previewState.seek(Math.max(0, Number(row.querySelector('.playback-start').value) || 0));
      preview.querySelector('.jump-preview-end').onclick = () => { const end = Number(row.querySelector('.playback-end').value); if (Number.isFinite(end) && end > 0) previewState.seek(end); };
      updateTime();
    }

    let playbackSuggestionState = { gigId: '', suggestions: [], metadataWarning: '' };
    let playbackEditorRenderedGigId = '';
    function capturePlaybackEditorDraft(gigId) {
      if (playbackEditorRenderedGigId !== gigId || !playbackEditorList?.querySelector('.playback-editor-row')) return null;
      return [...playbackEditorList.querySelectorAll('.playback-editor-row')].map((row) => ({
        songIndex: Number(row.dataset.songIndex),
        sources: playbackEditorRowSources({ media: activeGig?.media || [] }, row).filter((source) => source.media).map((source) => ({
          mediaId: source.media.id,
          startValue: source.startValue,
          endValue: source.endValue,
          priority: source.priority
        }))
      }));
    }
    function restorePlaybackEditorDraft(gig, draft) {
      if (!draft) return;
      draft.forEach((entry) => {
        const row = playbackEditorList.querySelector(`.playback-editor-row[data-song-index="${entry.songIndex}"]`);
        const primary = entry.sources.find((source) => source.priority === 0);
        if (!row) return;
        const select = row.querySelector('.playback-source');
        const fallbackList = row.querySelector('.playback-fallback-list');
        fallbackList.replaceChildren();
        if (!primary) {
          select.value = '';
          select.dispatchEvent(new EventClass('change'));
          refreshPlaybackFallbacks(row);
          return;
        }
        if (![...select.options].some((option) => option.value === primary.mediaId)) return;
        select.value = primary.mediaId;
        select.dispatchEvent(new EventClass('change'));
        row.querySelector('.playback-start').value = primary.startValue;
        row.querySelector('.playback-end').value = primary.endValue;
        entry.sources.filter((source) => source.priority > 0).sort((a, b) => a.priority - b.priority).forEach((source) => {
          const media = (gig.media || []).find((item) => item.id === source.mediaId);
          if (!media) return;
          const wrapper = document.createElement('div');
          wrapper.innerHTML = playbackFallbackMarkup(gig, { media, clip: { startSeconds: source.startValue, endSeconds: source.endValue } });
          fallbackList.append(wrapper.firstElementChild);
        });
        refreshPlaybackFallbacks(row);
      });
    }
    function playbackSuggestionConfidence(suggestion) {
      return playbackEditor.suggestionConfidence(suggestion);
    }
    function playbackSuggestionTiming(suggestion) {
      return playbackEditor.suggestionTiming(suggestion, formatPlaybackTime);
    }
    function addSuggestedPlaybackFallback(gig, row, suggestion) {
      const media = (gig.media || []).find((item) => item.id === suggestion.mediaId);
      if (!media || !row.querySelector('.playback-source').value || row.querySelectorAll('.playback-fallback-row').length >= 7) return false;
      const used = new Set([row.querySelector('.playback-source').value, ...[...row.querySelectorAll('.playback-fallback-source')].map((select) => select.value)]);
      if (used.has(media.id)) return false;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = playbackFallbackMarkup(gig, { media, clip: suggestion });
      row.querySelector('.playback-fallback-list').append(wrapper.firstElementChild);
      row.querySelector('.playback-fallback-editor').open = true;
      refreshPlaybackFallbacks(row);
      return true;
    }
    function applyPlaybackSuggestion(gig, suggestion, withAlternatives = false) {
      const row = playbackEditorList.querySelector(`.playback-editor-row[data-song-index="${suggestion.songIndex}"]`);
      if (!row) return false;
      let applied = false;
      if (suggestion.fallbackOnly) applied = addSuggestedPlaybackFallback(gig, row, suggestion);
      else {
        const select = row.querySelector('.playback-source');
        if (![...select.options].some((option) => option.value === suggestion.mediaId)) return false;
        select.value = suggestion.mediaId;
        select.dispatchEvent(new EventClass('change'));
        row.querySelector('.playback-start').value = suggestion.startSeconds ?? '';
        row.querySelector('.playback-end').value = suggestion.endSeconds ?? '';
        applied = true;
      }
      if (withAlternatives) (suggestion.alternatives || []).filter((item) => item.confidence >= .65).forEach((item) => { if (addSuggestedPlaybackFallback(gig, row, item)) applied = true; });
      if (!applied) return false;
      row.classList.add('suggestion-applied');
      playbackSuggestionState.suggestions = playbackSuggestionState.suggestions.filter((item) => item.songIndex !== suggestion.songIndex);
      playbackEditorHealthCheck(gig);
      return applied;
    }
    function renderPlaybackSuggestions(gig) {
      playbackEditorList.querySelectorAll('.playback-suggestion').forEach((element) => element.remove());
      if (playbackSuggestionState.gigId !== gig.id) { playbackEditorSuggestions.innerHTML = ''; return; }
      const suggestions = playbackSuggestionState.suggestions;
      if (!suggestions.length) {
        playbackEditorSuggestions.innerHTML = `<p>${playbackSuggestionState.metadataWarning ? escapeHtml(playbackSuggestionState.metadataWarning) : 'No unapplied suggestions remain.'}</p>`;
        return;
      }
      const safeSuggestions = suggestions.filter((suggestion) => {
        if (suggestion.confidence < .75) return false;
        const row = playbackEditorList.querySelector(`.playback-editor-row[data-song-index="${suggestion.songIndex}"]`);
        if (!row) return false;
        const selected = row.querySelector('.playback-source').value;
        const hasTiming = row.querySelector('.playback-start').value !== '' || row.querySelector('.playback-end').value !== '';
        if (suggestion.fallbackOnly) return Boolean(selected) && !playbackEditorRowSources(gig, row).some((source) => source.media?.id === suggestion.mediaId);
        return !selected || (selected === suggestion.mediaId && !hasTiming);
      });
      const timingEstimates = suggestions.filter((suggestion) => /estimated|interpolated/i.test(suggestion.reason || ''));
      playbackEditorSuggestions.innerHTML = `<div><strong>${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'} ready to review</strong><small>${playbackSuggestionState.metadataWarning ? escapeHtml(playbackSuggestionState.metadataWarning) : 'Manual clips have been left untouched. Timing estimates remain editable until you save.'}</small></div>${timingEstimates.length ? `<button type="button" class="button button-secondary apply-timing-estimates">Apply ${timingEstimates.length} timing estimate${timingEstimates.length === 1 ? '' : 's'}</button>` : ''}${safeSuggestions.length ? `<button type="button" class="button button-secondary apply-safe-suggestions">Apply ${safeSuggestions.length} safe suggestion${safeSuggestions.length === 1 ? '' : 's'}</button>` : ''}`;
      suggestions.forEach((suggestion) => {
        const row = playbackEditorList.querySelector(`.playback-editor-row[data-song-index="${suggestion.songIndex}"]`);
        if (!row) return;
        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'playback-suggestion';
        const alternatives = (suggestion.alternatives || []).filter((item) => item.confidence >= .65);
        suggestionElement.innerHTML = `<div><span>${suggestion.fallbackOnly ? 'Fallback candidate' : playbackSuggestionConfidence(suggestion)} · ${Math.round(suggestion.confidence * 100)}%</span><strong>${escapeHtml(suggestion.sourceLabel)}</strong><small>${escapeHtml(playbackSuggestionTiming(suggestion))} · ${escapeHtml(suggestion.reason)}${alternatives.length ? ` · ${alternatives.length} additional source${alternatives.length === 1 ? '' : 's'}` : ''}</small></div><div><button type="button" class="apply-playback-suggestion">${suggestion.fallbackOnly ? 'Add backup' : 'Apply'}</button>${alternatives.length ? `<button type="button" class="apply-playback-suggestion-all">${suggestion.fallbackOnly ? 'Add all' : 'Apply + backups'}</button>` : ''}<button type="button" class="dismiss-playback-suggestion">Dismiss</button></div>`;
        row.querySelector('.playback-preview').insertAdjacentElement('beforebegin', suggestionElement);
        suggestionElement.querySelector('.apply-playback-suggestion').addEventListener('click', () => { applyPlaybackSuggestion(gig, suggestion); renderPlaybackSuggestions(gig); });
        suggestionElement.querySelector('.apply-playback-suggestion-all')?.addEventListener('click', () => { applyPlaybackSuggestion(gig, suggestion, true); renderPlaybackSuggestions(gig); });
        suggestionElement.querySelector('.dismiss-playback-suggestion').addEventListener('click', () => { playbackSuggestionState.suggestions = playbackSuggestionState.suggestions.filter((item) => item.songIndex !== suggestion.songIndex); renderPlaybackSuggestions(gig); });
      });
      playbackEditorSuggestions.querySelector('.apply-safe-suggestions')?.addEventListener('click', () => {
        let applied = 0;
        safeSuggestions.forEach((suggestion) => { if (applyPlaybackSuggestion(gig, suggestion)) applied += 1; });
        playbackEditorMessage.textContent = `${applied} suggestion${applied === 1 ? '' : 's'} applied. Review the plan, then save it.`;
        playbackEditorMessage.classList.remove('error');
        renderPlaybackSuggestions(gig);
      });
      playbackEditorSuggestions.querySelector('.apply-timing-estimates')?.addEventListener('click', () => {
        let applied = 0;
        timingEstimates.forEach((suggestion) => { if (applyPlaybackSuggestion(gig, suggestion)) applied += 1; });
        playbackEditorMessage.textContent = `${applied} full-show timing estimate${applied === 1 ? '' : 's'} applied. Preview the boundaries, then save the plan.`;
        playbackEditorMessage.classList.remove('error');
        renderPlaybackSuggestions(gig);
      });
    }

    function renderPlaybackEditor(gig) {
      if (!playbackEditorList) return;
      const playbackDraft = capturePlaybackEditorDraft(gig.id);
      activeGig = gig;
      closePlaybackEditorPreview();
      const songs = gig.songs || [];
      if (!songs.length) { playbackEditorRenderedGigId = gig.id; playbackEditorHealth.innerHTML = ''; playbackEditorList.innerHTML = '<p class="empty-state">Add a setlist before building the playback plan.</p>'; savePlaybackPlan.disabled = true; return; }
      savePlaybackPlan.disabled = false;
      playbackEditorList.innerHTML = songs.map((song, songIndex) => {
        const candidates = playbackCandidates(gig, songIndex);
        const sources = playbackSourcesForSong(gig, songIndex);
        const selectedEntry = sources[0] || null;
        const selected = selectedEntry?.media || null;
        const clip = selectedEntry?.clip || null;
        const fallbacks = sources.slice(1);
        return `<div class="playback-editor-row${selected ? '' : ' is-gap'}" data-song-index="${songIndex}"><span class="playback-editor-number">${songIndex + 1}</span><div class="playback-editor-track"><strong>${escapeHtml(song.title)}</strong><small>${selected ? escapeHtml(playbackSourceLabel(selected)) : 'Missing video · skipped during playback'}</small><button class="playback-preview-toggle" type="button" aria-expanded="false" ${selected ? '' : 'disabled'}>▶ Preview &amp; set points</button></div><label class="playback-source-field">Primary source<select class="playback-source" ${candidates.length ? '' : 'disabled'}><option value="">No video · skip track</option>${candidates.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected?.id ? 'selected' : ''}>${escapeHtml(playbackSourceLabel(item))}</option>`).join('')}</select></label><label class="playback-start-field">Start<input class="playback-start" type="number" min="0" step="0.1" inputmode="decimal" value="${clip?.startSeconds ?? selected?.playbackStart ?? ''}" placeholder="0:00" ${selected ? '' : 'disabled'} /></label><label class="playback-end-field">End<input class="playback-end" type="number" min="0" step="0.1" inputmode="decimal" value="${clip?.endSeconds ?? selected?.playbackEnd ?? ''}" placeholder="Video end" ${selected ? '' : 'disabled'} /></label><details class="playback-fallback-editor"><summary>Fallback sources <span class="playback-fallback-count">${fallbacks.length || 'None'}</span></summary><div class="playback-fallback-list">${fallbacks.map((entry) => playbackFallbackMarkup(gig, entry)).join('')}</div><button class="add-playback-fallback" type="button" ${candidates.length > 1 ? '' : 'disabled'}>+ Add fallback</button></details><p class="playback-row-health" aria-live="polite"></p><div class="playback-preview" hidden><div class="playback-preview-stage"></div><div class="playback-preview-toolbar"><output class="playback-preview-time">0:00</output><button type="button" class="set-preview-start">Set start here</button><button type="button" class="set-preview-end">Set end here</button><button type="button" class="jump-preview-start">Jump to start</button><button type="button" class="jump-preview-end">Jump to end</button></div></div></div>`;
      }).join('');
      playbackEditorList.querySelectorAll('.playback-source').forEach((select) => select.addEventListener('change', () => {
        const row = select.closest('.playback-editor-row');
        if (activePlaybackEditorPreview?.row === row) closePlaybackEditorPreview();
        const songIndex = Number(row.dataset.songIndex);
        const item = (gig.media || []).find((entry) => entry.id === select.value);
        const clip = playbackClipFor(item, songIndex);
        row.dataset.mediaDuration = '';
        row.dataset.previewUnavailable = '';
        row.querySelector('.playback-start').value = clip?.startSeconds ?? item?.playbackStart ?? '';
        row.querySelector('.playback-end').value = clip?.endSeconds ?? item?.playbackEnd ?? '';
        row.querySelector('.playback-start').disabled = !item;
        row.querySelector('.playback-end').disabled = !item;
        row.querySelector('.playback-preview-toggle').disabled = !item;
        row.querySelector('.add-playback-fallback').disabled = !item || playbackCandidates(gig).length <= 1;
        row.querySelectorAll('.playback-fallback-row').forEach((fallback) => { if (fallback.querySelector('.playback-fallback-source').value === item?.id) fallback.remove(); });
        refreshPlaybackFallbacks(row);
        row.querySelector('.playback-editor-track small').textContent = item ? playbackSourceLabel(item) : 'Missing video · skipped during playback';
        row.classList.toggle('is-gap', !item);
        playbackEditorHealthCheck(gig);
      }));
      restorePlaybackEditorDraft(gig, playbackDraft);
      playbackEditorRenderedGigId = gig.id;
      playbackEditorList.querySelectorAll('.playback-editor-row').forEach((row) => setupPlaybackFallbackEditor(gig, row));
      playbackEditorList.querySelectorAll('.playback-preview-toggle').forEach((button) => button.addEventListener('click', () => openPlaybackEditorPreview(gig, button.closest('.playback-editor-row'))));
      playbackEditorList.querySelectorAll('.playback-start, .playback-end').forEach((input) => input.addEventListener('input', () => playbackEditorHealthCheck(gig)));
      playbackEditorHealthCheck(gig);
      renderPlaybackSuggestions(gig);
      savePlaybackPlan.onclick = async () => {
        const health = playbackEditorHealthCheck(gig);
        if (health.errors.length) { playbackEditorMessage.textContent = health.errors[0]; playbackEditorMessage.classList.add('error'); return; }
        savePlaybackPlan.disabled = true;
        playbackEditorMessage.textContent = 'Saving playback plan…'; playbackEditorMessage.classList.remove('error');
        try {
          const clips = playbackEditor.clipsFromRows(playbackEditorRows(gig));
          const updated = await fetchJson(`/api/gigs/${gig.id}/playback-plan`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clips }) });
          gig.media = updated.media;
          onGigs(getGigs().map((entry) => entry.id === gig.id ? gig : entry));
          if (playbackSuggestionState.gigId === gig.id) {
            const savedSongIndexes = new Set(clips.map((clip) => clip.songIndex));
            playbackSuggestionState.suggestions = playbackSuggestionState.suggestions.filter((suggestion) => !savedSongIndexes.has(suggestion.songIndex));
          }
          playbackEditorMessage.textContent = 'Playback plan saved.';
          renderPlaybackEditor(gig);
        } catch (error) { playbackEditorMessage.textContent = error.message; playbackEditorMessage.classList.add('error'); }
        finally { savePlaybackPlan.disabled = false; }
      };
    }

    autoBuildPlaybackPlan?.addEventListener('click', async () => {
      const gig = getGigs().find((entry) => entry.id === editGigId);
      if (!gig) return;
      autoBuildPlaybackPlan.disabled = true;
      autoBuildPlaybackPlan.textContent = 'Inspecting videos…';
      playbackEditorSuggestions.innerHTML = '<p>Reading chapters, full-show durations, titles and track detections…</p>';
      playbackEditorMessage.textContent = '';
      try {
        const result = await fetchJson(`/api/gigs/${gig.id}/playback-plan/suggest`, { method: 'POST' });
        playbackSuggestionState = { gigId: gig.id, suggestions: result.suggestions || [], metadataWarning: result.metadataWarning || '' };
        renderPlaybackSuggestions(gig);
        playbackEditorMessage.textContent = result.suggestions?.length ? `Inspected ${result.inspected} video${result.inspected === 1 ? '' : 's'}. Review the highlighted suggestions below.` : 'No new setlist matches were found. Your saved plan was not changed.';
        playbackEditorMessage.classList.remove('error');
      } catch (error) {
        playbackEditorSuggestions.innerHTML = '';
        playbackEditorMessage.textContent = error.message;
        playbackEditorMessage.classList.add('error');
      } finally {
        autoBuildPlaybackPlan.disabled = false;
        autoBuildPlaybackPlan.textContent = '✦ Suggest plan';
      }
    });

    return {
      render: renderPlaybackEditor,
      healthCheck: playbackEditorHealthCheck,
      rows: playbackEditorRows,
      closePreview: closePlaybackEditorPreview,
      captureDraft: capturePlaybackEditorDraft,
      restoreDraft: restorePlaybackEditorDraft,
      renderSuggestions: renderPlaybackSuggestions,
      applySuggestion: applyPlaybackSuggestion
    };
  }

  return { createController };
}));
