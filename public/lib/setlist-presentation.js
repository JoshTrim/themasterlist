(function initSetlistPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListSetlistPresentation = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function setlistPresentationFactory() {
  function hasMissingAlbums(songs = []) {
    return songs.some((song) => !String(song.album || '').trim() || /^unknown album$/i.test(String(song.album).trim()));
  }

  function albumStatsMarkup(songs, escapeHtml) {
    const counts = new Map();
    songs.forEach((song) => {
      const album = String(song.album || 'Unknown album').trim() || 'Unknown album';
      counts.set(album, (counts.get(album) || 0) + 1);
    });
    const total = songs.length;
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return `<div class="album-stats"><p class="eyebrow">Album breakdown</p><div class="album-stat-bar album-stat-bar-stacked">${entries.map(([album, count], index) => `<span class="album-segment album-segment-${index % 8}" style="width:${count / total * 100}%" title="${escapeHtml(album)} · ${Math.round(count / total * 100)}%"></span>`).join('')}</div><div class="album-stat-key">${entries.map(([album, count], index) => `<span><i class="album-key-swatch album-segment-${index % 8}"></i>${escapeHtml(album)} <strong>${Math.round(count / total * 100)}%</strong></span>`).join('')}</div></div>`;
  }

  function trackListMarkup(songs, escapeHtml, albumFallback = 'Album data unavailable') {
    return songs.map((song) => {
      const album = String(song.album || albumFallback).trim() || albumFallback;
      return `<li tabindex="0"><span class="track-title">${escapeHtml(song.title)}</span><span class="album-tooltip">${escapeHtml(album)}</span>${song.encore ? ' <b>Encore</b>' : ''}</li>`;
    }).join('');
  }

  function createController({ document, fetchJson, escapeHtml }) {
    function setupArchive(setlist, gig, { fetchAlbums = true } = {}) {
      const source = gig.setlistFmUrl ? `<a href="${escapeHtml(gig.setlistFmUrl)}" target="_blank" rel="noreferrer">View source on setlist.fm ↗</a>` : '';
      const tracks = () => `<ol>${trackListMarkup(gig.songs || [], escapeHtml, fetchAlbums ? 'Loading album…' : 'Album data unavailable')}</ol>${source}`;
      setlist.innerHTML = `<details class="setlist-accordion"><summary>Setlist <span>${gig.songs.length} tracks</span></summary><div class="setlist-accordion-content">${tracks()}</div></details>`;
      if (!fetchAlbums || !hasMissingAlbums(gig.songs)) return;
      const details = setlist.querySelector('.setlist-accordion');
      details.addEventListener('toggle', async () => {
        if (!details.open || details.dataset.albumLoad) return;
        details.dataset.albumLoad = 'loading';
        try {
          const data = await fetchJson(`/api/gigs/${encodeURIComponent(gig.id)}/album-stats`);
          gig.songs = data.songs;
          details.querySelector('.setlist-accordion-content').innerHTML = tracks();
          details.dataset.albumLoad = 'complete';
        } catch {
          details.dataset.albumLoad = 'error';
          details.querySelectorAll('.album-tooltip').forEach((tooltip) => { if (tooltip.textContent === 'Loading album…') tooltip.textContent = 'Album data unavailable'; });
        }
      });
    }

    function bindTooltips() {
      document.addEventListener('click', (event) => {
        const track = event.target.closest('.setlist li[tabindex]');
        document.querySelectorAll('.setlist li.tooltip-open').forEach((item) => { if (item !== track) item.classList.remove('tooltip-open'); });
        if (track) track.classList.toggle('tooltip-open');
      });
      document.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        const track = event.target.closest('.setlist li[tabindex]');
        if (!track) return;
        event.preventDefault();
        track.click();
      });
    }

    return {
      albumStats: (songs) => albumStatsMarkup(songs, escapeHtml),
      trackList: (songs, fallback) => trackListMarkup(songs, escapeHtml, fallback),
      setupArchive, bindTooltips
    };
  }

  return { hasMissingAlbums, albumStatsMarkup, trackListMarkup, createController };
}));
