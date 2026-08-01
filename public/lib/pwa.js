(function exposePwa(root, factory) {
  const pwa = factory();
  if (typeof module === 'object' && module.exports) module.exports = pwa;
  else root.MasterListPwa = pwa;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPwaModule() {
  function secureContext(location = {}) {
    const hostname = String(location.hostname || '').toLowerCase();
    return location.protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  async function registerServiceWorker({ navigator = {}, location = {}, scriptUrl = '/service-worker.js?v=2' } = {}) {
    if (!navigator.serviceWorker || !secureContext(location)) return null;
    try {
      return await navigator.serviceWorker.register(scriptUrl, { scope: '/' });
    } catch {
      return null;
    }
  }

  return { secureContext, registerServiceWorker };
}));
