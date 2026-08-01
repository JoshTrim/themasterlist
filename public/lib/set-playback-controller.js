(function initSetPlaybackController(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListSetPlaybackController = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function setPlaybackControllerFactory() {
  function createTransportControls({ document, player, nextButton, fullscreenButton }) {
    const previousButton = document.createElement('button');
    previousButton.type = 'button';
    previousButton.className = 'button button-secondary';
    previousButton.textContent = '← Previous';
    const restartButton = document.createElement('button');
    restartButton.type = 'button';
    restartButton.className = 'button button-secondary set-player-restart';
    restartButton.textContent = '↺ Start over';
    const controlsToggle = document.createElement('button');
    controlsToggle.type = 'button';
    controlsToggle.className = 'set-player-controls-toggle';
    controlsToggle.textContent = '•••';
    controlsToggle.setAttribute('aria-label', 'Show or hide playback controls');
    player.append(controlsToggle);
    const controls = document.createElement('div');
    controls.className = 'set-player-controls';
    if (nextButton?.parentNode) {
      nextButton.parentNode.insertBefore(controls, nextButton);
      controls.append(previousButton, restartButton);
      if (fullscreenButton) controls.append(fullscreenButton);
      controls.append(nextButton);
    }
    return { previousButton, restartButton, controlsToggle, controls };
  }

  function createController({
    document, window, navigatorApi, storage, getGigs, getSharedShows = () => [], showId, escapeHtml, formatPlaybackTime,
    loadYouTubeApi, youtubeEmbedUrl, playbackCore, playbackMedia, timelineControllerModule,
    theatreControllerModule, theatreUi, mediaQuery, now = () => Date.now(),
    setTimeoutFn = globalThis.setTimeout, clearTimeoutFn = globalThis.clearTimeout,
    setIntervalFn = globalThis.setInterval, clearIntervalFn = globalThis.clearInterval,
    elements
  }) {
    const {
      playButton: playWholeSet, player: setPlayer, title: setPlayerTitle, stage: setPlayerStage,
      nextButton: setPlayerNext, previousButton: setPlayerPrev, restartButton: setPlayerRestart,
      fullscreenButton: setPlayerFullscreen, controlsToggle: setPlayerControlsToggle,
      status: setPlayerStatus, progress: setPlayerProgress, markers: setPlayerMarkers,
      timeline: setPlayerTimeline, overview: setPlayerOverview, overviewProgress: setPlayerOverviewProgress,
      overviewMarkers: setPlayerOverviewMarkers, elapsed: setPlayerElapsed, total: setPlayerTotal,
      sourceKind: setPlayerSourceKind, sourceLabel: setPlayerSourceLabel,
      contextPrevious: setPlayerContextPrevious, contextCurrent: setPlayerContextCurrent,
      contextNext: setPlayerContextNext
    } = elements;

    let setQueue = [];
    let setQueueIndex = 0;
    let activeYoutubePlayer;
    let activeYoutubeVideoId = '';
    let youtubeTimelineTimer;
    let setSourceLoadTimer;
    let setFallbackPending = false;
    let pendingSetSeek = null;
    let setTrackAdvancePending = false;
    let resumeSaveAt = 0;
    let theatreController;
    let setPlaybackWakeLock;
    const setTimelineMedia = mediaQuery;
    let setTimelineZoom = setTimelineMedia.matches ? 3 : 5;
    const playbackResumeKey = (gigId) => `master-list:playback:${gigId}`;
    function playbackGig() {
      const gig = getGigs().find((entry) => entry.id === showId);
      if (!gig) return null;
      const shared = getSharedShows().find((show) => show.id === gig.sharedId || show.sourceGigId === gig.id);
      const remoteMedia = (shared?.contributions || []).filter((entry) => entry.localGigId !== gig.id).flatMap((entry) => entry.media || []);
      return remoteMedia.length ? { ...gig, media: [...(gig.media || []), ...remoteMedia] } : gig;
    }
    function updateSetTheatreMeta(gig, entry) {
      const source = playbackMedia.sourcePresentation(entry);
      setPlayerSourceKind.textContent = source.kind;
      setPlayerSourceLabel.textContent = source.label;
      const previousEntry = setQueueIndex > 0 ? setQueue[setQueueIndex - 1] : null;
      const nextEntry = setQueueIndex < setQueue.length - 1 ? setQueue[setQueueIndex + 1] : null;
      setPlayerContextPrevious.textContent = previousEntry ? `← ${setQueueEntryTitle(gig, previousEntry)}` : 'Start of set';
      setPlayerContextCurrent.textContent = entry?.isUnknown ? 'Unknown' : `${entry.songIndex + 1} / ${gig.songs.length}`;
      setPlayerContextNext.textContent = nextEntry ? `${setQueueEntryTitle(gig, nextEntry)} →` : 'End of set';
    }
    function setPlaybackIsPlaying() {
      const video = setPlayerStage.querySelector('video.set-player-current');
      if (video) return !video.paused && !video.ended;
      try { return activeYoutubePlayer?.getPlayerState?.() === 1; } catch { return false; }
    }
    function scheduleTheatreControls() {
      theatreController?.schedule();
    }
    function revealTheatreControls({ schedule = true } = {}) {
      theatreController?.reveal({ schedule });
    }
    async function requestSetPlaybackWakeLock() {
      if (!navigatorApi.wakeLock || setPlaybackWakeLock || document.fullscreenElement !== setPlayer) return;
      try {
        setPlaybackWakeLock = await navigatorApi.wakeLock.request('screen');
        setPlaybackWakeLock.addEventListener?.('release', () => { setPlaybackWakeLock = null; });
      } catch { setPlaybackWakeLock = null; }
    }
    async function releaseSetPlaybackWakeLock() {
      if (!setPlaybackWakeLock) return;
      const lock = setPlaybackWakeLock;
      setPlaybackWakeLock = null;
      try { await lock.release(); } catch {}
    }
    function toggleSetPlayback() {
      const video = setPlayerStage.querySelector('video.set-player-current');
      if (video) {
        if (video.paused) video.play().catch(() => {}); else video.pause();
        if (video.paused) revealTheatreControls({ schedule: false }); else scheduleTheatreControls();
        return;
      }
      try {
        if (activeYoutubePlayer?.getPlayerState?.() === 1) { activeYoutubePlayer.pauseVideo(); revealTheatreControls({ schedule: false }); }
        else { activeYoutubePlayer?.playVideo?.(); scheduleTheatreControls(); }
      } catch {}
    }
    function toggleSetMute() {
      const video = setPlayerStage.querySelector('video.set-player-current');
      if (video) { video.muted = !video.muted; setPlayerStatus.textContent = video.muted ? 'Muted' : 'Sound on'; return; }
      try {
        if (activeYoutubePlayer?.isMuted?.()) { activeYoutubePlayer.unMute(); setPlayerStatus.textContent = 'Sound on'; }
        else { activeYoutubePlayer?.mute?.(); setPlayerStatus.textContent = 'Muted'; }
      } catch {}
    }
    function playbackBounds(source, duration = 0) {
      return playbackCore.bounds(source, duration);
    }
    function playbackFraction(source, current, duration) {
      return playbackCore.fraction(source, current, duration);
    }
    function playbackTimeAt(source, fraction, duration) {
      return playbackCore.timeAt(source, fraction, duration);
    }
    function savePlaybackResume(gig, fraction) {
      if (!gig || !setQueue[setQueueIndex]?.media || now() - resumeSaveAt < 1000) return;
      resumeSaveAt = now();
      const entry = setQueue[setQueueIndex];
      try { storage.setItem(playbackResumeKey(gig.id), JSON.stringify({ entryKey: setQueueEntryKey(entry), songIndex: entry.songIndex, mediaId: entry.media.id, fraction: Math.max(0, Math.min(1, fraction)), savedAt: now() })); } catch {}
    }
    function readPlaybackResume(gig) {
      try {
        const saved = JSON.parse(storage.getItem(playbackResumeKey(gig.id)) || 'null');
        if (!saved || now() - Number(saved.savedAt || 0) > 1000 * 60 * 60 * 24 * 30 || Number(saved.fraction) >= .98) return null;
        const index = setQueue.findIndex((entry) => (saved.entryKey ? setQueueEntryKey(entry) === saved.entryKey : entry.songIndex === Number(saved.songIndex)) && (entry.sources || []).some((source) => source.media?.id === saved.mediaId));
        if (index < 0) return null;
        const sourceIndex = setQueue[index].sources.findIndex((source) => source.media?.id === saved.mediaId);
        return { index, sourceIndex: Math.max(0, sourceIndex), fraction: Math.max(0, Math.min(1, Number(saved.fraction) || 0)) };
      } catch { return null; }
    }
    function clearPlaybackResume(gig) { try { storage.removeItem(playbackResumeKey(gig.id)); } catch {} }
    const playbackTimelineController = timelineControllerModule.createController({
      core: playbackCore, escapeHtml, formatPlaybackTime,
      getGig: playbackGig, getQueue: () => setQueue,
      getIndex: () => setQueueIndex, setIndex: (index) => { setQueueIndex = index; },
      getZoom: () => setTimelineZoom, setZoom: (zoom) => { setTimelineZoom = zoom; },
      entryTitle: setQueueEntryTitle, bounds: playbackBounds, timeAt: playbackTimeAt,
      playTrack: () => playSetTrack(), setPendingSeek: (seek) => { pendingSetSeek = seek; },
      getYoutubePlayer: () => activeYoutubePlayer,
      elements: {
        player: setPlayer, stage: setPlayerStage, timeline: setPlayerTimeline, progress: setPlayerProgress,
        markers: setPlayerMarkers, overview: setPlayerOverview, overviewProgress: setPlayerOverviewProgress,
        overviewMarkers: setPlayerOverviewMarkers, elapsed: setPlayerElapsed, total: setPlayerTotal, mediaQuery: setTimelineMedia
      }
    });
    playbackTimelineController.bind();
    function setTimelineProgress(gig, mediaFraction = 0, currentSeconds = 0, durationSeconds = 0) { return playbackTimelineController.setProgress(gig, mediaFraction, currentSeconds, durationSeconds); }
    function renderSetTimeline(gig) { return playbackTimelineController.render(gig); }
    function applySetSeek(gig, fraction) { return playbackTimelineController.applySeek(gig, fraction); }

    function stopYoutubeTimelinePolling() { if (youtubeTimelineTimer) { clearIntervalFn(youtubeTimelineTimer); youtubeTimelineTimer = null; } }
    function clearSetSourceLoadTimer() { if (setSourceLoadTimer) { clearTimeoutFn(setSourceLoadTimer); setSourceLoadTimer = null; } }
    function activateSetSource(entry, sourceIndex = 0) {
      return playbackCore.activateSource(entry, sourceIndex);
    }
    function setQueueEntryTitle(gig, entry) {
      return playbackCore.entryTitle(gig, entry);
    }
    function setQueueEntryKey(entry) {
      return playbackCore.entryKey(entry);
    }
    function buildSetPlaybackQueue(gig) {
      return playbackCore.buildQueue(gig);
    }
    function failSetSource(reason = 'Source unavailable') {
      if (setFallbackPending) return;
      const entry = setQueue[setQueueIndex];
      if (!entry?.media) return;
      clearSetSourceLoadTimer();
      stopYoutubeTimelinePolling();
      const nextSourceIndex = (entry.sourceIndex || 0) + 1;
      if (nextSourceIndex < (entry.sources || []).length) {
        setFallbackPending = true;
        activateSetSource(entry, nextSourceIndex);
        entry.fallbackNotice = `${reason}; using backup ${nextSourceIndex}`;
        pendingSetSeek = { index: setQueueIndex, fraction: 0 };
        playSetTrack();
        return;
      }
      setFallbackPending = true;
      setPlayerStatus.textContent = `${reason}; no backups remain. Skipping…`;
      const failedEntry = entry;
      setTimeoutFn(() => { if (setQueue[setQueueIndex] === failedEntry) { setFallbackPending = false; moveToPlayableTrack(1); } }, 900);
    }
    function armSetSourceLoadTimer() {
      clearSetSourceLoadTimer();
      const entry = setQueue[setQueueIndex];
      const mediaId = entry?.media?.id;
      setSourceLoadTimer = setTimeoutFn(() => { if (setQueue[setQueueIndex] === entry && entry.media?.id === mediaId) failSetSource('Video timed out'); }, 12000);
    }
    function nextPlayableSetIndex(start, direction = 1) {
      return playbackCore.nextPlayableIndex(setQueue, start, direction);
    }
    function finishSetPlayback(gig) {
      stopYoutubeTimelinePolling();
      clearSetSourceLoadTimer();
      clearPlaybackResume(gig);
      releaseSetPlaybackWakeLock();
      setPlayerStatus.textContent = 'End of available set.';
      setPlayerSourceKind.textContent = 'Set complete';
      setPlayerSourceLabel.textContent = `${gig.songs.length} tracks in this playback plan`;
      setPlayerProgress.style.width = '100%';
      setPlayerOverviewProgress.style.width = '100%';
      revealTheatreControls({ schedule: false });
    }
    function continueSameSetSource(gig, index) {
      const entry = setQueue[index];
      setQueueIndex = index;
      pendingSetSeek = null;
      setTrackAdvancePending = false;
      setPlayerTitle.textContent = entry.isUnknown ? 'Unknown' : `${entry.songIndex + 1}. ${setQueueEntryTitle(gig, entry)}`;
      updateSetTheatreMeta(gig, entry);
      renderSetTimeline(gig);
      setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · continuous video`;
      const requestedStart = entry.clip?.startSeconds ?? entry.media?.playbackStart;
      if (requestedStart !== null && requestedStart !== undefined && requestedStart !== '') {
        const start = Math.max(0, Number(requestedStart) || 0);
        const video = setPlayerStage.querySelector('video.set-player-current');
        if (video && Math.abs(video.currentTime - start) > .75) video.currentTime = start;
        else if (activeYoutubePlayer?.getCurrentTime && activeYoutubePlayer?.seekTo && Math.abs(Number(activeYoutubePlayer.getCurrentTime()) - start) > .75) activeYoutubePlayer.seekTo(start, true);
      }
      if (entry.media?.mimeType === 'video/youtube') startYoutubeTimelinePolling(gig);
    }
    function moveToPlayableTrack(direction = 1, continuous = false) {
      clearSetSourceLoadTimer();
      const gig = playbackGig();
      const expected = setQueueIndex + direction;
      const index = nextPlayableSetIndex(expected, direction);
      if (index < 0) { if (direction > 0 && gig) finishSetPlayback(gig); return; }
      const skipped = Math.abs(index - expected);
      if (continuous && gig && setQueue[setQueueIndex]?.media?.id === setQueue[index]?.media?.id) { continueSameSetSource(gig, index); return; }
      setQueueIndex = index;
      pendingSetSeek = { index, fraction: 0 };
      playSetTrack();
      if (skipped) setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · skipped ${skipped} missing track${skipped === 1 ? '' : 's'}`;
    }
    function startYoutubeTimelinePolling(gig) {
      stopYoutubeTimelinePolling();
      youtubeTimelineTimer = setIntervalFn(() => {
        if (!activeYoutubePlayer?.getDuration || !activeYoutubePlayer?.getCurrentTime) return;
        const duration = Number(activeYoutubePlayer.getDuration()) || 0;
        const current = Number(activeYoutubePlayer.getCurrentTime()) || 0;
        if (duration <= 0) return;
        const entry = setQueue[setQueueIndex];
        const fraction = playbackFraction(entry, current, duration);
        setTimelineProgress(gig, fraction, current, duration);
        savePlaybackResume(gig, fraction);
        const bounds = playbackBounds(entry, duration);
        if (!setTrackAdvancePending && bounds.end && current >= bounds.end - .2) {
          setTrackAdvancePending = true;
          moveToPlayableTrack(1, true);
        }
      }, 250);
    }
    function advanceUploadedSetTrack(video, nextIndex) {
      if (setTrackAdvancePending) return;
      setTrackAdvancePending = true;
      const next = nextIndex >= 0 ? setQueue[nextIndex] : null;
      const gig = playbackGig();
      if (next && gig && next.media?.id === setQueue[setQueueIndex]?.media?.id) { continueSameSetSource(gig, nextIndex); return; }
      const nextVideo = setPlayerStage.querySelector('video.set-player-preload');
      if (!next || !nextVideo || next.media?.mimeType === 'video/youtube') { moveToPlayableTrack(1); return; }
      const beginCrossfade = () => {
        nextVideo.currentTime = playbackTimeAt(next, 0, nextVideo.duration);
        nextVideo.classList.add('set-player-fading-in');
        video.classList.add('set-player-fading-out');
        nextVideo.muted = false;
        nextVideo.play().catch(() => {});
        setTimeoutFn(() => { const fraction = playbackFraction(next, nextVideo.currentTime, nextVideo.duration); setQueueIndex = nextIndex; pendingSetSeek = { index: nextIndex, fraction }; playSetTrack(); }, 650);
      };
      if (nextVideo.readyState >= 1) beginCrossfade(); else nextVideo.addEventListener('loadedmetadata', beginCrossfade, { once: true });
    }
    function installPlayerStageNavigation() {
      const previous = document.createElement('button');
      const next = document.createElement('button');
      const reveal = document.createElement('button');
      previous.type = next.type = 'button';
      reveal.type = 'button';
      previous.className = 'set-player-swipe-zone is-previous'; next.className = 'set-player-swipe-zone is-next';
      reveal.className = 'set-player-controls-reveal';
      previous.setAttribute('aria-label', 'Previous available track'); next.setAttribute('aria-label', 'Next available track');
      reveal.setAttribute('aria-label', 'Show playback controls');
      previous.textContent = '‹'; next.textContent = '›';
      reveal.textContent = 'Show controls';
      reveal.addEventListener('click', () => revealTheatreControls());
      setPlayerStage.append(previous, next, reveal);
      [previous, next].forEach((zone) => {
        let startX = 0; let swiped = false;
        zone.addEventListener('pointerdown', (event) => { startX = event.clientX; swiped = false; zone.setPointerCapture?.(event.pointerId); });
        zone.addEventListener('pointerup', (event) => {
          const delta = event.clientX - startX;
          if (Math.abs(delta) >= 36) { swiped = true; moveToPlayableTrack(delta < 0 ? 1 : -1); }
        });
        zone.addEventListener('click', () => { if (swiped) { swiped = false; return; } moveToPlayableTrack(zone.classList.contains('is-next') ? 1 : -1); });
      });
    }
    function playSetTrack() {
      const gig = playbackGig();
      const entry = setQueue[setQueueIndex];
      stopYoutubeTimelinePolling();
      clearSetSourceLoadTimer();
      setFallbackPending = false;
      setTrackAdvancePending = false;
      if (!gig || !entry) { if (gig) finishSetPlayback(gig); return; }
      const song = entry.isUnknown ? { title: 'Unknown' } : gig.songs[entry.songIndex];
      setPlayer.hidden = false;
      setPlayerTitle.textContent = entry.isUnknown ? 'Unknown' : `${entry.songIndex + 1}. ${song.title}`;
      updateSetTheatreMeta(gig, entry);
      renderSetTimeline(gig);
      if (!entry.media) {
        setPlayerStage.innerHTML = `<div class="set-player-gap"><span>◇</span><strong>No video for this track</strong><small>Skipping to the next available song…</small></div>`;
        setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · gap`;
        setTimeoutFn(() => { if (setQueue[setQueueIndex] === entry) moveToPlayableTrack(1); }, 700);
        return;
      }
      setPlayerStatus.textContent = entry.fallbackNotice ? `${setQueueIndex + 1} of ${setQueue.length} · ${entry.fallbackNotice}` : `${setQueueIndex + 1} of ${setQueue.length}${entry.sourceIndex ? ` · backup ${entry.sourceIndex}` : ''}`;
      entry.fallbackNotice = '';
      const seekFraction = pendingSetSeek?.index === setQueueIndex ? pendingSetSeek.fraction : 0;
      pendingSetSeek = { index: setQueueIndex, fraction: seekFraction };
      const youtubeIframe = activeYoutubePlayer?.getIframe?.();
      if (entry.media.mimeType === 'video/youtube' && activeYoutubePlayer && youtubeIframe?.isConnected) {
        const videoId = playbackMedia.youtubeVideoId(entry.media.url);
        activeYoutubeVideoId = videoId;
        armSetSourceLoadTimer();
        activeYoutubePlayer.loadVideoById({ videoId, startSeconds: playbackBounds(entry).start });
        return;
      }
      if (activeYoutubePlayer) { try { activeYoutubePlayer.destroy(); } catch {} activeYoutubePlayer = null; activeYoutubeVideoId = ''; }
      const nextIndex = nextPlayableSetIndex(setQueueIndex + 1, 1);
      const next = nextIndex >= 0 ? setQueue[nextIndex] : null;
      setPlayerStage.innerHTML = playbackMedia.stageMarkup({ entry, next, songTitle: song.title, escapeHtml, youtubeEmbedUrl });
      installPlayerStageNavigation();
      armSetSourceLoadTimer();
      const video = setPlayerStage.querySelector('video.set-player-current');
      if (video) video.addEventListener('loadedmetadata', () => { clearSetSourceLoadTimer(); applySetSeek(gig, seekFraction); }, { once: true });
      if (video) video.addEventListener('playing', () => { clearSetSourceLoadTimer(); scheduleTheatreControls(); });
      if (video) video.addEventListener('pause', () => revealTheatreControls({ schedule: false }));
      if (video) video.addEventListener('error', () => failSetSource('Uploaded video failed'), { once: true });
      if (video) video.addEventListener('timeupdate', () => {
        if (!video.duration) return;
        const activeEntry = setQueue[setQueueIndex];
        const fraction = playbackFraction(activeEntry, video.currentTime, video.duration);
        setTimelineProgress(gig, fraction, video.currentTime, video.duration);
        savePlaybackResume(gig, fraction);
        const bounds = playbackBounds(activeEntry, video.duration);
        const activeNextIndex = nextPlayableSetIndex(setQueueIndex + 1, 1);
        if (!setTrackAdvancePending && bounds.end && video.currentTime >= bounds.end - .08) advanceUploadedSetTrack(video, activeNextIndex);
      });
      if (video) video.play().catch(() => { setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · Press play to continue`; });
      if (video) video.addEventListener('ended', () => advanceUploadedSetTrack(video, nextPlayableSetIndex(setQueueIndex + 1, 1)));
      const youtubeFrame = setPlayerStage.querySelector('iframe:not(.set-player-preload)');
      if (youtubeFrame) {
        youtubeFrame.id = `set-player-youtube-${now()}`;
        loadYouTubeApi().then((YT) => {
          activeYoutubePlayer = new YT.Player(youtubeFrame.id, { events: {
            onReady: (event) => { clearSetSourceLoadTimer(); applySetSeek(gig, seekFraction); event.target.playVideo(); startYoutubeTimelinePolling(gig); },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) { clearSetSourceLoadTimer(); if (pendingSetSeek?.index === setQueueIndex) applySetSeek(gig, pendingSetSeek.fraction); startYoutubeTimelinePolling(gig); scheduleTheatreControls(); }
              if (event.data === YT.PlayerState.PAUSED) revealTheatreControls({ schedule: false });
              if (event.data === YT.PlayerState.ENDED && !setTrackAdvancePending) { setTrackAdvancePending = true; moveToPlayableTrack(1, true); }
            },
            onError: () => failSetSource('YouTube source unavailable')
          } });
        }).catch(() => failSetSource('YouTube player unavailable'));
      }
    }

    playWholeSet?.addEventListener('click', () => {
      const gig = playbackGig();
      setQueue = buildSetPlaybackQueue(gig);
      if (!setQueue.some((entry) => entry.media)) { setPlayer.hidden = false; setPlayerStatus.textContent = 'Assign media to setlist tracks first.'; return; }
      const resume = readPlaybackResume(gig);
      setQueueIndex = resume?.index ?? nextPlayableSetIndex(0, 1);
      if (resume) activateSetSource(setQueue[setQueueIndex], resume.sourceIndex);
      pendingSetSeek = { index: setQueueIndex, fraction: resume?.fraction ?? 0 };
      playSetTrack();
      if (resume) setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · resumed`;
    });
    setPlayerNext?.addEventListener('click', () => moveToPlayableTrack(1));
    setPlayerPrev.addEventListener('click', () => moveToPlayableTrack(-1));
    setPlayerRestart.addEventListener('click', () => {
      const gig = playbackGig();
      if (!gig) return;
      clearPlaybackResume(gig);
      setQueue.forEach((entry) => activateSetSource(entry, 0));
      setQueueIndex = nextPlayableSetIndex(0, 1);
      pendingSetSeek = { index: setQueueIndex, fraction: 0 };
      playSetTrack();
    });
    theatreController = theatreControllerModule.createController({
      document, window, player: setPlayer, fullscreenButton: setPlayerFullscreen, controlsToggle: setPlayerControlsToggle,
      theatre: theatreUi, isPlaying: setPlaybackIsPlaying, timelineActive: playbackTimelineController.isActive,
      requestWakeLock: requestSetPlaybackWakeLock, releaseWakeLock: releaseSetPlaybackWakeLock,
      commands: {
        next: () => moveToPlayableTrack(1), previous: () => moveToPlayableTrack(-1),
        'toggle-playback': toggleSetPlayback, 'toggle-mute': toggleSetMute,
        'toggle-theatre': () => theatreController.toggle()
      },
      setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window)
    });
    theatreController.bind();

    return {
      start: () => playWholeSet?.click(),
      playTrack: playSetTrack,
      next: () => moveToPlayableTrack(1),
      previous: () => moveToPlayableTrack(-1),
      failSource: failSetSource,
      getState: () => ({ queue: setQueue, index: setQueueIndex, pendingSeek: pendingSetSeek, fallbackPending: setFallbackPending }),
      timeline: playbackTimelineController,
      theatre: () => theatreController
    };
  }

  return { createTransportControls, createController };
}));
