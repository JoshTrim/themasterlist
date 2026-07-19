(function exposeMetadataEditor(root, factory) {
  const metadataEditor = factory();
  if (typeof module === 'object' && module.exports) module.exports = metadataEditor;
  else root.MasterListMetadataEditor = metadataEditor;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMetadataEditorModule() {
  function updatePreview(preview, imageUrl, imagePosition = 'center') {
    const frame = preview.closest('.metadata-image-preview');
    preview.style.objectPosition = imagePosition;
    preview.hidden = !imageUrl;
    if (imageUrl) preview.src = imageUrl;
    else preview.removeAttribute('src');
    frame?.classList.toggle('has-image', Boolean(imageUrl));
  }

  function bindPreview(form, preview, urls = globalThis.URL) {
    if (!form || form.dataset.previewBound) return;
    form.dataset.previewBound = 'true';
    let objectUrl = '';
    const position = () => form.elements.imagePosition.value || 'center';
    form.elements.imagePosition.addEventListener('change', () => { preview.style.objectPosition = position(); });
    form.elements.image.addEventListener('input', () => {
      if (form.elements.imageFile.files.length) return;
      updatePreview(preview, form.elements.image.value.trim(), position());
    });
    form.elements.imageFile.addEventListener('change', () => {
      if (objectUrl) urls.revokeObjectURL(objectUrl);
      const file = form.elements.imageFile.files[0];
      objectUrl = file ? urls.createObjectURL(file) : '';
      updatePreview(preview, objectUrl || form.elements.image.value.trim(), position());
    });
  }

  function readImageUpload(file, { validateImage, FileReaderClass = globalThis.FileReader }) {
    if (!file) return Promise.resolve(null);
    try { validateImage(file); } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const reader = new FileReaderClass();
      reader.onerror = () => reject(new Error('The selected image could not be read.'));
      reader.onload = () => resolve({ filename: file.name, mimeType: file.type, data: String(reader.result).split(',')[1] || '' });
      reader.readAsDataURL(file);
    });
  }

  async function formPayload(form, { validateImage, FormDataClass = globalThis.FormData, FileReaderClass = globalThis.FileReader }) {
    const payload = Object.fromEntries(new FormDataClass(form).entries());
    delete payload.imageFile;
    if (form.elements.isClosed) payload.isClosed = form.elements.isClosed.checked;
    const imageUpload = await readImageUpload(form.elements.imageFile.files[0], { validateImage, FileReaderClass });
    if (imageUpload) payload.imageUpload = imageUpload;
    return payload;
  }

  function populateForm(form, preview, info, urls) {
    form.elements.title.value = info.title || '';
    form.elements.description.value = info.description || '';
    form.elements.bio.value = info.bio || '';
    form.elements.image.value = info.image || '';
    form.elements.source.value = info.source || '';
    if (form.elements.genres) form.elements.genres.value = (info.genres || []).join(', ');
    if (form.elements.isClosed) form.elements.isClosed.checked = Boolean(info.isClosed);
    form.elements.imagePosition.value = info.imagePosition || 'center';
    form.elements.imageFile.value = '';
    updatePreview(preview, info.image || '', info.imagePosition || 'center');
    bindPreview(form, preview, urls);
  }

  function populateVenueLocation(form, info) {
    form.elements.locationAddress.value = '';
    form.elements.latitude.value = info.coordinates?.lat ?? '';
    form.elements.longitude.value = info.coordinates?.lng ?? '';
  }

  function renderStepper(container, { entries, type, name, city = '', escapeHtml }) {
    const currentKey = `${name}|${type === 'venue' ? city : ''}`.toLocaleLowerCase();
    const index = entries.findIndex((entry) => `${entry.name}|${entry.city}`.toLocaleLowerCase() === currentKey);
    const linkFor = (entry) => type === 'artist' ? `/artist/edit?name=${encodeURIComponent(entry.name)}` : `/venue/edit?name=${encodeURIComponent(entry.name)}&city=${encodeURIComponent(entry.city)}`;
    const step = (entry, direction) => entry
      ? `<a class="metadata-step metadata-step-${direction}" href="${linkFor(entry)}"><small>${direction === 'previous' ? '← Previous' : 'Next →'}</small><strong>${escapeHtml(entry.name)}</strong></a>`
      : `<span class="metadata-step metadata-step-${direction} is-disabled"><small>${direction === 'previous' ? '← Previous' : 'Next →'}</small><strong>End of list</strong></span>`;
    if (index < 0 || !entries.length) { container.hidden = true; return; }
    container.hidden = false;
    container.innerHTML = `${step(entries[index - 1], 'previous')}<span class="metadata-step-count">${index + 1} / ${entries.length}</span>${step(entries[index + 1], 'next')}`;
  }

  function createController({
    page, routePage, type, name, city = '', form, preview, message, stepper, heading, backLink,
    fetchJson, validateImage, getEntries, escapeHtml, urls = globalThis.URL,
    FormDataClass = globalThis.FormData, FileReaderClass = globalThis.FileReader,
    afterSave = () => {}
  }) {
    const endpoint = type === 'artist'
      ? `/api/artists?name=${encodeURIComponent(name)}`
      : `/api/venues?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}`;
    const backHref = type === 'artist'
      ? `/artist?name=${encodeURIComponent(name)}`
      : `/venue?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}`;
    const label = type === 'artist' ? 'artist' : 'venue';

    function applyInfo(info) {
      populateForm(form, preview, info, urls);
      if (type === 'venue') populateVenueLocation(form, info);
    }

    async function load() {
      if (page !== routePage) return;
      if (!name) {
        message.textContent = `Choose ${type === 'artist' ? 'an artist' : 'a venue'} to edit.`;
        message.classList.add('error');
        return;
      }
      const info = await fetchJson(endpoint);
      heading.textContent = `Edit ${info.title || name}`;
      backLink.href = backHref;
      applyInfo(info);
      renderStepper(stepper, { entries: getEntries(), type, name, city, escapeHtml });
    }

    async function save() {
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      message.textContent = `Saving ${label} info…`;
      message.classList.remove('error');
      try {
        const payload = await formPayload(form, { validateImage, FormDataClass, FileReaderClass });
        const info = await fetchJson(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        applyInfo(info);
        afterSave(info);
        message.textContent = `${type === 'artist' ? 'Artist' : 'Venue'} info saved.`;
        message.classList.remove('error');
      } catch (error) {
        message.textContent = error.message;
        message.classList.add('error');
      } finally {
        submit.disabled = false;
      }
    }

    function bind() {
      form.addEventListener('submit', (event) => {
        if (page !== routePage) return;
        event.preventDefault();
        save();
      });
    }

    return { load, save, bind };
  }

  return { updatePreview, bindPreview, readImageUpload, formPayload, populateForm, populateVenueLocation, renderStepper, createController };
}));
