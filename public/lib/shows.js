(function exposeShows(root, factory) {
  const shows = factory();
  if (typeof module === 'object' && module.exports) module.exports = shows;
  else root.MasterListShows = shows;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createShowsModule() {
  function compareDates(a, b, oldestFirst = false) {
    const first = String(a || '');
    const second = String(b || '');
    if (!first && !second) return 0;
    if (!first) return 1;
    if (!second) return -1;
    return oldestFirst ? first.localeCompare(second) : second.localeCompare(first);
  }

  function includesQuery(values, query) {
    return !query || values.some((value) => String(value || '').toLowerCase().includes(query));
  }

  function selectArchiveShows({ gigs, remoteShows, query = '', year = '', favouritesOnly = false, sort = 'newest' }) {
    const normalizedQuery = query.trim().toLowerCase();
    const local = gigs.filter((gig) => includesQuery([gig.artist, gig.venue, gig.city], normalizedQuery)
      && (!year || String(gig.date || '').startsWith(year))
      && (!favouritesOnly || gig.favorite));
    const remote = remoteShows.filter((show) => includesQuery([show.artist, show.venue, show.city, ...(show.contributions || []).map((entry) => entry.participantName)], normalizedQuery)
      && (!year || String(show.date || '').startsWith(year))
      && (!favouritesOnly || (show.contributions || []).some((entry) => entry.favorite)));
    const dateOrder = sort === 'oldest';
    local.sort((a, b) => sort === 'rating'
      ? Number(b.performanceRating || 0) - Number(a.performanceRating || 0) || compareDates(a.date, b.date)
      : compareDates(a.date, b.date, dateOrder));
    remote.sort((a, b) => sort === 'rating'
      ? Math.max(0, ...(b.contributions || []).map((entry) => Number(entry.performanceRating || 0))) - Math.max(0, ...(a.contributions || []).map((entry) => Number(entry.performanceRating || 0))) || compareDates(a.date, b.date)
      : compareDates(a.date, b.date, dateOrder));
    return { local, remote };
  }

  function archiveStats(gigs, remoteShows) {
    const all = [...gigs, ...remoteShows];
    return {
      shows: all.length,
      artists: new Set(all.map((gig) => String(gig.artist || '').toLowerCase())).size,
      venues: new Set(all.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size,
      favourites: gigs.filter((gig) => gig.favorite).length + remoteShows.filter((show) => (show.contributions || []).some((entry) => entry.favorite)).length,
      songs: all.reduce((total, gig) => total + (gig.songs?.length || 0), 0)
    };
  }

  return { compareDates, selectArchiveShows, archiveStats };
}));
