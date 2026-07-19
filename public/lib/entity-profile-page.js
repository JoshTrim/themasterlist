(function exposeEntityProfilePage(root, factory) {
  const entityProfilePage = factory();
  if (typeof module === 'object' && module.exports) module.exports = entityProfilePage;
  else root.MasterListEntityProfilePage = entityProfilePage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createEntityProfilePageModule() {
  function artistShows(gigs = [], name = '') {
    const lookup = name.toLocaleLowerCase();
    return gigs.filter((gig) => gig.artist.toLocaleLowerCase() === lookup);
  }

  function venueShows(gigs = [], name = '', city = '') {
    const venueLookup = name.toLocaleLowerCase();
    const cityLookup = city.toLocaleLowerCase();
    return gigs.filter((gig) => gig.venue.toLocaleLowerCase() === venueLookup
      && (!cityLookup || gig.city.toLocaleLowerCase() === cityLookup));
  }

  function artistStats(records = []) {
    return {
      shows: records.length,
      venues: new Set(records.map((gig) => `${gig.venue}|${gig.city}`)).size,
      songs: records.reduce((sum, gig) => sum + (gig.songs?.length || 0), 0),
      favourites: records.filter((gig) => gig.favorite).length
    };
  }

  function venueStats(records = []) {
    return {
      shows: records.length,
      artists: new Set(records.map((gig) => gig.artist)).size,
      cities: new Set(records.map((gig) => gig.city)).size,
      songs: records.reduce((sum, gig) => sum + (gig.songs?.length || 0), 0),
      favourites: records.filter((gig) => gig.favorite).length
    };
  }

  function artistStatsMarkup(stats) {
    return `<span>${stats.shows} show${stats.shows === 1 ? '' : 's'}</span><span>${stats.venues} venues</span><span>${stats.songs} songs performed</span><span>${stats.favourites} favourites</span>`;
  }

  function venueStatsMarkup(stats) {
    if (!stats.shows) return '';
    return `<span>${stats.shows} show${stats.shows === 1 ? '' : 's'}</span><span>${stats.artists} artists</span><span>${stats.cities} cities</span><span>${stats.songs} songs</span><span>${stats.favourites} favourites</span>`;
  }

  function presentImage(image, info, fallbackTitle, suffix) {
    image.hidden = !info.image;
    if (!info.image) return;
    image.src = info.image;
    image.alt = `${info.title || fallbackTitle} ${suffix}`;
    image.style.objectPosition = info.imagePosition || 'center';
  }

  function presentSource(source, href) {
    source.hidden = !href;
    if (href) source.href = href;
  }

  function createArtistController({ page, name, getGigs, fetchJson, renderShows, elements }) {
    const { heading, description, bio, image, source, editLink, empty, stats } = elements;
    return {
      async render() {
        if (page !== 'artist') return;
        if (!name) {
          heading.textContent = 'Artist not found';
          description.textContent = 'Choose an artist from your shows archive.';
          return;
        }
        editLink.href = `/artist/edit?name=${encodeURIComponent(name)}`;
        heading.textContent = name;
        const records = artistShows(getGigs(), name);
        renderShows(records);
        empty.hidden = records.length > 0;
        stats.innerHTML = artistStatsMarkup(artistStats(records));
        try {
          const info = await fetchJson(`/api/artists?name=${encodeURIComponent(name)}`);
          heading.textContent = info.title || name;
          description.textContent = info.description || '';
          bio.textContent = info.bio || 'No biography was found for this artist yet.';
          presentImage(image, info, name, 'portrait');
          presentSource(source, info.source);
        } catch (error) {
          description.textContent = 'Artist information could not be loaded right now.';
          bio.textContent = error.message;
        }
      }
    };
  }

  function createVenueController({ page, name, city, getGigs, fetchJson, renderShows, elements }) {
    const { heading, cityLabel, closedBadge, stats, empty, description, bio, image, source, editLink } = elements;
    return {
      async render() {
        if (page !== 'venue') return;
        const records = venueShows(getGigs(), name, city);
        heading.textContent = name || 'Venue not found';
        cityLabel.textContent = city;
        closedBadge.hidden = true;
        stats.innerHTML = venueStatsMarkup(venueStats(records));
        empty.hidden = Boolean(records.length);
        renderShows(records);
        if (!name) return;
        try {
          const info = await fetchJson(`/api/venues?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}`);
          heading.textContent = info.title || name;
          description.textContent = info.description || '';
          bio.textContent = info.bio || 'No venue biography was found yet.';
          closedBadge.hidden = !info.isClosed;
          presentImage(image, info, name, 'photo');
          presentSource(source, info.source);
          editLink.href = `/venue/edit?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}`;
        } catch {
          bio.textContent = 'Venue information could not be loaded right now.';
        }
      }
    };
  }

  return { artistShows, venueShows, artistStats, venueStats, createArtistController, createVenueController };
}));
