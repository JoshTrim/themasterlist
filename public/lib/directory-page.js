(function exposeDirectoryPage(root, factory) {
  const directoryPage = factory();
  if (typeof module === 'object' && module.exports) module.exports = directoryPage;
  else root.MasterListDirectoryPage = directoryPage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createDirectoryPageModule() {
  function metadataBadges(entity, escapeHtml, { venue = false } = {}) {
    const closed = entity.isClosed ? '<span class="venue-status-closed">Permanently closed</span>' : '';
    const missing = venue ? (entity.missingMetadata || []).filter((field) => field !== 'source') : entity.missingMetadata;
    if (!missing.length) return closed;
    return closed + missing.map((field) => `<span class="metadata-status-missing">Missing ${escapeHtml(field === 'bio' ? 'biography' : field)}</span>`).join('');
  }

  function artistCardMarkup(artist, { escapeHtml, formatGigDate, initials, eager = false }) {
    const description = artist.description || (artist.latestDate ? `Last seen ${formatGigDate(artist.latestDate)}` : 'An undated archive memory');
    return `<article class="entity-card entity-card-artist" data-entity-name="${escapeHtml(artist.name)}"><a class="entity-card-profile" href="/artist?name=${encodeURIComponent(artist.name)}"><div class="entity-card-image"><span aria-hidden="true">${escapeHtml(initials(artist.name))}</span>${artist.image ? `<img src="${escapeHtml(artist.image)}" alt="" loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} decoding="async" style="object-position:${escapeHtml(artist.imagePosition)}" />` : ''}</div><div class="entity-card-copy"><p class="eyebrow">${artist.shows} show${artist.shows === 1 ? '' : 's'} · ${artist.venues.size} venue${artist.venues.size === 1 ? '' : 's'}</p><h2>${escapeHtml(artist.name)}</h2><p>${escapeHtml(description)}</p><div class="entity-card-stats"><span><strong>${artist.averageRating ? artist.averageRating.toFixed(1) : '—'}</strong>Avg rating</span><span><strong>${artist.favourites}</strong>Favourite${artist.favourites === 1 ? '' : 's'}</span><span><strong>${artist.latestDate ? artist.latestDate.slice(0, 4) : '—'}</strong>Last seen</span></div></div></a><div class="entity-card-metadata">${metadataBadges(artist, escapeHtml)}</div><a class="entity-card-edit" href="/artist/edit?name=${encodeURIComponent(artist.name)}" aria-label="Edit ${escapeHtml(artist.name)} metadata">✎ <span>Edit</span></a></article>`;
  }

  function venueCardMarkup(venue, { escapeHtml, formatGigDate, initials, eager = false }) {
    const description = venue.description || (venue.latestDate ? `Last visited ${formatGigDate(venue.latestDate)}` : 'An undated archive location');
    return `<article class="entity-card entity-card-venue" data-entity-name="${escapeHtml(venue.name)}" data-entity-city="${escapeHtml(venue.city)}" data-has-location="${venue.hasLocation}"><a class="entity-card-profile" href="/venue?name=${encodeURIComponent(venue.name)}&city=${encodeURIComponent(venue.city)}"><div class="entity-card-image"><span aria-hidden="true">${escapeHtml(initials(venue.name))}</span>${venue.image ? `<img src="${escapeHtml(venue.image)}" alt="" loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} decoding="async" style="object-position:${escapeHtml(venue.imagePosition)}" />` : ''}</div><div class="entity-card-copy"><p class="eyebrow">${escapeHtml(venue.city || 'Location unknown')}</p><h2>${escapeHtml(venue.name)}</h2><p>${escapeHtml(description)}</p><div class="entity-card-stats"><span><strong>${venue.shows}</strong>Visit${venue.shows === 1 ? '' : 's'}</span><span><strong>${venue.artists.size}</strong>Artist${venue.artists.size === 1 ? '' : 's'}</span><span><strong>${venue.latestDate ? venue.latestDate.slice(0, 4) : '—'}</strong>Last visit</span></div></div></a><div class="entity-card-metadata">${metadataBadges(venue, escapeHtml, { venue: true })}</div><a class="entity-card-edit" href="/venue/edit?name=${encodeURIComponent(venue.name)}&city=${encodeURIComponent(venue.city)}" aria-label="Edit ${escapeHtml(venue.name)} metadata">✎ <span>Edit</span></a></article>`;
  }

  function bindImageFallbacks(grid) {
    grid.querySelectorAll('.entity-card-image img').forEach((image) => image.addEventListener('error', () => {
      image.closest('.entity-card-image')?.classList.add('is-missing');
      image.remove();
    }, { once: true }));
  }

  function createMetadataLoader({ fetchJson, endpoint = '/api/directory/metadata' }) {
    let metadataPromise;
    function load() {
      if (!metadataPromise) {
        metadataPromise = fetchJson(endpoint).catch(() => ({ artists: [], venues: [], locations: [] }));
      }
      return metadataPromise;
    }
    return { load };
  }

  function createHydrator({ window, document, fetchJson, missingFields, escapeHtml }) {
    const observers = new WeakMap();
    const requests = new Map();
    const queue = [];
    let active = 0;
    function entityInfo(type, name, city = '') {
      const key = `${type}|${name}|${city}`.toLocaleLowerCase();
      if (!requests.has(key)) {
        const endpoint = type === 'artist' ? `/api/artists?name=${encodeURIComponent(name)}` : `/api/venues?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}`;
        requests.set(key, fetchJson(endpoint).catch(() => null));
      }
      return requests.get(key);
    }
    function run() {
      while (active < 2 && queue.length) {
        const task = queue.shift(); active += 1;
        entityInfo(task.type, task.name, task.city).then((info) => {
          if (!info || !task.card.isConnected) return;
          const status = task.card.querySelector('.entity-card-metadata');
          if (status) status.innerHTML = metadataBadges({ isClosed: Boolean(info.isClosed), missingMetadata: missingFields(task.type, info, task.card.dataset.hasLocation !== 'false') }, escapeHtml, { venue: task.type === 'venue' });
          if (info.image && !task.card.querySelector('.entity-card-image img')) {
            const image = document.createElement('img'); image.alt = ''; image.loading = 'eager'; image.fetchPriority = 'high'; image.decoding = 'async'; image.style.objectPosition = info.imagePosition || 'center';
            image.addEventListener('error', () => { task.card.querySelector('.entity-card-image')?.classList.add('is-missing'); image.remove(); }, { once: true });
            image.src = info.image; task.card.querySelector('.entity-card-image')?.append(image);
          }
        }).finally(() => { active -= 1; run(); });
      }
    }
    function hydrate(grid, type) {
      observers.get(grid)?.disconnect();
      const cards = [...grid.querySelectorAll('.entity-card')].filter((card) => !card.querySelector('.entity-card-image img'));
      const enqueue = (card) => { queue.push({ card, type, name: card.dataset.entityName, city: card.dataset.entityCity || '' }); run(); };
      if (!cards.length) return;
      if (!('IntersectionObserver' in window)) { cards.forEach(enqueue); return; }
      const observer = new window.IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { observer.unobserve(entry.target); enqueue(entry.target); } }), { rootMargin: '240px' });
      cards.forEach((card) => observer.observe(card)); observers.set(grid, observer);
    }
    return { hydrate, entityInfo };
  }

  function createController({ page, window, getShows, getRemoteShows, loadMetadata, directoryUi, escapeHtml, formatGigDate, hydrator, elements }) {
    async function render() {
      if (!['artists', 'venues'].includes(page)) return;
      const metadata = await loadMetadata();
      const shows = [...getShows(), ...getRemoteShows()];
      const requested = new URLSearchParams(window.location.search).get('metadata');
      const config = page === 'artists'
        ? { type: 'artist', entities: directoryUi.buildArtists(shows, new Map(metadata.artists.map((entry) => [entry.lookupName, entry]))), controls: elements.artists, card: artistCardMarkup, empty: 'No artists match those filters.' }
        : { type: 'venue', entities: directoryUi.buildVenues(shows, new Map(metadata.venues.map((entry) => [entry.lookupName, entry])), new Set(metadata.locations || [])), controls: elements.venues, card: venueCardMarkup, empty: 'No venues match those filters.' };
      const { entities, controls, type } = config;
      if ([...controls.metadata.options].some((option) => option.value === requested)) controls.metadata.value = requested;
      const draw = () => {
        const visible = directoryUi.visibleEntities(entities, { type, query: controls.filter.value, metadata: controls.metadata.value, sort: controls.sort.value });
        const incomplete = entities.filter((entity) => entity.missingMetadata.length).length;
        controls.summary.textContent = `${visible.length} of ${entities.length} ${type}${entities.length === 1 ? '' : 's'} · ${incomplete} need review`;
        controls.grid.innerHTML = visible.map((entity, index) => config.card(entity, { escapeHtml, formatGigDate, initials: directoryUi.initials, eager: index < 4 })).join('') || `<p class="empty-state entity-directory-empty">${config.empty}</p>`;
        bindImageFallbacks(controls.grid); hydrator.hydrate(controls.grid, type);
      };
      controls.filter.addEventListener('input', draw); controls.metadata.addEventListener('change', draw); controls.sort.addEventListener('change', draw); draw();
    }
    return { render };
  }

  return { metadataBadges, artistCardMarkup, venueCardMarkup, bindImageFallbacks, createMetadataLoader, createHydrator, createController };
}));
