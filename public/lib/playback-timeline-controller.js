(function initPlaybackTimelineController(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListPlaybackTimelineController = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function playbackTimelineControllerFactory() {
  function pointerRatio(element, clientX) {
    const rect = element.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function createController({
    core, escapeHtml, formatPlaybackTime, getGig, getQueue, getIndex, setIndex,
    getZoom, setZoom, entryTitle, bounds, timeAt, playTrack, setPendingSeek,
    getYoutubePlayer, elements
  }) {
    const {
      player, stage, timeline, progress, markers, overview, overviewProgress,
      overviewMarkers, elapsed, total, mediaQuery
    } = elements;
    let timelinePointer = null;

    function timelineModel(gig) {
      return core.timelineModel(gig, getQueue());
    }

    function focusedModel(gig) {
      return core.focusedTimelineModel(gig, getQueue(), getIndex(), getZoom());
    }

    function setProgress(gig, mediaFraction = 0, currentSeconds = 0, durationSeconds = 0) {
      const index = getIndex();
      const fullSegment = timelineModel(gig)[index];
      const segment = focusedModel(gig).find((item) => item.index === index);
      if (!fullSegment || !segment) return;
      const fraction = Math.max(0, Math.min(1, Number(mediaFraction) || 0));
      progress.style.width = `${core.progressModel(segment, fraction) * 100}%`;
      overviewProgress.style.width = `${core.progressModel(fullSegment, fraction) * 100}%`;
      const clipBounds = bounds(segment.entry, durationSeconds);
      elapsed.textContent = formatPlaybackTime(Math.max(0, (currentSeconds || 0) - clipBounds.start));
      total.textContent = clipBounds.length ? formatPlaybackTime(clipBounds.length) : '--:--';
    }

    function render(gig) {
      const queue = getQueue();
      const index = getIndex();
      const fullModel = timelineModel(gig);
      const model = focusedModel(gig);
      overviewMarkers.innerHTML = fullModel.map(({ entry, index: entryIndex, marker }) => {
        const title = entryTitle(gig, entry);
        return `<button class="set-overview-marker${entryIndex === index ? ' active' : ''}${entry.media ? '' : ' is-gap'}${entry.isUnknown ? ' is-unknown' : ''}${marker <= 0 ? ' marker-first' : ''}${marker >= .999999 ? ' marker-last' : ''}" type="button" style="left:${marker * 100}%" title="${escapeHtml(title)}${entry.media ? '' : ' · no video'}" aria-label="Play ${escapeHtml(title)}"></button>`;
      }).join('');
      markers.innerHTML = model.map(({ entry, index: entryIndex, marker }) => {
        const title = entryTitle(gig, entry);
        const label = entry.isUnknown ? title : `${entry.songIndex + 1} · ${title}`;
        return `<button class="set-marker${entryIndex === index ? ' active' : ''}${entry.media ? '' : ' is-gap'}${entry.isUnknown ? ' is-unknown' : ''}${marker <= 0 ? ' marker-first' : ''}${marker >= .999999 ? ' marker-last' : ''}" type="button" style="left:${marker * 100}%" title="${escapeHtml(title)}${entry.media ? '' : ' · no video'}" aria-label="${entry.media ? 'Play' : 'Skip to next video after'} ${escapeHtml(title)}"><span class="set-marker-label">${escapeHtml(label)}</span></button>`;
      }).join('');
      overviewMarkers.querySelectorAll('.set-overview-marker').forEach((marker, entryIndex) => marker.addEventListener('click', (event) => {
        event.stopPropagation();
        setIndex(entryIndex);
        setPendingSeek({ index: entryIndex, fraction: 0 });
        playTrack();
      }));
      markers.querySelectorAll('.set-marker').forEach((marker, localIndex) => marker.addEventListener('click', (event) => {
        event.stopPropagation();
        const entryIndex = model[localIndex].index;
        setIndex(entryIndex);
        setPendingSeek({ index: entryIndex, fraction: 0 });
        playTrack();
      }));
      player.dataset.timelineZoom = String(getZoom());
      setProgress(gig, 0);
      return { fullModel, model, queue };
    }

    function applySeek(gig, fraction) {
      const bounded = Math.max(0, Math.min(1, Number(fraction) || 0));
      const entry = getQueue()[getIndex()];
      if (!entry?.media) return;
      const video = stage.querySelector('video.set-player-current, video:not(.set-player-preload)');
      if (video) {
        const seek = () => {
          if (!Number.isFinite(video.duration) || video.duration <= 0) return;
          video.currentTime = timeAt(entry, bounded, video.duration);
          setPendingSeek(null);
          setProgress(gig, bounded, video.currentTime, video.duration);
        };
        if (video.readyState >= 1) seek();
        else video.addEventListener('loadedmetadata', seek, { once: true });
        return;
      }
      const youtubePlayer = getYoutubePlayer();
      if (youtubePlayer?.seekTo && youtubePlayer.getDuration) {
        const duration = Number(youtubePlayer.getDuration()) || 0;
        if (duration > 0) {
          const seekTime = timeAt(entry, bounded, duration);
          youtubePlayer.seekTo(seekTime, true);
          setPendingSeek(null);
          setProgress(gig, bounded, seekTime, duration);
        }
      }
    }

    function seek(ratio, useFullTimeline = false) {
      const gig = getGig();
      const model = gig ? (useFullTimeline ? timelineModel(gig) : focusedModel(gig)) : [];
      if (!model.length) return;
      const target = core.seekTarget(model, ratio);
      if (!target) return;
      const { segment, fraction, ratio: bounded } = target;
      const changedTrack = segment.index !== getIndex();
      setIndex(segment.index);
      setPendingSeek({ index: segment.index, fraction: Math.max(0, Math.min(1, fraction)) });
      progress.style.width = `${bounded * 100}%`;
      if (changedTrack) playTrack();
      else applySeek(gig, fraction);
    }

    function bind() {
      overview?.addEventListener('pointerup', (event) => {
        if (event.target.closest('.set-overview-marker') || !getQueue().length) return;
        seek(pointerRatio(overview, event.clientX), true);
      });
      mediaQuery.addEventListener?.('change', (event) => {
        setZoom(event.matches ? 3 : 5);
        const gig = getGig();
        if (gig && getQueue().length) render(gig);
      });
      timeline?.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.set-marker') || event.button !== 0) return;
        timelinePointer = { id: event.pointerId, x: event.clientX, y: event.clientY, scrubbing: false };
      });
      timeline?.addEventListener('pointermove', (event) => {
        if (!timelinePointer || timelinePointer.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - timelinePointer.x);
        const dy = Math.abs(event.clientY - timelinePointer.y);
        if (!timelinePointer.scrubbing && dx >= 8 && dx > dy) {
          timelinePointer.scrubbing = true;
          timeline.classList.add('is-scrubbing');
          timeline.setPointerCapture?.(event.pointerId);
        }
        if (timelinePointer.scrubbing) progress.style.width = `${pointerRatio(timeline, event.clientX) * 100}%`;
      });
      timeline?.addEventListener('pointerup', (event) => {
        if (!timelinePointer || timelinePointer.id !== event.pointerId) return;
        const pointer = timelinePointer;
        timelinePointer = null;
        timeline.classList.remove('is-scrubbing');
        if (pointer.scrubbing) timeline.releasePointerCapture?.(event.pointerId);
        else if (Math.abs(event.clientY - pointer.y) > 10) return;
        seek(pointerRatio(timeline, event.clientX));
      });
      timeline?.addEventListener('pointercancel', () => {
        timelinePointer = null;
        timeline.classList.remove('is-scrubbing');
      });
    }

    return {
      bind, render, setProgress, applySeek, seek,
      timelineModel, focusedModel,
      isActive: () => Boolean(timelinePointer)
    };
  }

  return { createController, pointerRatio };
}));
