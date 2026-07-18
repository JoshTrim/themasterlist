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
  function createController({ page, getGigs, getRemoteShows, loadMetadata, missingFields, fetchJson, escapeHtml, elements }) {
    const { dashboard, genres: genreSection, genreNote, genreChart } = elements; let genrePromise;
    const completionMarkup = (completion) => `<section class="metadata-completion" aria-labelledby="metadata-completion-heading"><div><p class="eyebrow">Archive completion</p><h2 id="metadata-completion-heading">Metadata status</h2></div><a href="/artists?metadata=incomplete"><span><strong>${completion.artists.percentage}%</strong>Artists complete</span><small>${completion.artists.total - completion.artists.complete} need review →</small></a><a href="/venues?metadata=incomplete"><span><strong>${completion.venues.percentage}%</strong>Venues complete</span><small>${completion.venues.total - completion.venues.complete} need review →</small></a></section>`;
    function renderStats(stats, completion, gigs) {
      const artistLinks = stats.topArtists.map(([name, count]) => `<a class="dashboard-stat-link" href="/artist?name=${encodeURIComponent(name)}"><span>${escapeHtml(name)}</span><small>${count} show${count === 1 ? '' : 's'}</small></a>`).join('') || '<span>None yet</span>';
      const venueLinks = stats.topVenues.map(([name, cityOrCount, possibleCount]) => { const legacy = possibleCount === undefined; const city = legacy ? gigs.find((gig) => gig.venue === name)?.city || '' : cityOrCount; const count = legacy ? cityOrCount : possibleCount; return `<a class="dashboard-stat-link" href="/venue?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}"><span>${escapeHtml(name)}</span><small>${escapeHtml(city)}${city ? ' · ' : ''}${count} show${count === 1 ? '' : 's'}</small></a>`; }).join('') || '<span>None yet</span>';
      dashboard.innerHTML = `<p class="eyebrow">Archive snapshot</p><div class="dashboard-stat-grid"><span><strong>${stats.shows}</strong> shows</span><span><strong>${stats.artists}</strong> artists</span><span><strong>${stats.venues}</strong> venues</span><span><strong>${stats.cities}</strong> cities</span><span><strong>${stats.songs}</strong> songs</span><span><strong>${stats.favourites}</strong> favourites</span></div><div class="dashboard-stat-columns"><div><b>Most seen artists</b>${artistLinks}</div><div><b>Most visited venues</b>${venueLinks}</div></div>${completionMarkup(completion)}`;
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
      renderStats(buildLocalStats(gigs), completion, gigs);
      try { renderStats(await fetchJson('/api/stats'), completion, gigs); } catch { /* keep local fallback */ }
      await renderGenres();
    }
    return { render, renderGenres };
  }
  return { countBy, buildLocalStats, buildCompletion, buildGenreSummary, createController };
}));
