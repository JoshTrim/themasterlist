(function initShowFormUi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListShowFormUi = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function showFormUiFactory() {
  function createController({
    document, window, editor, escapeHtml, formatGigDate,
    getGigs, getSharedShows, getPeers, getAccount, elements
  }) {
    const { addForm, favoriteChoice, message, editForm } = elements;
    let editAttendeePicker = elements.editAttendeePicker;

    function populateAutofill() {
      const gigs = getGigs();
      const values = {
        'artist-options': [...new Set(gigs.map((gig) => gig.artist).filter(Boolean))].sort(),
        'venue-options': [...new Set(gigs.map((gig) => gig.venue).filter(Boolean))].sort(),
        'city-options': [...new Set(gigs.map((gig) => gig.city).filter(Boolean))].sort()
      };
      Object.entries(values).forEach(([id, options]) => {
        const list = document.querySelector(`#${id}`);
        if (list) list.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}"></option>`).join('');
      });
      return values;
    }

    function setRatingPicker(picker, value = '') {
      const rating = Number(value) || 0;
      picker.closest('.rating-choice').querySelector('input').value = rating || '';
      picker.querySelectorAll('button').forEach((button) => {
        const selected = Number(button.value) <= rating;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }

    function setFavorite(favorite) {
      favoriteChoice.setAttribute('aria-pressed', String(favorite));
      favoriteChoice.querySelector('span').textContent = favorite ? '♥' : '♡';
      addForm.elements.favorite.value = String(favorite);
    }

    function resetReview() {
      document.querySelectorAll('.star-picker').forEach((picker) => setRatingPicker(picker));
      setFavorite(false);
    }

    function findDuplicates(values, excludeId = '') {
      return editor.findDuplicates(values, { gigs: getGigs(), sharedShows: getSharedShows(), excludeId });
    }

    function showDuplicateWarning(container, values, excludeId = '') {
      if (!container) return [];
      const matches = findDuplicates(values, excludeId);
      container.hidden = !matches.length;
      container.innerHTML = matches.length ? `<strong>Possible duplicate show</strong><p>${matches.length} matching ${matches.length === 1 ? 'entry already exists' : 'entries already exist'} for this artist, venue and date.</p>${matches.map((gig) => `<a href="${gig.duplicateSource === 'Your archive' ? `/show?id=${encodeURIComponent(gig.id)}` : '/shows'}"><span>${escapeHtml(gig.artist)}</span><small>${escapeHtml(gig.venue)} · ${escapeHtml(gig.city || '')} · ${escapeHtml(formatGigDate(gig.date))} · ${escapeHtml(gig.duplicateSource)}</small></a>`).join('')}` : '';
      return matches;
    }

    function confirmDuplicateSave(container, values, excludeId = '') {
      const matches = showDuplicateWarning(container, values, excludeId);
      return !matches.length || window.confirm(`${matches.length} matching show ${matches.length === 1 ? 'already exists' : 'entries already exist'}. Save another copy anyway?`);
    }

    function renderAttendees(container, selected = []) {
      if (!container) return;
      container.querySelector('.attendee-options').innerHTML = editor.attendeeMarkup(editor.attendeeOptions(getAccount(), getPeers(), selected), escapeHtml);
    }

    function readAttendees(container) {
      if (!container) return [];
      return editor.selectedAttendees(container.querySelectorAll('input[type="checkbox"]'));
    }

    function ensureEditAttendeePicker() {
      if (editAttendeePicker || !editForm) return editAttendeePicker;
      const picker = document.createElement('fieldset');
      picker.className = 'attendee-picker';
      picker.id = 'edit-attendee-picker';
      picker.innerHTML = '<legend>Who was there?</legend><div class="attendee-options"></div><small>You are included automatically. Select any paired peers who attended with you.</small>';
      editForm.querySelector('.edit-setlist')?.before(picker);
      editAttendeePicker = picker;
      return picker;
    }

    function setMessage(text, isError = false) {
      message.textContent = text;
      message.classList.toggle('error', isError);
    }

    function bind() {
      document.querySelectorAll('.star-picker').forEach((picker) => {
        picker.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => setRatingPicker(picker, button.value)));
      });
      favoriteChoice.addEventListener('click', () => setFavorite(favoriteChoice.getAttribute('aria-pressed') !== 'true'));
    }

    return {
      bind, populateAutofill, setRatingPicker, setFavorite, resetReview,
      findDuplicates, showDuplicateWarning, confirmDuplicateSave,
      renderAttendees, readAttendees, ensureEditAttendeePicker, setMessage
    };
  }

  return { createController };
}));
