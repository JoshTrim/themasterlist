(function initYoutubeShowSearch(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListYoutubeShowSearch = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function youtubeShowSearchFactory() {
  function resultsMarkup(matches = [], escapeHtml = String) {
    return matches.map((match) => `<article class="youtube-match" data-song-index="${match.index}"><h3>${escapeHtml(match.title)}</h3><div class="youtube-match-options">${(match.results || []).map((result) => `<div class="youtube-result" data-youtube-description="${escapeHtml(result.description || '')}"><img src="${escapeHtml(result.thumbnail)}" alt="" /><div><p>${escapeHtml(result.title)}</p><small>${escapeHtml(result.channel)}</small><button type="button" data-youtube-url="https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}">Add to other media</button></div></div>`).join('') || '<p>No matching videos found.</p>'}</div></article>`).join('');
  }

  function createController({ fetchJson, escapeHtml, getGigs, showId, renderMediaGallery, navigate = () => {}, elements }) {
    const { searchButton, results, message, gallery } = elements;

    async function addResult(gig, button) {
      button.disabled = true;
      button.textContent = 'Adding…';
      const match = button.closest('.youtube-match');
      const songIndex = Number(match?.dataset.songIndex);
      const result = button.closest('.youtube-result');
      try {
        const added = await fetchJson(`/api/gigs/${gig.id}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            externalUrl: button.dataset.youtubeUrl,
            caption: result.querySelector('p').textContent,
            sourceDescription: result.dataset.youtubeDescription || '',
            songIndex: Number.isInteger(songIndex) ? songIndex : null
          })
        });
        gig.media = [...(gig.media || []), added];
        button.textContent = 'Added';
        renderMediaGallery(gallery, gig.media.filter((item) => item.category !== 'artifact'), { editable: true, songs: gig.songs || [] });
        return added;
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Try again';
        message.textContent = error.message;
        message.classList.add('error');
        return null;
      }
    }

    function bindResults(gig) {
      results.querySelectorAll('[data-youtube-url]').forEach((button) => button.addEventListener('click', () => addResult(gig, button)));
    }

    async function search() {
      const gig = getGigs().find((entry) => entry.id === showId);
      if (!gig?.songs?.length) {
        message.textContent = 'Add a setlist before searching YouTube.';
        return [];
      }
      searchButton.disabled = true;
      searchButton.textContent = 'Searching YouTube…';
      message.textContent = '';
      message.classList.remove('error');
      results.replaceChildren();
      try {
        const payload = await fetchJson(`/api/gigs/${gig.id}/youtube-search`, { method: 'POST' });
        const matches = payload.matches || [];
        results.innerHTML = resultsMarkup(matches, escapeHtml);
        bindResults(gig);
        return matches;
      } catch (error) {
        if (error.status === 401 && error.payload?.code === 'reconnect-required') {
          message.textContent = 'Your YouTube connection expired. Reconnecting…';
          navigate('/auth/youtube');
          return [];
        }
        message.textContent = error.message;
        message.classList.add('error');
        return [];
      } finally {
        searchButton.disabled = false;
        searchButton.textContent = 'Find YouTube videos';
      }
    }

    function bind() {
      searchButton?.addEventListener('click', search);
    }

    return { bind, search, addResult };
  }

  return { createController, resultsMarkup };
}));
