(function initShellRouter(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListShellRouter = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function shellRouterFactory() {
  const routeSections = Object.freeze({
    home: ['home-page'], overview: ['overview-page'], artists: ['artists-page'], venues: ['venues-page'],
    timeline: ['timeline-page'], search: ['search-page'], health: ['health-page'], maintenance: ['maintenance-page'],
    activity: ['activity-page'], conflicts: ['conflicts-page'], 'api-limits': ['api-limits-page'], add: ['add-page'],
    shows: ['shows-archive'], shared: ['shows-archive'], login: ['shows-shared'], artist: ['artist-page'],
    'artist-edit': ['artist-edit-page'], show: ['show-page'], playback: ['show-page'], city: ['city-page'],
    venue: ['venue-page'], 'venue-edit': ['venue-edit-page'], edit: ['edit-page'], map: ['map-page'], account: ['account-page']
  });
  const sectionIds = Object.freeze([...new Set(Object.values(routeSections).flat())]);

  function pageFor(document) {
    return document.body.dataset.page || 'home';
  }

  function apply(document, requestedPage = pageFor(document)) {
    const page = routeSections[requestedPage] ? requestedPage : 'home';
    const visible = routeSections[page];
    sectionIds.forEach((id) => {
      const section = document.querySelector(`#${id}`);
      if (section) section.hidden = !visible.includes(id);
    });
    return page;
  }

  function bindChest(window, button) {
    button?.addEventListener('click', () => window.location.assign('/shows'));
  }

  return { routeSections, sectionIds, pageFor, apply, bindChest };
}));
