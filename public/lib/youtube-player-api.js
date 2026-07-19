(function initYoutubePlayerApi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListYoutubePlayerApi = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function youtubePlayerApiFactory() {
  function createLoader({ window, document }) {
    let pending = null;

    function load() {
      if (window.YT?.Player) return Promise.resolve(window.YT);
      if (pending) return pending;
      pending = new Promise((resolve, reject) => {
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          previous?.();
          if (window.YT?.Player) resolve(window.YT);
          else reject(new Error('The YouTube player API did not become available.'));
        };
        const existing = document.querySelector?.('script[src="https://www.youtube.com/iframe_api"]');
        const script = existing || document.createElement('script');
        script.addEventListener?.('error', () => reject(new Error('Could not load the YouTube player API.')), { once: true });
        if (!existing) {
          script.src = 'https://www.youtube.com/iframe_api';
          document.head.appendChild(script);
        }
      }).catch((error) => {
        pending = null;
        throw error;
      });
      return pending;
    }

    return { load, isPending: () => Boolean(pending) };
  }

  return { createLoader };
}));
