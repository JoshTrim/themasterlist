(function initSupportingActs(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListSupportingActs = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function supportingActsFactory() {
  const ROLES = ['Opener', 'Co-headliner'];

  function normalise(acts) {
    const seen = new Set();
    return (Array.isArray(acts) ? acts : []).map((act) => {
      const artist = String(act?.artist || '').trim();
      const key = artist.toLocaleLowerCase();
      if (!artist || seen.has(key)) return null;
      seen.add(key);
      return { ...act, artist, role: ROLES.includes(act.role) ? act.role : 'Opener', songs: Array.isArray(act.songs) ? act.songs : [] };
    }).filter(Boolean);
  }

  function actMarkup(act, index, escapeHtml) {
    const source = act.setlistFmUrl ? `<a href="${escapeHtml(act.setlistFmUrl)}" target="_blank" rel="noreferrer">${act.songs.length} tracks on setlist.fm ↗</a>` : `<span>${act.songs.length ? `${act.songs.length} imported tracks` : 'No setlist attached'}</span>`;
    return `<article class="supporting-act" data-act-index="${index}"><label>Artist<input data-act-field="artist" value="${escapeHtml(act.artist)}" placeholder="Artist name" /></label><label>Role<select data-act-field="role">${ROLES.map((role) => `<option${act.role === role ? ' selected' : ''}>${role}</option>`).join('')}</select></label><div class="supporting-act-source">${source}</div><button class="icon-button supporting-act-remove" type="button" aria-label="Remove ${escapeHtml(act.artist || 'performer')}">×</button></article>`;
  }

  function candidateMarkup(candidate, index, escapeHtml) {
    return `<article class="supporting-act-candidate"><div><strong>${escapeHtml(candidate.artist)}</strong><span>${candidate.songs.length} track${candidate.songs.length === 1 ? '' : 's'} found</span></div><button class="button button-secondary" data-candidate-index="${index}" data-role="Opener" type="button">Add opener</button><button class="button button-secondary" data-candidate-index="${index}" data-role="Co-headliner" type="button">Add co-headliner</button></article>`;
  }

  function createController({ root, fetchJson, escapeHtml = String, getContext, message }) {
    let acts = [];
    let candidates = [];
    const list = root.querySelector('[data-acts-list]');
    const results = root.querySelector('[data-acts-results]');
    const searchButton = root.querySelector('[data-find-acts]');
    const addButton = root.querySelector('[data-add-act]');

    function render() {
      list.innerHTML = acts.length ? acts.map((act, index) => actMarkup(act, index, escapeHtml)).join('') : '<p class="supporting-acts-empty">No opening acts or co-headliners added.</p>';
    }

    function setActs(value) { acts = normalise(value); render(); return acts; }
    function getActs() {
      list.querySelectorAll('[data-act-index]').forEach((row) => {
        const act = acts[Number(row.dataset.actIndex)];
        if (!act) return;
        act.artist = row.querySelector('[data-act-field="artist"]').value.trim();
        act.role = row.querySelector('[data-act-field="role"]').value;
      });
      acts = normalise(acts);
      return acts;
    }

    function addAct(act = { artist: '', role: 'Opener', songs: [] }) {
      getActs();
      const artist = String(act.artist || '').trim();
      if (artist && acts.some((entry) => entry.artist.toLocaleLowerCase() === artist.toLocaleLowerCase())) return;
      acts.push({ ...act, artist, role: ROLES.includes(act.role) ? act.role : 'Opener', songs: Array.isArray(act.songs) ? act.songs : [] });
      render();
      list.querySelector('[data-act-index]:last-child input')?.focus();
    }

    async function search() {
      const context = getContext();
      if (!context.date || (!context.venueId && !context.venueName)) {
        message('Choose a dated setlist first, or enter a venue and date.', true);
        return [];
      }
      searchButton.disabled = true;
      message('Looking for other performers at this event…');
      try {
        const params = new URLSearchParams({ eventDate: context.date, venueName: context.venueName || '', cityName: context.cityName || '' });
        if (context.venueId) params.set('venueId', context.venueId);
        const payload = await fetchJson(`/api/setlists/event?${params}`);
        const excluded = new Set([context.headliner, ...getActs().map((act) => act.artist)].filter(Boolean).map((name) => name.toLocaleLowerCase()));
        candidates = (payload.setlists || []).filter((setlist) => setlist.artist && !excluded.has(setlist.artist.toLocaleLowerCase()));
        results.innerHTML = candidates.length ? candidates.map((candidate, index) => candidateMarkup(candidate, index, escapeHtml)).join('') : '<p class="supporting-acts-empty">No other setlists were found for this venue and date.</p>';
        results.hidden = false;
        message(candidates.length ? `Found ${candidates.length} possible additional performer${candidates.length === 1 ? '' : 's'}.` : 'No other performers were found. You can add one manually.');
        return candidates;
      } catch (error) { message(error.message, true); return []; }
      finally { searchButton.disabled = false; }
    }

    root.addEventListener('click', (event) => {
      const remove = event.target.closest('.supporting-act-remove');
      if (remove) { getActs(); acts.splice(Number(remove.closest('[data-act-index]').dataset.actIndex), 1); render(); return; }
      const candidateButton = event.target.closest('[data-candidate-index]');
      if (candidateButton) {
        const candidate = candidates[Number(candidateButton.dataset.candidateIndex)];
        if (candidate) addAct({ artist: candidate.artist, role: candidateButton.dataset.role, setlistFmId: candidate.id, setlistFmUrl: candidate.url, songs: candidate.songs });
      }
    });
    addButton.addEventListener('click', () => addAct());
    searchButton.addEventListener('click', search);
    render();
    return { setActs, getActs, addAct, search };
  }

  return { ROLES, normalise, actMarkup, candidateMarkup, createController };
}));
