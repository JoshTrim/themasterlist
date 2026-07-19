(function exposeLocationsPage(root, factory) {
  const locationsPage = factory();
  if (typeof module === 'object' && module.exports) module.exports = locationsPage;
  else root.MasterListLocationsPage = locationsPage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createLocationsPageModule() {
  function cityVenues(gigs = [], city = '') {
    const matches = gigs.filter((gig) => gig.city.toLocaleLowerCase() === city.toLocaleLowerCase());
    const grouped = new Map();
    for (const gig of matches) {
      const key = `${gig.venue}|${gig.city}`;
      if (!grouped.has(key)) grouped.set(key, { venue: gig.venue, city: gig.city, shows: 0 });
      grouped.get(key).shows += 1;
    }
    return [...grouped.values()];
  }

  function cityVenueMarkup(venue, escapeHtml) {
    return `<a class="city-venue-card" href="/venue?name=${encodeURIComponent(venue.venue)}&city=${encodeURIComponent(venue.city)}"><strong>${escapeHtml(venue.venue)}</strong><span>${venue.shows} show${venue.shows === 1 ? '' : 's'}</span></a>`;
  }

  function popupMarkup(location, escapeHtml) {
    return `<strong>${escapeHtml(location.venue)}</strong><br><span>${escapeHtml(location.city)}</span><ul>${location.gigs.map((gig) => `<li><a href="/artist?name=${encodeURIComponent(gig.artist)}">${escapeHtml(gig.artist)}</a> · ${escapeHtml(gig.date || 'Date unknown')}</li>`).join('')}</ul>`;
  }

  function createCityController({ page, window, getGigs, escapeHtml, elements }) {
    const { heading, subtitle, venues: venueList } = elements;
    return {
      render() {
        if (page !== 'city') return;
        const city = new URLSearchParams(window.location.search).get('name')?.trim() || '';
        const venues = cityVenues(getGigs(), city);
        heading.textContent = city || 'Location';
        subtitle.textContent = `${venues.length} venue${venues.length === 1 ? '' : 's'} in this area`;
        venueList.innerHTML = venues.map((venue) => cityVenueMarkup(venue, escapeHtml)).join('') || '<p class="empty-state">No venues recorded here yet.</p>';
      }
    };
  }

  function createMapController({ page, getGigs, loadLeaflet, getLeaflet, fetchJson, escapeHtml, setTimeoutFn = globalThis.setTimeout, elements }) {
    const { button, message, mapElement } = elements;
    let map;
    let layer;

    function draw(locations) {
      if (!locations.length) {
        message.textContent = 'No venues could be placed yet. Try adding a clearer venue and city name.';
        return;
      }
      const L = getLeaflet();
      message.classList.remove('error');
      message.textContent = `${locations.length} venue${locations.length === 1 ? '' : 's'} placed. Select a marker to revisit a show.`;
      mapElement.hidden = false;
      if (!map) {
        map = L.map(mapElement, { scrollWheelZoom: true });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
        layer = L.layerGroup().addTo(map);
      }
      layer.clearLayers();
      for (const location of locations) {
        L.circleMarker([location.lat, location.lng], { radius: Math.min(7 + location.gigs.length * 2, 16), color: '#274b42', weight: 2, fillColor: '#e85c34', fillOpacity: 0.9 }).bindPopup(popupMarkup(location, escapeHtml)).addTo(layer);
      }
      const points = locations.map((location) => [location.lat, location.lng]);
      if (points.length === 1) map.setView(points[0], 13);
      else map.fitBounds(points, { padding: [48, 48], maxZoom: 13 });
      setTimeoutFn(() => map.invalidateSize(), 0);
    }

    async function load() {
      if (!getGigs().length) { message.textContent = 'Add a show first, then come back to map the places it happened.'; return; }
      button.disabled = true;
      button.textContent = 'Finding venues…';
      message.textContent = 'Looking up venues that have not been placed yet…';
      try {
        await loadLeaflet();
        const payload = await fetchJson('/api/map/locations', { method: 'POST' });
        draw(payload.locations);
      } catch (error) { message.textContent = error.message; message.classList.add('error'); }
      finally { button.disabled = false; button.textContent = 'Refresh map'; }
    }

    function bind() { button?.addEventListener('click', load); }
    function render() { if (page === 'map') return load(); }
    return { draw, load, bind, render, getMap: () => map };
  }

  return { cityVenues, cityVenueMarkup, popupMarkup, createCityController, createMapController };
}));
