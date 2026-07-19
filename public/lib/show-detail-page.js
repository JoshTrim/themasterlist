(function initShowDetailPage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListShowDetailPage = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function showDetailPageFactory() {
  function partitionMedia(media = []) {
    return {
      general: media.filter((item) => item.category !== 'artifact'),
      artifacts: media.filter((item) => item.category === 'artifact')
    };
  }

  function createController({
    page, window, URLSearchParamsClass = URLSearchParams, setTimeoutFn = globalThis.setTimeout,
    showId, getGigs, fetchJson, escapeHtml, formatDate, attendeeNames,
    hasMissingAlbums, renderTrackList, renderAlbumStats, renderMediaGallery, startPlayback, elements
  }) {
    const {
      heading, place, date, notes, venueNotes, attendees, ratings, setlist, editLink,
      noMedia, noArtifacts, navTrackCount, navMediaCount, navArtifactCount, facts,
      gallery, artifactGallery, findAlbums, albumMessage
    } = elements;
    let gig = null;

    function renderSetlist() {
      setlist.innerHTML = gig.songs?.length ? `<ol>${renderTrackList(gig.songs)}</ol>${renderAlbumStats(gig.songs)}` : '<p>No setlist attached.</p>';
      findAlbums.hidden = !hasMissingAlbums(gig.songs || []);
    }

    function render() {
      if (!['show', 'playback'].includes(page)) return null;
      gig = getGigs().find((entry) => entry.id === showId) || null;
      if (!gig) { heading.textContent = 'Show not found'; return null; }
      heading.textContent = gig.artist;
      place.innerHTML = `<a class="venue-link" href="/venue?name=${encodeURIComponent(gig.venue)}&city=${encodeURIComponent(gig.city)}">${escapeHtml(gig.venue)}</a> · <a class="venue-link" href="/city?name=${encodeURIComponent(gig.city)}">${escapeHtml(gig.city)}</a>`;
      date.textContent = formatDate(gig.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      notes.textContent = gig.performanceNotes || gig.notes || 'No performance notes yet.';
      venueNotes.textContent = gig.venueNotes ? `Venue: ${gig.venueNotes}` : 'No venue notes yet.';
      const names = attendeeNames(gig);
      attendees.textContent = names.length > 1 ? `Attended with ${names.slice(1).join(', ')}` : 'Solo show';
      ratings.innerHTML = gig.performanceRating ? `<span><b>${gig.performanceRating}</b> / 5 stars</span>` : '<span>Not rated yet</span>';
      renderSetlist();
      albumMessage.textContent = '';
      if (gig.songs?.length) fetchJson(`/api/gigs/${encodeURIComponent(gig.id)}/album-stats`).then((data) => { gig.songs = data.songs; renderSetlist(); }).catch(() => {});
      editLink.href = `/edit?id=${encodeURIComponent(gig.id)}`;
      const media = partitionMedia(gig.media);
      noMedia.hidden = Boolean(media.general.length);
      noArtifacts.hidden = Boolean(media.artifacts.length);
      navTrackCount.textContent = gig.songs?.length ? String(gig.songs.length) : '';
      navMediaCount.textContent = media.general.length ? String(media.general.length) : '';
      navArtifactCount.textContent = media.artifacts.length ? String(media.artifacts.length) : '';
      const attendeeTotal = Math.max(names.length, 1);
      facts.innerHTML = `<span><b>${gig.performanceRating || '—'}</b> rating</span><span><b>${gig.songs?.length || 0}</b> tracks</span><span><b>${media.general.length}</b> media</span><span><b>${media.artifacts.length}</b> artifacts</span><span><b>${attendeeTotal}</b> attendee${attendeeTotal === 1 ? '' : 's'}</span>`;
      renderMediaGallery(gallery, media.general, { editable: true, songs: gig.songs || [] });
      renderMediaGallery(artifactGallery, media.artifacts, { editable: true, allowCover: false, songs: gig.songs || [] });
      if (page === 'playback' || new URLSearchParamsClass(window.location.search).get('play') === '1') setTimeoutFn(startPlayback, 0);
      return gig;
    }

    async function refreshAlbums() {
      if (!gig?.songs?.length) return null;
      findAlbums.disabled = true;
      findAlbums.textContent = 'Searching albums…';
      albumMessage.classList.remove('error');
      albumMessage.textContent = 'Searching by track title and artist…';
      try {
        const data = await fetchJson(`/api/gigs/${encodeURIComponent(gig.id)}/album-stats?refresh=1`);
        gig.songs = data.songs;
        renderSetlist();
        const remaining = gig.songs.filter((song) => hasMissingAlbums([song])).length;
        findAlbums.hidden = remaining === 0;
        albumMessage.textContent = remaining ? `${remaining} track${remaining === 1 ? '' : 's'} could not be matched. You can enter those manually on the edit page.` : 'Album information updated.';
        return data;
      } catch (error) {
        albumMessage.textContent = error.message;
        albumMessage.classList.add('error');
        return null;
      } finally {
        findAlbums.disabled = false;
        findAlbums.textContent = 'Find album info';
      }
    }

    function bind() { findAlbums?.addEventListener('click', refreshAlbums); }

    return { render, renderSetlist, refreshAlbums, bind, getGig: () => gig };
  }

  return { partitionMedia, createController };
}));
