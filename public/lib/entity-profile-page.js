(function exposeEntityProfilePage(root, factory) {
  const entityProfilePage = factory();
  if (typeof module === 'object' && module.exports) module.exports = entityProfilePage;
  else root.MasterListEntityProfilePage = entityProfilePage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createEntityProfilePageModule() {
  function artistShows(gigs = [], name = '') {
    const lookup = name.toLocaleLowerCase();
    return gigs.map((gig) => {
      if (gig.artist.toLocaleLowerCase() === lookup) return gig;
      const act = (gig.acts || []).find((entry) => String(entry.artist || '').toLocaleLowerCase() === lookup);
      return act ? { ...gig, artist: act.artist, songs: act.songs || [], setlistFmId: act.setlistFmId, setlistFmUrl: act.setlistFmUrl, performanceRating: null, performanceNotes: `${act.role} at this show` } : null;
    }).filter(Boolean);
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
      artists: new Set(records.flatMap((gig) => [gig.artist, ...(gig.acts || []).map((act) => act.artist)])).size,
      cities: new Set(records.map((gig) => gig.city)).size,
      songs: records.reduce((sum, gig) => sum + (gig.songs?.length || 0), 0),
      favourites: records.filter((gig) => gig.favorite).length
    };
  }

  function artistStatsMarkup(stats) {
    return `<span>${stats.shows} show${stats.shows === 1 ? '' : 's'}</span><span>${stats.venues} venue${stats.venues === 1 ? '' : 's'}</span><span>${stats.songs} song${stats.songs === 1 ? '' : 's'} performed</span><span>${stats.favourites} favourite${stats.favourites === 1 ? '' : 's'}</span>`;
  }

  function songKey(value) {
    return String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  }

  function recordKey(gig, index) {
    return gig.id || `${gig.date || 'undated'}|${gig.venue || ''}|${gig.city || ''}|${index}`;
  }

  function buildArtistHistory(records = []) {
    const songs = new Map();
    records.forEach((gig, gigIndex) => {
      const showKey = recordKey(gig, gigIndex);
      (gig.songs || []).forEach((song) => {
        const key = songKey(song.title);
        if (!key) return;
        let track = songs.get(key);
        if (!track) {
          track = { key, title: String(song.title).trim(), count: 0, shows: new Set(), years: new Set(), venues: new Set(), albums: new Map(), first: null, last: null };
          songs.set(key, track);
        }
        if (track.shows.has(showKey)) return;
        track.shows.add(showKey);
        track.count += 1;
        if (gig.venue) track.venues.add(`${gig.venue}|${gig.city || ''}`);
        const year = /^\d{4}/.exec(String(gig.date || ''))?.[0];
        if (year) track.years.add(year);
        const album = String(song.album || '').trim();
        if (album && !/^unknown album$/i.test(album)) track.albums.set(album, (track.albums.get(album) || 0) + 1);
        const appearance = { gig, date: gig.date || '', showKey };
        if (!track.first || String(appearance.date || '9999').localeCompare(String(track.first.date || '9999')) < 0) track.first = appearance;
        if (!track.last || String(appearance.date || '').localeCompare(String(track.last.date || '')) > 0) track.last = appearance;
      });
    });
    const stapleMinimum = Math.max(2, Math.ceil(records.length * .6));
    const tracks = [...songs.values()].map((track) => ({
      ...track,
      album: [...track.albums.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '',
      kind: track.count === 1 ? 'deep-cut' : track.count >= stapleMinimum ? 'staple' : 'repeat'
    })).sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
    return {
      tracks,
      uniqueSongs: tracks.length,
      totalPerformances: tracks.reduce((sum, track) => sum + track.count, 0),
      repeats: tracks.filter((track) => track.count > 1).length,
      deepCuts: tracks.filter((track) => track.count === 1).length,
      mostPlayed: tracks[0] || null
    };
  }

  function compareSetlists(first, second) {
    const indexed = (gig) => new Map((gig?.songs || []).filter((song) => songKey(song.title)).map((song) => [songKey(song.title), String(song.title).trim()]));
    const left = indexed(first); const right = indexed(second);
    const shared = [...left].filter(([key]) => right.has(key)).map(([, title]) => title);
    const onlyFirst = [...left].filter(([key]) => !right.has(key)).map(([, title]) => title);
    const onlySecond = [...right].filter(([key]) => !left.has(key)).map(([, title]) => title);
    const union = new Set([...left.keys(), ...right.keys()]).size;
    return { shared, onlyFirst, onlySecond, overlap: union ? Math.round(shared.length / union * 100) : 0 };
  }

  function showLabel(gig, formatDate) {
    return `${formatDate(gig.date, { year: 'numeric', month: 'short', day: 'numeric' })} · ${gig.venue || 'Venue unknown'}${gig.city ? `, ${gig.city}` : ''}`;
  }

  function comparisonMarkup(comparison, escapeHtml) {
    const column = (title, songs, className) => `<section class="${className}"><h4>${title}<span>${songs.length}</span></h4>${songs.length ? `<ol>${songs.map((song) => `<li>${escapeHtml(song)}</li>`).join('')}</ol>` : '<p>None</p>'}</section>`;
    return `<div class="artist-overlap"><strong>${comparison.overlap}%</strong><span>setlist overlap</span></div><div class="artist-comparison-grid">${column('Only first', comparison.onlyFirst, 'only-first')}${column('Played at both', comparison.shared, 'shared')}${column('Only second', comparison.onlySecond, 'only-second')}</div>`;
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

  function presentVenueMetadata(elements, info, { fallbackTitle = '', fallbackBio = '' } = {}) {
    const { heading, description, bio, closedBadge, image, source } = elements;
    heading.textContent = info.title || fallbackTitle;
    description.textContent = info.description || '';
    bio.textContent = info.bio || fallbackBio;
    closedBadge.hidden = !info.isClosed;
    presentImage(image, info, fallbackTitle, 'photo');
    presentSource(source, info.source);
  }

  function createArtistController({ page, name, getGigs, fetchJson, renderShows, escapeHtml = String, formatDate = (value) => value || 'Date unknown', elements }) {
    const { heading, description, bio, image, source, editLink, empty, stats, history, historySummary, songFilter, songKind, songSort, songbookResult, songbook, compareFirst, compareSecond, comparison } = elements;
    let records = [];
    let model = buildArtistHistory();
    let bound = false;

    function renderSongbook() {
      if (!songbook) return;
      const query = songKey(songFilter?.value);
      const kind = songKind?.value || 'all';
      const sort = songSort?.value || 'count';
      const tracks = model.tracks.filter((track) => (!query || songKey(`${track.title} ${track.album}`).includes(query))
        && (kind === 'all' || kind === 'repeat' && track.count > 1 || track.kind === kind));
      tracks.sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title)
        : sort === 'recent' ? (a, b) => String(b.last?.date || '').localeCompare(String(a.last?.date || '')) || b.count - a.count
          : (a, b) => b.count - a.count || a.title.localeCompare(b.title));
      songbookResult.textContent = `${tracks.length} of ${model.uniqueSongs} song${model.uniqueSongs === 1 ? '' : 's'}`;
      songbook.innerHTML = tracks.length ? tracks.map((track, index) => {
        const kindLabel = track.kind === 'deep-cut' ? 'Deep cut' : track.kind === 'staple' ? 'Staple' : 'Returning';
        const firstHref = track.first?.gig?.id ? `/show?id=${encodeURIComponent(track.first.gig.id)}` : '#';
        const lastHref = track.last?.gig?.id ? `/show?id=${encodeURIComponent(track.last.gig.id)}` : '#';
        return `<article class="artist-song-row"><span class="artist-song-rank">${String(index + 1).padStart(2, '0')}</span><div class="artist-song-title"><h3>${escapeHtml(track.title)}</h3><p>${track.album ? escapeHtml(track.album) : 'Release unknown'}</p></div><span class="artist-song-kind ${track.kind}">${kindLabel}</span><strong class="artist-song-count">${track.count}<small>show${track.count === 1 ? '' : 's'}</small></strong><div class="artist-song-dates"><span>First <a href="${firstHref}">${escapeHtml(formatDate(track.first?.date, { year: 'numeric', month: 'short', day: 'numeric' }))}</a></span><span>Latest <a href="${lastHref}">${escapeHtml(formatDate(track.last?.date, { year: 'numeric', month: 'short', day: 'numeric' }))}</a></span></div><span class="artist-song-years">${track.years.size} year${track.years.size === 1 ? '' : 's'}</span></article>`;
      }).join('') : '<p class="empty-state">No songs match these filters.</p>';
    }

    function renderComparison() {
      if (!comparison || records.length < 2) return;
      const first = records.find((gig, index) => recordKey(gig, index) === compareFirst.value);
      const second = records.find((gig, index) => recordKey(gig, index) === compareSecond.value);
      comparison.innerHTML = comparisonMarkup(compareSetlists(first, second), escapeHtml);
    }

    function renderHistory() {
      if (!history) return;
      model = buildArtistHistory(records);
      history.hidden = !model.uniqueSongs;
      if (!model.uniqueSongs) return;
      historySummary.innerHTML = `<span><strong>${model.uniqueSongs}</strong>Unique songs</span><span><strong>${model.totalPerformances}</strong>Total performances</span><span><strong>${model.repeats}</strong>Heard repeatedly</span><span><strong>${model.deepCuts}</strong>Deep cuts</span><span><strong>${escapeHtml(model.mostPlayed?.title || '—')}</strong>Most heard · ${model.mostPlayed?.count || 0}×</span>`;
      renderSongbook();
      const options = records.map((gig, index) => `<option value="${escapeHtml(recordKey(gig, index))}">${escapeHtml(showLabel(gig, formatDate))}</option>`).join('');
      compareFirst.innerHTML = options;
      compareSecond.innerHTML = options;
      const canCompare = records.length >= 2;
      compareFirst.disabled = !canCompare; compareSecond.disabled = !canCompare;
      if (canCompare) {
        compareFirst.selectedIndex = Math.max(0, records.length - 2);
        compareSecond.selectedIndex = records.length - 1;
        renderComparison();
      } else comparison.innerHTML = '<p class="empty-state">Log another setlist by this artist to compare shows.</p>';
      if (!bound) {
        [songFilter, songKind, songSort].forEach((control) => control?.addEventListener(control === songFilter ? 'input' : 'change', renderSongbook));
        [compareFirst, compareSecond].forEach((control) => control?.addEventListener('change', renderComparison));
        bound = true;
      }
    }
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
        records = artistShows(getGigs(), name).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
        renderShows(records);
        empty.hidden = records.length > 0;
        stats.innerHTML = artistStatsMarkup(artistStats(records));
        renderHistory();
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
          presentVenueMetadata(elements, info, { fallbackTitle: name, fallbackBio: 'No venue biography was found yet.' });
          editLink.href = `/venue/edit?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}`;
        } catch {
          bio.textContent = 'Venue information could not be loaded right now.';
        }
      }
    };
  }

  return { artistShows, venueShows, artistStats, venueStats, artistStatsMarkup, venueStatsMarkup, songKey, buildArtistHistory, compareSetlists, comparisonMarkup, presentVenueMetadata, createArtistController, createVenueController };
}));
