(function exposeOverviewPage(root, factory) {
  const overviewPage = factory();
  if (typeof module === 'object' && module.exports) module.exports = overviewPage;
  else root.MasterListOverviewPage = overviewPage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createOverviewPageModule() {
  const countBy = (values) => Object.entries(values.reduce((result, value) => { result[value] = (result[value] || 0) + 1; return result; }, {})).sort((a, b) => b[1] - a[1]);
  function buildLocalStats(gigs = []) {
    const topVenues = countBy(gigs.map((gig) => `${gig.venue}\u001f${gig.city}`)).slice(0, 5).map(([key, count]) => { const [name, city] = key.split('\u001f'); return [name, city, count]; });
    return {
      shows: gigs.length, artists: new Set(gigs.map((gig) => gig.artist.toLowerCase())).size,
      venues: new Set(gigs.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size,
      cities: new Set(gigs.map((gig) => gig.city.toLowerCase())).size,
      songs: gigs.reduce((sum, gig) => sum + (gig.songs?.length || 0), 0), favourites: gigs.filter((gig) => gig.favorite).length,
      topArtists: countBy(gigs.map((gig) => gig.artist)).slice(0, 5), topVenues
    };
  }
  function buildCompletion(shows, metadata, missingFields) {
    const artistMetadata = new Map(metadata.artists.map((entry) => [entry.lookupName, entry]));
    const venueMetadata = new Map(metadata.venues.map((entry) => [entry.lookupName, entry])); const locations = new Set(metadata.locations || []);
    const artistKeys = [...new Set(shows.map((gig) => gig.artist.trim().toLocaleLowerCase()).filter(Boolean))];
    const venueKeys = [...new Set(shows.map((gig) => `${gig.venue}|${gig.city}`.toLocaleLowerCase()))];
    const artistComplete = artistKeys.filter((key) => !missingFields('artist', artistMetadata.get(key)).length).length;
    const venueComplete = venueKeys.filter((key) => !missingFields('venue', venueMetadata.get(key), locations.has(key)).length).length;
    const percent = (complete, total) => total ? Math.round(complete / total * 100) : 0;
    return { artists: { complete: artistComplete, total: artistKeys.length, percentage: percent(artistComplete, artistKeys.length) }, venues: { complete: venueComplete, total: venueKeys.length, percentage: percent(venueComplete, venueKeys.length) } };
  }
  function buildGenreSummary(genres = []) {
    return { genres, knownShows: genres.filter((entry) => entry.genre !== 'Unknown').reduce((sum, entry) => sum + entry.shows, 0) };
  }
  const dateParts = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
  };
  const songKey = (artist, title) => `${String(artist || '').trim().toLocaleLowerCase()}\u001f${String(title || '').trim().toLocaleLowerCase()}`;
  function buildDiscovery(gigs = [], now = new Date()) {
    const dated = gigs.filter((gig) => dateParts(gig.date)).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
    const onThisDay = dated.filter((gig) => { const date = dateParts(gig.date); return date.year < today.year && date.month === today.month && date.day === today.day; }).sort((a, b) => b.date.localeCompare(a.date));
    const tracks = new Map();
    for (const gig of dated) for (const song of gig.songs || []) {
      const title = String(song.title || '').trim(); if (!title) continue;
      const artist = String(song.artist || gig.artist || '').trim(); const key = songKey(artist, title);
      const entry = tracks.get(key) || { artist, title, count: 0, shows: [] };
      entry.count += 1; entry.shows.push(gig); tracks.set(key, entry);
    }
    const rankedTracks = [...tracks.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
    const deepCuts = rankedTracks.filter((track) => track.count === 1).sort((a, b) => String(b.shows[0].date).localeCompare(String(a.shows[0].date))).slice(0, 6);
    const mostPlayed = rankedTracks.slice(0, 6);
    const milestones = [];
    const artistVisits = new Map(); const venueVisits = new Map();
    dated.forEach((gig, index) => {
      const showNumber = index + 1;
      if ([1, 10, 25, 50, 100, 200, 500].includes(showNumber)) milestones.push({ gig, label: showNumber === 1 ? 'Archive begins' : `${showNumber}th show`, detail: gig.artist });
      const artistKey = String(gig.artist || '').trim().toLocaleLowerCase(); const artistCount = (artistVisits.get(artistKey) || 0) + 1; artistVisits.set(artistKey, artistCount);
      if ([5, 10, 20, 50].includes(artistCount)) milestones.push({ gig, label: `${artistCount}th ${gig.artist} show`, detail: `Artist milestone` });
      const venueKey = `${gig.venue}|${gig.city}`.toLocaleLowerCase(); const venueCount = (venueVisits.get(venueKey) || 0) + 1; venueVisits.set(venueKey, venueCount);
      if ([5, 10, 20, 50].includes(venueCount)) milestones.push({ gig, label: `${venueCount}th visit`, detail: gig.venue });
    });
    milestones.sort((a, b) => String(b.gig.date).localeCompare(String(a.gig.date)));
    const recentMedia = gigs.flatMap((gig) => (gig.media || []).map((media) => ({ ...media, gig })))
      .filter((media) => media.createdAt).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
    return { onThisDay, deepCuts, mostPlayed, milestones: milestones.slice(0, 6), recentMedia, roulette: gigs.filter((gig) => gig.id) };
  }
  function createController({ page, getGigs, getRemoteShows, loadMetadata, missingFields, fetchJson, escapeHtml, formatDate = (value) => value, random = Math.random, now = () => new Date(), elements }) {
    const { dashboard, discovery, genres: genreSection, genreNote, genreChart } = elements; let genrePromise; let discoveryModel;
    const completionMarkup = (completion) => `<section class="metadata-completion" aria-labelledby="metadata-completion-heading"><div><p class="eyebrow">Archive completion</p><h2 id="metadata-completion-heading">Metadata status</h2></div><a href="/artists?metadata=incomplete"><span><strong>${completion.artists.percentage}%</strong>Artists complete</span><small>${completion.artists.total - completion.artists.complete} need review →</small></a><a href="/venues?metadata=incomplete"><span><strong>${completion.venues.percentage}%</strong>Venues complete</span><small>${completion.venues.total - completion.venues.complete} need review →</small></a></section>`;
    function renderStats(stats, completion, gigs) {
      const artistLinks = stats.topArtists.map(([name, count]) => `<a class="dashboard-stat-link" href="/artist?name=${encodeURIComponent(name)}"><span>${escapeHtml(name)}</span><small>${count} show${count === 1 ? '' : 's'}</small></a>`).join('') || '<span>None yet</span>';
      const venueLinks = stats.topVenues.map(([name, cityOrCount, possibleCount]) => { const legacy = possibleCount === undefined; const city = legacy ? gigs.find((gig) => gig.venue === name)?.city || '' : cityOrCount; const count = legacy ? cityOrCount : possibleCount; return `<a class="dashboard-stat-link" href="/venue?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}"><span>${escapeHtml(name)}</span><small>${escapeHtml(city)}${city ? ' · ' : ''}${count} show${count === 1 ? '' : 's'}</small></a>`; }).join('') || '<span>None yet</span>';
      dashboard.innerHTML = `<p class="eyebrow">Archive snapshot</p><div class="dashboard-stat-grid"><span><strong>${stats.shows}</strong> shows</span><span><strong>${stats.artists}</strong> artists</span><span><strong>${stats.venues}</strong> venues</span><span><strong>${stats.cities}</strong> cities</span><span><strong>${stats.songs}</strong> songs</span><span><strong>${stats.favourites}</strong> favourites</span></div><div class="dashboard-stat-columns"><div><b>Most seen artists</b>${artistLinks}</div><div><b>Most visited venues</b>${venueLinks}</div></div>${completionMarkup(completion)}`;
    }
    const showLink = (gig, label = gig.artist) => `<a href="/show?id=${encodeURIComponent(gig.id)}">${escapeHtml(label)}</a>`;
    function rouletteMarkup(gig) {
      return gig ? `<span>${escapeHtml(formatDate(gig.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</span><strong>${showLink(gig)}</strong><small>${escapeHtml(gig.venue)} · ${escapeHtml(gig.city)}</small>` : '<span>The archive is empty</span><strong>Add a show to begin</strong>';
    }
    function renderDiscovery(gigs) {
      if (!discovery) return;
      const currentDate = now();
      discoveryModel = buildDiscovery(gigs, currentDate);
      const anniversaries = discoveryModel.onThisDay.length ? discoveryModel.onThisDay.map((gig) => { const years = currentDate.getFullYear() - dateParts(gig.date).year; return `<article><span>${years} year${years === 1 ? '' : 's'} ago</span><strong>${showLink(gig)}</strong><small>${escapeHtml(gig.venue)} · ${escapeHtml(gig.city)}</small></article>`; }).join('') : '<p class="discovery-empty">No shows from this date in earlier years. The archive remembers anyway.</p>';
      const milestones = discoveryModel.milestones.map((entry) => `<li><i>◆</i><div><strong>${escapeHtml(entry.label)}</strong><span>${showLink(entry.gig, entry.detail)}</span><small>${escapeHtml(formatDate(entry.gig.date))}</small></div></li>`).join('') || '<li class="discovery-empty">Milestones appear as the archive grows.</li>';
      const tracks = (items, deep = false) => items.map((track, index) => `<li><b>${deep ? '◆' : String(index + 1).padStart(2, '0')}</b><div><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div><small>${deep ? showLink(track.shows[0], formatDate(track.shows[0].date)) : `${track.count} time${track.count === 1 ? '' : 's'}`}</small></li>`).join('') || '<li class="discovery-empty">Setlists will reveal this once tracks are added.</li>';
      const media = discoveryModel.recentMedia.map((item) => `<a class="discovery-media-item" href="/show?id=${encodeURIComponent(item.gig.id)}">${String(item.mimeType || '').startsWith('image/') ? `<img src="${escapeHtml(item.url)}" alt="" loading="lazy" />` : `<span aria-hidden="true">${item.category === 'artifact' ? '◆' : '▶'}</span>`}<strong>${escapeHtml(item.caption || item.filename || (item.category === 'artifact' ? 'Artifact' : 'Show media'))}</strong><small>${escapeHtml(item.gig.artist)} · ${escapeHtml(formatDate(item.gig.date))}</small></a>`).join('') || '<p class="discovery-empty">Recently uploaded photos, videos and artifacts will collect here.</p>';
      const initial = discoveryModel.roulette.length ? discoveryModel.roulette[Math.floor(random() * discoveryModel.roulette.length)] : null;
      discovery.innerHTML = `<div class="overview-discovery-heading"><div><p class="eyebrow">The archive remembers</p><h2>Rediscover your shows</h2></div><p>Old nights, recurring songs and the moments that shaped the list.</p></div><div class="overview-discovery-lead"><section class="on-this-day"><p class="eyebrow">On this day</p><h3>${String(currentDate.getDate()).padStart(2, '0')} / ${String(currentDate.getMonth() + 1).padStart(2, '0')}</h3><div>${anniversaries}</div></section><section class="memory-roulette"><p class="eyebrow">Memory roulette</p><h3>Open a random night</h3><div class="roulette-result">${rouletteMarkup(initial)}</div><button class="button button-secondary roulette-spin" type="button">↻ Spin the archive</button></section></div><div class="overview-discovery-grid"><section><div class="discovery-section-heading"><p class="eyebrow">Checkpoint unlocked</p><h3>Milestones</h3></div><ol class="milestone-list">${milestones}</ol></section><section><div class="discovery-section-heading"><p class="eyebrow">Songs heard again</p><h3>Most played live</h3></div><ol class="discovery-track-list">${tracks(discoveryModel.mostPlayed)}</ol></section><section><div class="discovery-section-heading"><p class="eyebrow">One-night encounters</p><h3>Deep cuts</h3></div><ol class="discovery-track-list deep-cut-list">${tracks(discoveryModel.deepCuts, true)}</ol></section></div><section class="recent-memory-media"><div class="discovery-section-heading"><p class="eyebrow">Freshly unearthed</p><h3>Recently added media</h3></div><div class="discovery-media-grid">${media}</div></section>`;
      discovery.querySelector?.('.roulette-spin')?.addEventListener('click', () => {
        const choices = discoveryModel.roulette; const selected = choices.length ? choices[Math.floor(random() * choices.length)] : null;
        const result = discovery.querySelector('.roulette-result'); if (result) result.innerHTML = rouletteMarkup(selected);
      });
    }
    async function renderGenres() {
      if (page !== 'overview' || !genreSection) return; genrePromise ||= fetchJson('/api/stats/genres');
      try {
        const summary = buildGenreSummary((await genrePromise).genres || []); const { genres } = summary;
        if (!genres.length) { genreNote.textContent = 'No genre metadata is available yet.'; genreChart.innerHTML = '<p class="empty-state">Add shows or enter genres in an artist profile to build this breakdown.</p>'; return; }
        genreNote.textContent = `${summary.knownShows.toFixed(summary.knownShows % 1 ? 1 : 0)} show${summary.knownShows === 1 ? '' : 's'} have genre metadata. Percentages divide multi-genre artists evenly.`;
        const segments = genres.map((entry, index) => `<span class="genre-segment genre-colour-${index % 10}" style="width:${entry.percentage}%" title="${escapeHtml(entry.genre)} · ${entry.percentage}%"></span>`).join('');
        const legend = genres.map((entry, index) => `<li><i class="genre-colour-${index % 10}"></i><span>${escapeHtml(entry.genre)}</span><strong>${entry.percentage.toFixed(1)}%</strong><small>${entry.shows} show${entry.shows === 1 ? '' : 's'}</small></li>`).join('');
        genreChart.innerHTML = `<div class="genre-stat-bar" aria-label="Genre percentages">${segments}</div><ul class="genre-stat-legend">${legend}</ul>`;
      } catch (error) { genreNote.textContent = 'Genre metadata could not be loaded.'; genreChart.innerHTML = `<p class="form-message error">${escapeHtml(error.message)}</p>`; }
    }
    async function render() {
      if (page !== 'overview' || !dashboard) return;
      const gigs = getGigs(); const allShows = [...gigs, ...getRemoteShows()]; const completion = buildCompletion(allShows, await loadMetadata(), missingFields);
      renderDiscovery(gigs);
      renderStats(buildLocalStats(gigs), completion, gigs);
      try { renderStats(await fetchJson('/api/stats'), completion, gigs); } catch { /* keep local fallback */ }
      await renderGenres();
    }
    return { render, renderGenres, renderDiscovery, getDiscovery: () => discoveryModel };
  }
  return { countBy, dateParts, buildLocalStats, buildCompletion, buildGenreSummary, buildDiscovery, createController };
}));
