(function initArchivePage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListArchivePage = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function archivePageFactory() {
  function remoteSharedShows(gigs, sharedShows) {
    const localIds = new Set(gigs.flatMap((gig) => [gig.id, gig.sharedId].filter(Boolean)));
    return sharedShows.filter((show) => show.contributions?.length && !localIds.has(show.id) && !localIds.has(show.sourceGigId));
  }

  function artistInitials(artist) {
    return String(artist || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '♪';
  }

  function artistImageFromMetadata(artist, metadata = []) {
    const key = String(artist || '').trim().toLocaleLowerCase();
    return metadata.find((entry) => String(entry.lookupName || '').trim().toLocaleLowerCase() === key)?.image || '';
  }

  function createController({
    window, document, OptionClass = Option, fetchJson, escapeHtml, formatDate,
    showsModule, cardsModule, getState, onGigs, setMessage, renderAttendeeSummary,
    setupSetlist, setupExports, renderMediaGallery, elements
  }) {
    const { count, stats: statsElement, list, empty, queryInput, yearInput, sortInput, favouriteInput, template } = elements;
    const imageCache = new Map();

    function setupMedia(card, media = [], options = {}) {
      cardsModule.setupMediaSection(card, media, options, renderMediaGallery);
    }

    function setupArtifacts(card, gig) {
      cardsModule.setupArtifactSection(card, gig, renderMediaGallery);
    }

    function setupArtistVisual(card, artist) {
      const article = card.querySelector('.gig-card');
      const date = card.querySelector('.gig-date');
      if (!article || !date) return;
      const visual = document.createElement('div');
      visual.className = 'gig-artist-visual';
      const link = document.createElement('a');
      link.className = 'gig-artist-image';
      link.href = `/artist?name=${encodeURIComponent(artist)}`;
      link.setAttribute('aria-label', `View ${artist}`);
      link.innerHTML = `<span aria-hidden="true">${escapeHtml(artistInitials(artist))}</span><img alt="" loading="lazy" decoding="async" hidden>`;
      visual.append(link, date);
      article.prepend(visual);
      article.dataset.artistName = artist;
    }

    async function artistImage(artist) {
      const key = artist.trim().toLocaleLowerCase();
      if (!imageCache.has(key)) {
        const cachedImage = artistImageFromMetadata(artist, getState().artistImages);
        imageCache.set(key, cachedImage
          ? Promise.resolve(cachedImage)
          : fetchJson(`/api/artists?name=${encodeURIComponent(artist)}`).then((info) => info.image || '').catch(() => ''));
      }
      return imageCache.get(key);
    }

    function hydrateArtistImages() {
      const visuals = [...list.querySelectorAll('.gig-card[data-artist-name] .gig-artist-image')];
      const artists = new Map();
      for (const visual of visuals) {
        const artist = visual.closest('.gig-card')?.dataset.artistName;
        if (!artist) continue;
        const key = artist.trim().toLocaleLowerCase();
        if (!artists.has(key)) artists.set(key, { artist, visuals: [] });
        artists.get(key).visuals.push(visual);
      }
      let priority = 0;
      for (const { artist, visuals: artistVisuals } of artists.values()) {
        const highPriority = priority < 3;
        artistImage(artist).then((imageUrl) => {
          if (!imageUrl) return;
          for (const visual of artistVisuals) {
            if (!visual.isConnected) continue;
            const image = visual.querySelector('img');
            if (highPriority) { image.loading = 'eager'; image.fetchPriority = 'high'; }
            image.addEventListener('load', () => visual.classList.add('has-image'), { once: true });
            image.addEventListener('error', () => { visual.classList.remove('has-image'); image.hidden = true; image.removeAttribute('src'); }, { once: true });
            image.hidden = false;
            image.src = imageUrl;
          }
        });
        priority += 1;
      }
    }

    function createRemoteCard(show) {
      return cardsModule.createRemoteCard({ template, show, formatGigDate: formatDate, escapeHtml, setupArtistVisual, setupSetlist, renderMediaGallery });
    }

    function render() {
      const { gigs, sharedShows } = getState();
      const remoteShows = remoteSharedShows(gigs, sharedShows);
      const allShows = [...gigs, ...remoteShows];
      const stats = showsModule.archiveStats(gigs, remoteShows);
      count.textContent = `${allShows.length} show${allShows.length === 1 ? '' : 's'}`;
      statsElement.innerHTML = `<span>${stats.shows} shows</span><span>${stats.artists} artists</span><span>${stats.venues} venues</span><span>${stats.favourites} favourites</span><span>${stats.songs} songs</span>`;
      const query = queryInput?.value.trim().toLowerCase() || '';
      const year = yearInput?.value || '';
      const sort = sortInput?.value || 'newest';
      const selected = showsModule.selectArchiveShows({ gigs, remoteShows, query, year, favouritesOnly: Boolean(favouriteInput?.checked), sort });
      empty.hidden = Boolean(selected.local.length || selected.remote.length);
      list.replaceChildren();
      for (const gig of selected.local) {
        const card = cardsModule.createLocalCard({
          document, template, gig, sharedShows, formatGigDate: formatDate, escapeHtml, setupArtistVisual,
          renderAttendeeSummary, setupSetlist, setupExports, setupMedia, setupArtifacts,
          patchGig: (id, body) => fetchJson(`/api/gigs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
          deleteGig: (id) => fetchJson(`/api/gigs/${id}`, { method: 'DELETE' }),
          onUpdate: (updated) => { onGigs(gigs.map((entry) => entry.id === updated.id ? updated : entry)); render(); },
          onDelete: (removed) => { onGigs(gigs.filter((item) => item.id !== removed.id)); render(); },
          onError: (error) => setMessage(error.message, true), confirm: window.confirm.bind(window)
        });
        list.append(card);
      }
      selected.remote.forEach((show) => list.append(createRemoteCard(show)));
      const cards = [...list.children].sort((a, b) => sort === 'oldest'
        ? showsModule.compareDates(a.dataset.showDate, b.dataset.showDate, true)
        : sort === 'rating'
          ? Number(b.dataset.showRating || 0) - Number(a.dataset.showRating || 0) || showsModule.compareDates(a.dataset.showDate, b.dataset.showDate)
          : showsModule.compareDates(a.dataset.showDate, b.dataset.showDate));
      list.append(...cards);
      hydrateArtistImages();
      if (window.location.hash.startsWith('#shared-')) window.requestAnimationFrame(() => document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return selected;
    }

    function populateYears() {
      if (!yearInput) return;
      const selected = yearInput.value;
      const { gigs, sharedShows } = getState();
      yearInput.replaceChildren(new OptionClass('All years', ''));
      [...new Set([...gigs, ...remoteSharedShows(gigs, sharedShows)].map((gig) => gig.date.slice(0, 4)).filter(Boolean))]
        .sort().reverse().forEach((year) => yearInput.add(new OptionClass(year, year)));
      yearInput.value = selected;
    }

    function bind() {
      [queryInput, yearInput, sortInput, favouriteInput].forEach((control) => control?.addEventListener('input', render));
    }

    return { remoteShows: () => remoteSharedShows(getState().gigs, getState().sharedShows), setupMedia, setupArtifacts, setupArtistVisual, render, populateYears, bind };
  }

  return { remoteSharedShows, artistInitials, artistImageFromMetadata, createController };
}));
