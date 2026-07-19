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

  function heroMedia(media = []) {
    const images = media.filter((item) => item.category !== 'artifact' && String(item.mimeType || '').startsWith('image/') && item.url);
    return images.find((item) => item.isCover) || images[0] || null;
  }

  function xml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
  }

  function memoryCardSvg(gig, { formatDate = (value) => value, attendeeNames = () => [] } = {}) {
    const date = formatDate(gig.date, { day: 'numeric', month: 'long', year: 'numeric' });
    const names = attendeeNames(gig);
    const trackCount = gig.songs?.length || 0;
    const rating = gig.performanceRating ? `${gig.performanceRating} / 5` : 'UNRATED';
    const favourite = gig.favorite ? 'FAVOURITE SHOW' : 'LIVE MEMORY';
    const trim = (value, length) => String(value || '').trim().slice(0, length);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#2d0d41"/><stop offset="1" stop-color="#090410"/></linearGradient><pattern id="scan" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 7.5H8" stroke="#ff82c8" stroke-opacity=".08"/></pattern></defs><rect width="1080" height="1350" fill="url(#bg)"/><rect x="44" y="44" width="992" height="1262" fill="none" stroke="#ff2d9b" stroke-width="8"/><rect x="66" y="66" width="948" height="1218" fill="url(#scan)" stroke="#7422a0" stroke-width="3"/><text x="100" y="150" fill="#ff82c8" font-family="monospace" font-size="32" font-weight="700" letter-spacing="5">THE MASTER LIST</text><text x="100" y="238" fill="#d6a9e2" font-family="monospace" font-size="25" letter-spacing="4">${xml(favourite)}</text><path d="M100 282H980" stroke="#7422a0" stroke-width="4"/><text x="100" y="410" fill="#fff0fa" font-family="monospace" font-size="72" font-weight="700">${xml(trim(gig.artist, 22))}</text><text x="100" y="480" fill="#ff82c8" font-family="monospace" font-size="34">${xml(trim(gig.venue, 38))}</text><text x="100" y="530" fill="#d6a9e2" font-family="monospace" font-size="30">${xml(trim(gig.city, 38))} · ${xml(date)}</text><rect x="100" y="610" width="260" height="185" fill="#14081f" stroke="#ff2d9b" stroke-width="4"/><text x="130" y="665" fill="#d6a9e2" font-family="monospace" font-size="24">RATING</text><text x="130" y="746" fill="#fff0fa" font-family="monospace" font-size="52" font-weight="700">${xml(rating)}</text><rect x="410" y="610" width="260" height="185" fill="#14081f" stroke="#7422a0" stroke-width="4"/><text x="440" y="665" fill="#d6a9e2" font-family="monospace" font-size="24">SETLIST</text><text x="440" y="746" fill="#fff0fa" font-family="monospace" font-size="52" font-weight="700">${trackCount} TRACKS</text><rect x="720" y="610" width="260" height="185" fill="#14081f" stroke="#7422a0" stroke-width="4"/><text x="750" y="665" fill="#d6a9e2" font-family="monospace" font-size="24">ATTENDEES</text><text x="750" y="746" fill="#fff0fa" font-family="monospace" font-size="52" font-weight="700">${Math.max(names.length, 1)}</text><path d="M100 875H980" stroke="#7422a0" stroke-width="4"/><text x="100" y="955" fill="#ff82c8" font-family="monospace" font-size="26">ARCHIVE NOTE</text><foreignObject x="100" y="995" width="850" height="190"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#efd7f6;font:32px/1.35 monospace">${xml(trim(gig.performanceNotes || gig.notes || 'A night worth remembering.', 150))}</div></foreignObject><text x="100" y="1240" fill="#8f6aa0" font-family="monospace" font-size="22" letter-spacing="3">PERSONAL LIVE MUSIC ARCHIVE</text><path d="M900 1200l20 20 40-55" fill="none" stroke="#ff2d9b" stroke-width="10"/></svg>`;
  }

  function createController({
    page, window, document, navigatorApi = window?.navigator, URLSearchParamsClass = URLSearchParams, setTimeoutFn = globalThis.setTimeout,
    showId, getGigs, fetchJson, escapeHtml, formatDate, attendeeNames,
    hasMissingAlbums, renderTrackList, renderAlbumStats, renderMediaGallery, startPlayback, elements
  }) {
    const {
      heading, place, date, notes, venueNotes, attendees, ratings, setlist, editLink,
      noMedia, noArtifacts, navTrackCount, navMediaCount, navArtifactCount, facts,
      gallery, artifactGallery, findAlbums, albumMessage, heroImage, heroFallback, favouriteBadge,
      heroPlayLink, memoryTicket, shareButton, downloadButton
    } = elements;
    let gig = null;

    function setHeroImage(source, alt) {
      if (!heroImage) return;
      if (!source) { heroImage.hidden = true; heroImage.removeAttribute?.('src'); heroFallback.hidden = false; return; }
      heroImage.alt = alt;
      heroImage.hidden = false;
      heroImage.src = source;
      heroFallback.hidden = true;
    }

    function renderHero(media) {
      const cover = heroMedia(media.general);
      if (cover) setHeroImage(cover.url, cover.caption || `${gig.artist} live`);
      else {
        setHeroImage('', '');
        fetchJson(`/api/artists?name=${encodeURIComponent(gig.artist)}`).then((info) => {
          if (gig && info.image) setHeroImage(info.image, `${gig.artist} portrait`);
        }).catch(() => {});
      }
      favouriteBadge.hidden = !gig.favorite;
      heroPlayLink.href = `/playback?id=${encodeURIComponent(gig.id)}`;
      memoryTicket.innerHTML = `<span>${gig.favorite ? '♥ Favourite show' : 'Archive memory'}</span><strong>${escapeHtml(gig.artist)}</strong><small>${escapeHtml(formatDate(gig.date, { day: 'numeric', month: 'short', year: 'numeric' }))} · ${gig.songs?.length || 0} tracks · ${gig.performanceRating ? `${gig.performanceRating}/5` : 'unrated'}</small>`;
    }

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
      renderHero(media);
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

    async function shareMemory() {
      if (!gig) return false;
      const share = { title: `${gig.artist} · The Master List`, text: `${gig.artist} at ${gig.venue}, ${gig.city} — ${formatDate(gig.date)}`, url: window.location.href };
      if (navigatorApi?.share) { await navigatorApi.share(share); return true; }
      if (navigatorApi?.clipboard?.writeText) { await navigatorApi.clipboard.writeText(share.url); shareButton.textContent = 'Link copied'; setTimeoutFn(() => { shareButton.textContent = 'Share memory'; }, 1800); return true; }
      return false;
    }

    function downloadMemoryCard() {
      if (!gig || !document || !window?.URL || !window?.Blob) return false;
      const svg = memoryCardSvg(gig, { formatDate, attendeeNames });
      const objectUrl = window.URL.createObjectURL(new window.Blob([svg], { type: 'image/svg+xml' }));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${String(gig.artist || 'show').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'show'}-${gig.date || 'memory'}.svg`;
      link.click();
      setTimeoutFn(() => window.URL.revokeObjectURL(objectUrl), 0);
      return true;
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

    function bind() {
      findAlbums?.addEventListener('click', refreshAlbums);
      shareButton?.addEventListener('click', () => shareMemory().catch(() => {}));
      downloadButton?.addEventListener('click', downloadMemoryCard);
      heroImage?.addEventListener('error', () => setHeroImage('', ''));
    }

    return { render, renderSetlist, refreshAlbums, shareMemory, downloadMemoryCard, bind, getGig: () => gig };
  }

  return { partitionMedia, heroMedia, memoryCardSvg, createController };
}));
