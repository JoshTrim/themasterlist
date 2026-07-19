(function initMediaLightbox(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListMediaLightbox = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function mediaLightboxFactory() {
  function createController({ elements }) {
    const { lightbox, image, video, caption, closeButton } = elements;

    function open(item) {
      const isImage = item.mimeType.startsWith('image/');
      const isVideo = item.mimeType.startsWith('video/');
      lightbox.hidden = false;
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
      caption.textContent = item.caption || item.filename || '';
    }

    function close() {
      lightbox.hidden = true;
      video.pause();
    }

    function bind() {
      closeButton.addEventListener('click', close);
      lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox) close();
      });
    }

    return { bind, open, close };
  }

  return { createController };
}));
