(function initProfileShowList(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListProfileShowList = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function profileShowListFactory() {
  function setlistMarkup(songs = [], escapeHtml = String) {
    if (!songs.length) return '';
    return `<ol>${songs.map((song) => `<li>${escapeHtml(song.title)}${song.encore ? ' <b>Encore</b>' : ''}</li>`).join('')}</ol>`;
  }

  function appendAttendeeSummary({ document, container, gig, attendeeNames, prefix = 'With' }) {
    const names = attendeeNames(gig);
    if (names.length < 2) return null;
    const summary = document.createElement('p');
    summary.className = 'gig-attendees-summary';
    summary.textContent = `${prefix} ${names.join(', ')}`;
    container.append(summary);
    return summary;
  }

  function createRenderer({ template, escapeHtml, formatGigDate, renderAttendeeSummary, setupMedia }) {
    function baseCard(gig) {
      const card = template.content.cloneNode(true);
      const edit = card.querySelector('.edit-gig');
      const detail = card.querySelector('.show-detail-link');
      const play = card.querySelector('.play-gig');
      edit.href = `/edit?id=${encodeURIComponent(gig.id)}`;
      detail.href = `/show?id=${encodeURIComponent(gig.id)}`;
      play.href = `/playback?id=${encodeURIComponent(gig.id)}`;
      play.textContent = '▶';
      play.setAttribute('aria-label', 'Play set');
      card.querySelector('.gig-date').textContent = formatGigDate(gig.date, { day: '2-digit', month: 'short', year: 'numeric' });
      card.querySelector('.gig-place').textContent = `${gig.venue} · ${gig.city}`;
      card.querySelector('.gig-notes').textContent = gig.performanceNotes || gig.notes || '';
      renderAttendeeSummary(card.querySelector('.gig-summary'), gig);
      setupMedia(card, (gig.media || []).filter((item) => item.category !== 'artifact'), { songs: gig.songs || [] });
      card.querySelectorAll('.artifact-section, .add-artifact-gig').forEach((element) => element.remove());
      return card;
    }

    function renderArtist(container, records = []) {
      container.replaceChildren();
      records.forEach((gig) => {
        const card = baseCard(gig);
        card.querySelector('.gig-summary h3').textContent = gig.artist;
        card.querySelector('.venue-notes').textContent = gig.venueNotes || '';
        card.querySelector('.gig-ratings').innerHTML = `${gig.performanceRating ? `<span>Performance ${gig.performanceRating} / 5</span>` : ''}${gig.venueRating ? `<span>Venue ${gig.venueRating} / 5</span>` : ''}`;
        const setlist = card.querySelector('.setlist');
        const markup = setlistMarkup(gig.songs, escapeHtml);
        if (markup) setlist.innerHTML = markup;
        container.append(card);
      });
    }

    function renderVenue(container, records = []) {
      container.replaceChildren();
      records.forEach((gig) => {
        const card = baseCard(gig);
        card.querySelector('.gig-summary h3').innerHTML = `<a class="artist-link" href="/artist?name=${encodeURIComponent(gig.artist)}">${escapeHtml(gig.artist)}</a>`;
        container.append(card);
      });
    }

    return { renderArtist, renderVenue };
  }

  return { appendAttendeeSummary, createRenderer, setlistMarkup };
}));
