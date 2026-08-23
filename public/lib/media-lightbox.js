(function initMediaLightbox(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListMediaLightbox = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function mediaLightboxFactory() {
  function createController({ elements, setTimeoutFn = globalThis.setTimeout }) {
    const { lightbox, stage, image, video, caption, basicCaption, closeButton, artifactCopy, artifactType, artifactNotes, artifactViews, artifactPrevious, artifactFlip, artifactNext, artifactShow, artifactDownload } = elements;
    let views = [];
    let activeIndex = 0;

    function viewName(item, index) {
      if (item.artifactView === 'detail') return item.artifactViewLabel || `Detail ${index + 1}`;
      return item.artifactView === 'back' ? 'Back' : 'Front';
    }

    function showArtifactView(index, animate = false) {
      if (!views.length) return;
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
      } else {
        views = [];
        caption.textContent = item.caption || item.filename || '';
        if (basicCaption) basicCaption.textContent = caption.textContent;
      }
    }

    function close() {
      lightbox.hidden = true;
      video.pause();
      stage?.classList?.remove('is-flipping');
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
    }

    return { bind, open, close, showArtifactView, getActiveIndex: () => activeIndex };
  }

  return { createController };
}));
