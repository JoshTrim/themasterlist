(function exposePageRuntime(root, factory) {
  const pageRuntime = factory();
  if (typeof module === 'object' && module.exports) module.exports = pageRuntime;
  else root.MasterListPageRuntime = pageRuntime;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPageRuntimeModule() {
  const endpoints = Object.freeze({
    gigs: '/api/gigs',
    integrations: '/api/integrations',
    profiles: '/api/profiles',
    sharedShows: '/api/shared/shows',
    peers: '/api/peers'
  });

  const defaults = Object.freeze({ gigs: [], integrations: {}, profiles: [], sharedShows: [], peers: [] });
  const pageRequirements = Object.freeze({
    overview: ['gigs', 'sharedShows'],
    artists: ['gigs', 'sharedShows'],
    venues: ['gigs', 'sharedShows'],
    timeline: ['gigs', 'sharedShows'],
    search: ['gigs', 'sharedShows'],
    health: ['gigs', 'sharedShows'],
    add: ['gigs', 'sharedShows', 'peers'],
    shows: ['gigs', 'integrations', 'sharedShows'],
    artist: ['gigs'],
    'artist-edit': ['gigs', 'sharedShows'],
    show: ['gigs', 'integrations'],
    playback: ['gigs', 'integrations'],
    city: ['gigs'],
    venue: ['gigs'],
    'venue-edit': ['gigs', 'sharedShows'],
    edit: ['gigs', 'sharedShows', 'peers'],
    map: ['gigs'],
    account: ['gigs', 'profiles', 'sharedShows', 'peers']
  });

  function requirementsFor(page, authenticated = true) {
    return authenticated ? [...(pageRequirements[page] || [])] : [];
  }

  async function loadPageData(page, { authenticated = true, fetchJson }) {
    const data = { gigs: [], integrations: {}, profiles: [], sharedShows: [], peers: [] };
    const required = requirementsFor(page, authenticated);
    const values = await Promise.all(required.map((key) => fetchJson(endpoints[key])));
    required.forEach((key, index) => { data[key] = values[index]; });
    return data;
  }

  async function runController(page, controllers, context) {
    const controller = controllers[page] || controllers.default;
    if (controller) return controller(context);
    return undefined;
  }

  const pendingAssets = new Map();
  function loadStylesheet(document, href) {
    if (document.querySelector?.(`link[href="${href}"]`)) return Promise.resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
    return Promise.resolve();
  }

  function loadScript(document, src, ready) {
    if (ready?.()) return Promise.resolve();
    if (pendingAssets.has(src)) return pendingAssets.get(src);
    const promise = new Promise((resolve, reject) => {
      const existing = document.querySelector?.(`script[src="${src}"]`);
      const script = existing || document.createElement('script');
      script.addEventListener?.('load', resolve, { once: true });
      script.addEventListener?.('error', () => reject(new Error(`Could not load ${src}.`)), { once: true });
      if (!existing) { script.src = src; document.body.append(script); }
    }).finally(() => pendingAssets.delete(src));
    pendingAssets.set(src, promise);
    return promise;
  }

  async function loadLeaflet({ document, window }) {
    await loadStylesheet(document, 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    await loadScript(document, 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => Boolean(window.L));
    if (!window.L) throw new Error('The map library did not become available.');
    return window.L;
  }

  return { endpoints, defaults, pageRequirements, requirementsFor, loadPageData, runController, loadScript, loadLeaflet };
}));
