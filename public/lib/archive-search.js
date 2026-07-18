(function exposeArchiveSearch(root, factory) {
  const archiveSearch = factory();
  if (typeof module === 'object' && module.exports) module.exports = archiveSearch;
  else root.MasterListArchiveSearch = archiveSearch;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createArchiveSearchModule() {
  function createSearchController({ page, window, getGigs, escapeHtml, formatGigDate, input, yearInput, ratingInput, mediaInput, favouriteInput, summary, results }) {
    const globalSearchInput = input; const globalSearchYear = yearInput; const globalSearchRating = ratingInput;
    const globalSearchMedia = mediaInput; const globalSearchFavourite = favouriteInput;
    const globalSearchSummary = summary; const globalSearchResults = results;
    const normaliseSearch = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
    const uniqueSearchResults = (items, key) => [...new Map(items.map((item) => [key(item), item])).values()];

    function searchSection(title, items) {
      if (!items.length) return '';
      return `<section class="global-search-section"><div class="global-search-section-heading"><h2>${escapeHtml(title)}</h2><span>${items.length}</span></div><div class="global-search-grid">${items.join('')}</div></section>`;
    }

    function update() {
      const gigs = getGigs();
      if (page !== 'search' || !globalSearchResults) return;
      const query = normaliseSearch(globalSearchInput.value);
      const year = globalSearchYear.value;
      const minimumRating = Number(globalSearchRating.value || 0);
      const mediaFilter = globalSearchMedia.value;
      const favouritesOnly = globalSearchFavourite.checked;
      const eligible = gigs.filter((gig) => {
        const mediaCount = gig.media?.length || 0;
        return (!year || String(gig.date || '').startsWith(year))
          && Number(gig.performanceRating || 0) >= minimumRating
          && (!favouritesOnly || gig.favorite)
          && (mediaFilter === 'any' || (mediaFilter === 'with' ? mediaCount > 0 : mediaCount === 0));
      }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const searchableGigText = (gig) => normaliseSearch([
        gig.artist, gig.venue, gig.city, gig.date, gig.notes, gig.performanceNotes, gig.venueNotes,
        ...(gig.songs || []).flatMap((song) => [song.title, song.artist, song.album, song.info]),
        ...(gig.media || []).flatMap((item) => [item.caption, item.filename, item.recognitionTitle, item.recognitionArtist, item.recognitionAlbum])
      ].join(' '));
      const showMatches = eligible.filter((gig) => !query || searchableGigText(gig).includes(query));
      const showCards = showMatches.map((gig) => {
        const matchingNote = query ? [gig.performanceNotes, gig.venueNotes, gig.notes, ...(gig.media || []).map((item) => item.caption)].find((value) => normaliseSearch(value).includes(query)) : '';
        return `<a class="global-search-card global-search-show" href="/show?id=${encodeURIComponent(gig.id)}"><span class="global-search-type">Show</span><h3>${escapeHtml(gig.artist)}</h3><p>${escapeHtml(gig.venue)} · ${escapeHtml(gig.city)} · ${escapeHtml(formatGigDate(gig.date))}</p>${matchingNote ? `<blockquote>${escapeHtml(String(matchingNote).slice(0, 180))}</blockquote>` : ''}<small>${gig.songs?.length || 0} tracks · ${gig.media?.length || 0} media${gig.performanceRating ? ` · ${gig.performanceRating}/5` : ''}${gig.favorite ? ' · ♥' : ''}</small></a>`;
      });
      let trackCards = [];
      let artistCards = [];
      let placeCards = [];
      let mediaCards = [];
      if (query) {
        trackCards = eligible.flatMap((gig) => (gig.songs || []).filter((song) => normaliseSearch([song.title, song.artist, song.album, song.info].join(' ')).includes(query)).map((song) => `<a class="global-search-card" href="/show?id=${encodeURIComponent(gig.id)}#setlist"><span class="global-search-type">Track</span><h3>${escapeHtml(song.title)}</h3><p>${escapeHtml(gig.artist)} · ${escapeHtml(gig.venue)}</p><small>${escapeHtml(song.album || 'Album unknown')} · ${escapeHtml(formatGigDate(gig.date))}</small></a>`));
        const artists = uniqueSearchResults(eligible.filter((gig) => normaliseSearch(gig.artist).includes(query)), (gig) => normaliseSearch(gig.artist));
        artistCards = artists.map((gig) => { const shows = gigs.filter((entry) => normaliseSearch(entry.artist) === normaliseSearch(gig.artist)).length; return `<a class="global-search-card" href="/artist?name=${encodeURIComponent(gig.artist)}"><span class="global-search-type">Artist</span><h3>${escapeHtml(gig.artist)}</h3><p>${shows} archived show${shows === 1 ? '' : 's'}</p></a>`; });
        const places = uniqueSearchResults(eligible.filter((gig) => normaliseSearch(`${gig.venue} ${gig.city}`).includes(query)), (gig) => `${normaliseSearch(gig.venue)}|${normaliseSearch(gig.city)}`);
        placeCards = places.map((gig) => { const shows = gigs.filter((entry) => normaliseSearch(entry.venue) === normaliseSearch(gig.venue) && normaliseSearch(entry.city) === normaliseSearch(gig.city)).length; return `<a class="global-search-card" href="/venue?name=${encodeURIComponent(gig.venue)}&city=${encodeURIComponent(gig.city)}"><span class="global-search-type">Venue</span><h3>${escapeHtml(gig.venue)}</h3><p>${escapeHtml(gig.city)} · ${shows} show${shows === 1 ? '' : 's'}</p></a>`; });
        mediaCards = eligible.flatMap((gig) => (gig.media || []).filter((item) => item.caption && normaliseSearch(item.caption).includes(query)).map((item) => `<a class="global-search-card" href="/show?id=${encodeURIComponent(gig.id)}#${item.category === 'artifact' ? 'artifacts' : 'media'}"><span class="global-search-type">${item.category === 'artifact' ? 'Artifact' : 'Media'}</span><h3>${escapeHtml(item.caption)}</h3><p>${escapeHtml(gig.artist)} · ${escapeHtml(gig.venue)}</p><small>${escapeHtml(formatGigDate(gig.date))}</small></a>`));
      }
      const total = showCards.length + trackCards.length + artistCards.length + placeCards.length + mediaCards.length;
      globalSearchSummary.textContent = query ? `${total} result${total === 1 ? '' : 's'} for “${globalSearchInput.value.trim()}”` : `${showCards.length} show${showCards.length === 1 ? '' : 's'} match the selected filters`;
      globalSearchResults.innerHTML = total ? `${searchSection('Shows', showCards)}${searchSection('Tracks', trackCards)}${searchSection('Artists', artistCards)}${searchSection('Venues & cities', placeCards)}${searchSection('Media & artifacts', mediaCards)}` : '<div class="empty-state">No archive entries match this search.</div>';
    }

    function render() {
      const gigs = getGigs();
      if (page !== 'search' || !globalSearchInput) return;
      const years = [...new Set(gigs.map((gig) => String(gig.date || '').slice(0, 4)).filter((year) => /^\d{4}$/.test(year)))].sort((a, b) => b.localeCompare(a));
      globalSearchYear.innerHTML = `<option value="">All years</option>${years.map((year) => `<option value="${year}">${year}</option>`).join('')}`;
      const initialQuery = new URLSearchParams(window.location.search).get('q') || '';
      globalSearchInput.value = initialQuery;
      [globalSearchInput, globalSearchYear, globalSearchRating, globalSearchMedia, globalSearchFavourite].forEach((control) => control.addEventListener(control === globalSearchInput ? 'input' : 'change', update));
      update();
      globalSearchInput.focus();
    }

    return { update, render };
  }
  return { createSearchController };
}));
