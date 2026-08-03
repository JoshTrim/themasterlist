(function initAddShowPage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListAddShowPage = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function addShowPageFactory() {
  function setlistDateToInput(value) {
    const [day, month, year] = String(value || '').split('-');
    return day && month && year ? `${year}-${month}-${day}` : '';
  }

  function matchesMarkup(setlists, escapeHtml) {
    return `<p class="eyebrow">Possible setlists</p>${setlists.map((setlist, index) => `
      <button class="match" data-match="${index}" type="button">
        <strong>${escapeHtml(setlist.venue || 'Unknown venue')}</strong>
        <span>${escapeHtml(setlist.city)} · ${escapeHtml(setlist.date || 'Date unknown')} · ${setlist.songs.length} songs</span>
      </button>`).join('')}`;
  }

  function createController({
    URLSearchParamsClass = URLSearchParams, FormDataClass = FormData, fetchJson, escapeHtml,
    editor, workflow, getAttendees, getMediaFiles, isMobile, confirmDuplicateSave,
    showDuplicateWarning, queueMobileUploads, uploadFiles, addExternalMedia,
    onSaved, afterSaved, resetReviewForm, actsController, elements
  }) {
    const { form, results, message, duplicateWarning, findButton } = elements;
    let selectedSetlist = null;

    function setMessage(text, isError = false) {
      message.textContent = text;
      message.classList.toggle('error', isError);
    }

    function values() { return Object.fromEntries(new FormDataClass(form).entries()); }

    function renderMatches(setlists) {
      results.innerHTML = matchesMarkup(setlists, escapeHtml);
      results.hidden = false;
      results.querySelectorAll('[data-match]').forEach((button) => button.addEventListener('click', () => {
        selectedSetlist = setlists[Number(button.dataset.match)];
        form.elements.venue.value = selectedSetlist.venue || form.elements.venue.value;
        form.elements.city.value = selectedSetlist.city || form.elements.city.value;
        const date = setlistDateToInput(selectedSetlist.date);
        if (date) form.elements.date.value = date;
        showDuplicateWarning(duplicateWarning, values());
        results.querySelectorAll('.match').forEach((item) => item.classList.remove('selected'));
        button.classList.add('selected');
        setMessage(`Setlist selected: ${selectedSetlist.songs.length} songs will be saved with this show.`);
        actsController?.search();
      }));
    }

    async function searchSetlists() {
      const gig = values();
      if (!gig.artist || !gig.city) {
        setMessage('Add an artist and city before searching.', true);
        return [];
      }
      setMessage('Searching setlist.fm…');
      results.hidden = true;
      try {
        const params = new URLSearchParamsClass({ artistName: gig.artist, cityName: gig.city, eventDate: gig.date });
        const payload = await fetchJson(`/api/setlists/search?${params}`);
        if (!payload.setlists.length) {
          setMessage('No matches found. You can still save the show without a setlist.');
          return [];
        }
        renderMatches(payload.setlists);
        setMessage(`Found ${payload.setlists.length} possible match${payload.setlists.length === 1 ? '' : 'es'}. Choose a date to attach it.`);
        return payload.setlists;
      } catch (error) {
        setMessage(error.message, true);
        return [];
      }
    }

    async function submit() {
      const gig = values();
      if (!confirmDuplicateSave(duplicateWarning, gig)) return null;
      const mediaFiles = getMediaFiles();
      const payload = editor.createAddPayload(gig, { attendees: getAttendees(), setlist: selectedSetlist, acts: actsController?.getActs() || [] });
      const submitButton = form.querySelector('button[type="submit"]');
      try {
        submitButton.disabled = true;
        const result = await workflow.createShow({
          payload, mediaFiles, mobile: isMobile(),
          saveShow: (body) => fetchJson('/api/gigs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
          queueMobileUploads, uploadFiles, addExternalMedia
        });
        onSaved(result.saved);
        form.reset();
        resetReviewForm();
        selectedSetlist = null;
        actsController?.setActs([]);
        results.hidden = true;
        duplicateWarning.hidden = true;
        setMessage(result.uploadsQueued ? 'Show saved. Uploads are continuing in the queue.' : 'Show saved to The Master List.');
        await afterSaved(result.saved);
        return result;
      } catch (error) {
        setMessage(error.message, true);
        return null;
      } finally { submitButton.disabled = false; }
    }

    function bind() {
      findButton.addEventListener('click', searchSetlists);
      ['artist', 'venue', 'city', 'date'].forEach((name) => form.elements[name]?.addEventListener('input', () => showDuplicateWarning(duplicateWarning, values())));
      form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
    }

    return { values, renderMatches, searchSetlists, submit, bind, getSelectedSetlist: () => selectedSetlist };
  }

  return { setlistDateToInput, matchesMarkup, createController };
}));
