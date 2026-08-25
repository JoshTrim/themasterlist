(function initMediaLightbox(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListMediaLightbox = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function mediaLightboxFactory() {
  function createController({ elements, setTimeoutFn = globalThis.setTimeout, requestAnimationFrameFn = globalThis.requestAnimationFrame?.bind(globalThis), cancelAnimationFrameFn = globalThis.cancelAnimationFrame?.bind(globalThis), prefersReducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false }) {
    const { lightbox, stage, image, video, caption, basicCaption, closeButton, artifactCopy, artifactType, artifactNotes, artifactViews, artifactPrevious, artifactFlip, artifactNext, artifactShow, artifactDownload, artifactModel, artifactModelSpinner, artifactModelFront, artifactModelBack, artifactModelToggle, artifactModelMotion } = elements;
    let views = [];
    let activeIndex = 0;
    let modelActive = false;
    let modelPaused = prefersReducedMotion;
    let modelAngle = -18;
    let dragStartX = null;
    let dragStartAngle = modelAngle;
    let activeMediaIsImage = false;
    let modelFrame = null;
    let previousFrameTime = null;

    function viewName(item, index) {
      if (item.artifactView === 'detail') return item.artifactViewLabel || `Detail ${index + 1}`;
      return item.artifactView === 'back' ? 'Back' : 'Front';
    }

    function pairedModelViews() {
      return {
        front: views.find((entry) => entry.artifactView === 'front'),
        back: views.find((entry) => entry.artifactView === 'back')
      };
    }

    function setModelAngle(angle) {
      modelAngle = Number.isFinite(angle) ? angle : modelAngle;
      artifactModelSpinner?.style?.setProperty?.('--artifact-model-angle', `${modelAngle}deg`);
      if (artifactModelSpinner?.style) artifactModelSpinner.style.transform = `rotateX(-3deg) rotateY(${modelAngle}deg)`;
    }

    function stopModelAnimation() {
      if (modelFrame !== null) cancelAnimationFrameFn?.(modelFrame);
      modelFrame = null;
      previousFrameTime = null;
    }

    function animateModel(time) {
      if (!modelActive || modelPaused || dragStartX !== null) return stopModelAnimation();
      if (previousFrameTime !== null) setModelAngle(modelAngle + ((time - previousFrameTime) * .0225));
      previousFrameTime = time;
      modelFrame = requestAnimationFrameFn?.(animateModel) ?? null;
    }

    function startModelAnimation() {
      stopModelAnimation();
      if (modelActive && !modelPaused && dragStartX === null && requestAnimationFrameFn) modelFrame = requestAnimationFrameFn(animateModel);
    }

    function setModelPaused(paused) {
      modelPaused = Boolean(paused);
      artifactModel?.classList?.toggle('is-paused', modelPaused);
      if (artifactModelMotion) {
        artifactModelMotion.textContent = modelPaused ? 'Resume' : 'Pause';
        artifactModelMotion.setAttribute('aria-pressed', String(modelPaused));
      }
      if (modelPaused) stopModelAnimation();
      else startModelAnimation();
    }

    function setModelActive(active) {
      const { front, back } = pairedModelViews();
      modelActive = Boolean(active && front && back && artifactModel);
      if (artifactModelToggle) {
        artifactModelToggle.hidden = !(front && back);
        artifactModelToggle.textContent = modelActive ? '2D view' : '3D view';
        artifactModelToggle.setAttribute('aria-pressed', String(modelActive));
      }
      if (artifactModel) artifactModel.hidden = !modelActive;
      stage?.classList?.toggle?.('is-model-view', modelActive);
      image.hidden = modelActive || !activeMediaIsImage;
      if (!modelActive) { stopModelAnimation(); return; }
      artifactModelFront.src = front.url;
      artifactModelFront.alt = `${caption?.textContent || 'Artifact'} · Front`;
      artifactModelFront.style.transform = `rotate(${front.rotation || 0}deg)`;
      artifactModelBack.src = back.url;
      artifactModelBack.alt = `${caption?.textContent || 'Artifact'} · Back`;
      artifactModelBack.style.transform = `rotate(${back.rotation || 0}deg)`;
      setModelAngle(modelAngle);
      setModelPaused(modelPaused);
    }

    function showArtifactView(index, animate = false) {
      if (!views.length) return;
      if (modelActive) setModelActive(false);
      activeIndex = (index + views.length) % views.length;
      const item = views[activeIndex];
      const update = () => {
        image.src = item.url;
        image.alt = `${caption?.textContent || 'Artifact'} · ${viewName(item, activeIndex)}`;
        image.style.transform = `rotate(${item.rotation || 0}deg)`;
        if (artifactDownload) artifactDownload.href = `/api/media/${encodeURIComponent(item.id)}?variant=original`;
        artifactViews?.querySelectorAll?.('button').forEach((button, buttonIndex) => {
          button.classList.toggle('active', buttonIndex === activeIndex);
          button.setAttribute('aria-pressed', String(buttonIndex === activeIndex));
        });
      };
      if (!animate || !stage?.classList) return update();
      stage.classList.add('is-flipping');
      setTimeoutFn(() => { update(); stage.classList.remove('is-flipping'); }, 140);
    }

    function open(item) {
      const isImage = item.mimeType.startsWith('image/');
      const isVideo = item.mimeType.startsWith('video/');
      activeMediaIsImage = isImage;
      lightbox.hidden = false;
      const isArtifact = item.category === 'artifact' || Array.isArray(item.artifactViews);
      lightbox.classList?.toggle('is-artifact', isArtifact);
      artifactCopy && (artifactCopy.hidden = !isArtifact);
      if (basicCaption) basicCaption.hidden = isArtifact;
      image.hidden = !isImage;
      video.hidden = !isVideo;
      if (isImage) {
        image.src = item.url;
        video.removeAttribute?.('src');
      } else if (isVideo) {
        video.src = item.url;
        image.removeAttribute?.('src');
      }
      image.style.transform = `rotate(${item.rotation || 0}deg)`;
      video.style.transform = 'none';
      if (isArtifact) {
        views = (item.artifactViews || [item]).filter((entry) => String(entry.mimeType || '').startsWith('image/'));
        activeIndex = Math.max(0, views.findIndex((entry) => entry.id === item.id));
        caption.textContent = item.caption || item.filename || 'Artifact';
        if (artifactType) artifactType.textContent = item.artifactType || 'memorabilia';
        if (artifactNotes) artifactNotes.textContent = item.artifactNotes || '';
        if (artifactViews) artifactViews.innerHTML = views.map((entry, index) => `<button type="button" aria-pressed="${index === activeIndex}">${viewName(entry, index)}</button>`).join('');
        artifactViews?.querySelectorAll?.('button').forEach((button, index) => button.addEventListener('click', () => showArtifactView(index, true)));
        if (artifactShow) { artifactShow.hidden = !item.gig?.id; artifactShow.href = item.gig ? `/show?id=${encodeURIComponent(item.gig.id)}` : '#'; }
        showArtifactView(activeIndex);
        setModelActive(false);
      } else {
        views = [];
        setModelActive(false);
        caption.textContent = item.caption || item.filename || '';
        if (basicCaption) basicCaption.textContent = caption.textContent;
      }
    }

    function close() {
      lightbox.hidden = true;
      video.pause();
      stage?.classList?.remove('is-flipping');
      setModelActive(false);
      setModelPaused(prefersReducedMotion);
    }

    function bind() {
      closeButton.addEventListener('click', close);
      lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox) close();
      });
      artifactPrevious?.addEventListener('click', () => showArtifactView(activeIndex - 1, true));
      artifactNext?.addEventListener('click', () => showArtifactView(activeIndex + 1, true));
      artifactFlip?.addEventListener('click', () => {
        const current = views[activeIndex];
        const wanted = current?.artifactView === 'front' ? 'back' : 'front';
        const paired = views.findIndex((entry) => entry.artifactView === wanted);
        showArtifactView(paired >= 0 ? paired : activeIndex + 1, true);
      });
      artifactModelToggle?.addEventListener('click', () => setModelActive(!modelActive));
      artifactModelMotion?.addEventListener('click', () => setModelPaused(!modelPaused));
      artifactModel?.addEventListener('pointerdown', (event) => {
        if (event.target?.closest?.('button')) return;
        dragStartX = event.clientX;
        dragStartAngle = modelAngle;
        stopModelAnimation();
        artifactModel.classList?.add('is-dragging');
        artifactModel.setPointerCapture?.(event.pointerId);
      });
      artifactModel?.addEventListener('pointermove', (event) => {
        if (dragStartX === null) return;
        setModelAngle(dragStartAngle + ((event.clientX - dragStartX) * .45));
      });
      const finishDrag = () => { dragStartX = null; artifactModel?.classList?.remove('is-dragging'); startModelAnimation(); };
      artifactModel?.addEventListener('pointerup', finishDrag);
      artifactModel?.addEventListener('pointercancel', finishDrag);
      artifactModel?.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault?.();
        setModelPaused(true);
        setModelAngle(modelAngle + (event.key === 'ArrowLeft' ? -15 : 15));
      });
    }

    return { bind, open, close, showArtifactView, setModelActive, getActiveIndex: () => activeIndex, isModelActive: () => modelActive };
  }

  return { createController };
}));
