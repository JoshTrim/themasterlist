(function initPageControllers(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListPageControllers = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function pageControllersFactory() {
  function createRegistry({ window, providerName, setMessage, actions }) {
    const noop = async () => {};
    return {
      home: noop,
      login: noop,
      overview: actions.renderDashboard,
      artists: actions.renderDirectories,
      venues: actions.renderDirectories,
      timeline: actions.renderTimeline,
      search: actions.renderSearch,
      health: actions.renderHealth,
      'api-limits': actions.renderApiLimits,
      maintenance: actions.renderMaintenance,
      activity: actions.renderActivity,
      conflicts: actions.renderConflicts,
      add: async () => {
        actions.renderAddAttendees();
        actions.populateAutofill();
      },
      shows: async () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('connected')) setMessage(`${providerName(params.get('connected'))} connected. Choose a show to export.`);
        if (params.get('integrationError')) setMessage('Could not connect that music service. Check its configuration and try again.', true);
        actions.populateYears();
        return actions.renderGigs();
      },
      artist: actions.renderArtist,
      'artist-edit': actions.renderArtistEdit,
      show: actions.renderShow,
      playback: actions.renderShow,
      city: actions.renderCity,
      venue: actions.renderVenue,
      'venue-edit': actions.renderVenueEdit,
      edit: async () => {
        actions.populateAutofill();
        return actions.renderEdit();
      },
      map: actions.renderMap,
      account: async () => {
        actions.renderProfiles();
        actions.renderSharedShows();
        return actions.renderInstanceSettings();
      }
    };
  }

  return { createRegistry };
}));
