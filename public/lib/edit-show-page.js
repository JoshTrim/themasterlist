(function initEditShowPage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListEditShowPage = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function editShowPageFactory() {
  function formValues(form, FormDataClass = FormData) {
    return Object.fromEntries(new FormDataClass(form).entries());
  }

  function createController({
    page, gigId, FormDataClass = FormData, fetchJson, editor, workflow, trackEditor,
    getGigs, onGigs, setupImmediateUpload, showDuplicateWarning, confirmDuplicateSave,
    ensureAttendeePicker, renderAttendees, readAttendees, renderMediaWorkspace,
    getMediaFiles, uploadFiles, addExternalMedia, renderArchive, actsController, elements
  }) {
    const { form, message, mediaInput, duplicateWarning } = elements;
    let gig = null;

    function values() { return formValues(form, FormDataClass); }

    function setMessage(text, isError = false) {
      message.textContent = text;
      message.classList.toggle('error', isError);
    }

    function render() {
      if (page !== 'edit') return null;
      gig = getGigs().find((entry) => entry.id === gigId) || null;
      if (!gig) { setMessage('Show not found.', true); return null; }
      setupImmediateUpload(gig);
      form.elements.artist.value = gig.artist;
      form.elements.date.value = gig.date;
      form.elements.venue.value = gig.venue;
      form.elements.city.value = gig.city;
      showDuplicateWarning(duplicateWarning, values(), gig.id);
      trackEditor.load(gig.songs || []);
      actsController?.setActs(gig.acts || []);
      renderMediaWorkspace(gig, gig.media);
      renderAttendees(ensureAttendeePicker(), gig.attendees || []);
      return gig;
    }

    async function submit() {
      if (!gig) return null;
      const submitButton = form.querySelector('button[type="submit"]');
      try {
        if (!confirmDuplicateSave(duplicateWarning, values(), gig.id)) return null;
        submitButton.disabled = true;
        const update = editor.createEditPayload(values(), { attendees: readAttendees(ensureAttendeePicker()), songs: trackEditor.sync(), acts: actsController?.getActs() || [] });
        const files = getMediaFiles();
        const result = await workflow.updateShow({
          gig, update, mediaFiles: files,
          saveShow: (record, payload) => fetchJson(`/api/gigs/${record.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
          uploadFiles, addExternalMedia,
          refreshMedia: (record) => fetchJson(`/api/gigs/${record.id}/media`)
        });
        Object.assign(gig, result.saved);
        onGigs(getGigs().map((entry) => entry.id === gig.id ? gig : entry));
        setMessage(files.length ? 'Show and media saved.' : 'Show saved.');
        mediaInput.value = '';
        renderMediaWorkspace(gig, result.media);
        renderArchive();
        return result;
      } catch (error) {
        setMessage(error.message, true);
        return null;
      } finally { submitButton.disabled = false; }
    }

    function bind() {
      ['artist', 'venue', 'city', 'date'].forEach((name) => form.elements[name]?.addEventListener('input', () => {
        if (gig) showDuplicateWarning(duplicateWarning, values(), gig.id);
      }));
      form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
    }

    return { values, render, submit, bind, getGig: () => gig };
  }

  return { formValues, createController };
}));
