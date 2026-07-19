(function initSharedShowsPage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListSharedShowsPage = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function sharedShowsPageFactory() {
  function attendeeNames(show) {
    return (Array.isArray(show?.attendees) ? show.attendees : []).map((person) => person?.name).filter(Boolean);
  }

  function partitionShows(gigs, sharedShows) {
    const local = gigs.filter((gig) => attendeeNames(gig).length > 1);
    const localIds = new Set(local.flatMap((gig) => [gig.id, gig.sharedId].filter(Boolean)));
    const remote = sharedShows.filter((show) => show.contributions?.length && !localIds.has(show.id) && !localIds.has(show.sourceGigId));
    const legacy = sharedShows.filter((show) => !show.contributions?.length && !localIds.has(show.id) && !localIds.has(show.sourceGigId));
    return { local, remote, legacy, total: local.length + remote.length + legacy.length };
  }

  function contributionDetail({ contribution, gig, isLocal }) {
    if (!contribution) {
      if (!isLocal) return 'Peer contribution will appear after sync';
      return `${gig.performanceRating ? `Performance ${gig.performanceRating}/5` : 'Performance unrated'} · ${gig.venueRating ? `Venue ${gig.venueRating}/5` : 'Venue unrated'}${gig.favorite ? ' · Favourite' : ''}`;
    }
    return `${contribution.performanceRating ? `Performance ${contribution.performanceRating}/5` : 'Performance unrated'} · ${contribution.venueRating ? `Venue ${contribution.venueRating}/5` : 'Venue unrated'}${contribution.favorite ? ' · Favourite' : ''} · ${contribution.media?.length || 0} media`;
  }

  function averageLabel(contributions, field, label) {
    const ratings = contributions.map((entry) => Number(entry[field])).filter(Boolean);
    if (!ratings.length) return `${label} unrated`;
    return `${label} average ${(ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)} / 5`;
  }

  function localSummary(contributions, gig) {
    const mediaTotal = contributions.length
      ? contributions.reduce((sum, entry) => sum + (entry.media?.length || 0), 0)
      : gig.media?.length || 0;
    return `${averageLabel(contributions, 'performanceRating', 'Performance')} · ${averageLabel(contributions, 'venueRating', 'Venue')} · ${mediaTotal} media item${mediaTotal === 1 ? '' : 's'} across attendees`;
  }

  function renderStars(stars) {
    const rating = Number(stars.dataset.value) || 0;
    stars.innerHTML = [1, 2, 3, 4, 5].map((value) => `<button type="button" value="${value}" class="${value <= rating ? 'selected' : ''}" aria-label="${value} stars">★</button>`).join('');
    stars.closest('.shared-rating-row').querySelector('.shared-rating-number').textContent = rating ? `${rating} / 5` : 'Unrated';
    stars.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      stars.dataset.value = button.value;
      renderStars(stars);
    }));
  }

  return { attendeeNames, partitionShows, contributionDetail, averageLabel, localSummary, renderStars };
}));
