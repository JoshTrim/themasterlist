(function exposeArtifactCreator(root, factory) {
  const artifactCreator = factory();
  if (typeof module === 'object' && module.exports) module.exports = artifactCreator;
  else root.MasterListArtifactCreator = artifactCreator;
}(typeof globalThis !== 'undefined' ? globalThis : this, function artifactCreatorFactory() {
  const typeLabels = Object.freeze({ merch: 'Merch', ticket: 'Ticket', setlist: 'Physical setlist', poster: 'Poster', memorabilia: 'Memorabilia' });

  function validateDraft(draft = {}) {
    if (!String(draft.title || '').trim()) throw new Error('Enter a title for this artifact.');
    if (!draft.front?.file) throw new Error('Choose a front photo.');
    for (const detail of draft.details || []) {
      if (detail.file && !String(detail.label || '').trim()) throw new Error('Name each detail photo before uploading.');
    }
    return true;
  }

  async function createArtifact({ gigId, draft, uploadFiles, fetchJson, removeBackground, onStatus = () => {} }) {
    validateDraft(draft);
    const title = String(draft.title).trim();
    const artifactType = typeLabels[draft.type] ? draft.type : 'memorabilia';
    const artifactNotes = String(draft.notes || '').trim();
    const uploadView = async (entry, options) => {
      onStatus(entry.key, 'uploading', 0);
      const uploaded = await uploadFiles(gigId, [entry.file], (_file, fraction) => onStatus(entry.key, 'uploading', Math.round(fraction * 100)), 'artifact', options);
      const media = uploaded?.[0];
      if (!media?.id) throw new Error(`${entry.label || 'Artifact photo'} did not finish uploading.`);
      if (media.duplicate) throw new Error(`${entry.label || 'Artifact photo'} is already attached to this show.`);
      onStatus(entry.key, 'uploaded', 100);
      return media;
    };

    const front = await uploadView(draft.front, { artifactView: 'front' });
    const savedFront = await fetchJson(`/api/media/${front.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: title, artifactType, artifactNotes })
    });
    const groupId = savedFront.artifactGroupId || front.artifactGroupId || front.id;
    const media = [savedFront];
    const remaining = [draft.back, ...(draft.details || [])].filter((entry) => entry?.file);
    for (const entry of remaining) {
      media.push(await uploadView(entry, {
        artifactGroupId: groupId,
        artifactView: entry.view,
        artifactViewLabel: entry.view === 'detail' ? String(entry.label || '').trim() : ''
      }));
    }

    const backgroundErrors = [];
    if (draft.removeBackground && removeBackground) {
      for (let index = 0; index < media.length; index += 1) {
        const entry = [draft.front, ...remaining][index];
        try {
          await removeBackground(media[index], (progress) => onStatus(entry.key, 'background', progress));
          onStatus(entry.key, 'complete', 100);
        } catch (error) {
          backgroundErrors.push({ id: media[index].id, error: error.message });
          onStatus(entry.key, 'background-error', 100, error.message);
        }
      }
    } else {
      [draft.front, ...remaining].forEach((entry) => onStatus(entry.key, 'complete', 100));
    }
    return { groupId, media, backgroundErrors };
  }

  function createController({ document, URLApi = URL, uploadFiles, fetchJson, mediaJobs, updateJob, refreshWorkspace, elements }) {
    const { form, title, type, notes, front, back, addDetail, details, preview, removeBackground, submit, message } = elements;
    let gig = null; let detailSequence = 0; const objectUrls = new Set();

    function setMessage(text, isError = false) {
      message.textContent = text;
      message.classList.toggle('error', isError);
    }

    function fileFor(input) { return input?.files?.[0] || null; }
    function detailRows() { return [...details.querySelectorAll('.artifact-create-detail')]; }
    function draft() {
      return {
        title: title.value, type: type.value, notes: notes.value,
        front: { key: 'front', view: 'front', label: 'Front', file: fileFor(front) },
        back: { key: 'back', view: 'back', label: 'Back', file: fileFor(back) },
        details: detailRows().map((row) => ({ key: row.dataset.detailKey, view: 'detail', label: row.querySelector('[data-detail-label]').value, file: fileFor(row.querySelector('[data-detail-file]')) })),
        removeBackground: Boolean(removeBackground.checked)
      };
    }

    function clearObjectUrls() { objectUrls.forEach((url) => URLApi.revokeObjectURL?.(url)); objectUrls.clear(); }
    function previewCard(entry) {
      const card = document.createElement('article'); card.className = 'artifact-create-preview-card'; card.dataset.previewKey = entry.key;
      const frame = document.createElement('div'); frame.className = 'artifact-create-preview-image';
      if (entry.file) {
        const image = document.createElement('img'); const url = URLApi.createObjectURL(entry.file); objectUrls.add(url);
        image.src = url; image.alt = `${entry.label || 'Detail'} preview`; frame.append(image);
      } else { const empty = document.createElement('span'); empty.textContent = 'No photo'; frame.append(empty); }
      const copy = document.createElement('div'); const heading = document.createElement('strong'); heading.textContent = entry.label || 'Unnamed detail';
      const status = document.createElement('small'); status.dataset.viewStatus = entry.key; status.textContent = entry.file ? 'Ready to upload' : 'Optional';
      const progress = document.createElement('progress'); progress.max = 100; progress.value = 0; progress.hidden = true;
      copy.append(heading, status, progress); card.append(frame, copy); return card;
    }

    function renderPreview() {
      clearObjectUrls(); preview.replaceChildren(); const current = draft();
      const heading = document.createElement('header'); const eyebrow = document.createElement('span'); eyebrow.textContent = typeLabels[current.type] || typeLabels.memorabilia;
      const name = document.createElement('h3'); name.textContent = String(current.title || '').trim() || 'Untitled artifact'; heading.append(eyebrow, name); preview.append(heading);
      const grid = document.createElement('div'); grid.className = 'artifact-create-preview-grid';
      [current.front, current.back, ...current.details].forEach((entry) => grid.append(previewCard(entry))); preview.append(grid);
    }

    function addDetailRow() {
      detailSequence += 1; const row = document.createElement('div'); row.className = 'artifact-create-detail'; row.dataset.detailKey = `detail-${detailSequence}`;
      const label = document.createElement('label'); label.textContent = 'Detail name'; const labelInput = document.createElement('input'); labelInput.dataset.detailLabel = ''; labelInput.placeholder = 'Sleeve print'; label.append(labelInput);
      const fileLabel = document.createElement('label'); fileLabel.textContent = 'Detail photo'; const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp'; fileInput.dataset.detailFile = ''; fileLabel.append(fileInput);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'artifact-create-detail-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove detail photo');
      [labelInput, fileInput].forEach((input) => input.addEventListener('input', renderPreview)); fileInput.addEventListener('change', renderPreview);
      remove.addEventListener('click', () => { row.remove(); renderPreview(); }); row.append(label, fileLabel, remove); details.append(row); renderPreview();
    }

    function updateViewStatus(key, state, progress = 0, error = '') {
      const card = preview.querySelector(`[data-preview-key="${key}"]`); if (!card) return;
      const status = card.querySelector('[data-view-status]'); const meter = card.querySelector('progress');
      const labels = { uploading: `Uploading · ${progress}%`, uploaded: 'Uploaded', background: `Removing background · ${progress}%`, complete: 'Complete', 'background-error': error || 'Background removal failed' };
      status.textContent = labels[state] || state; status.classList.toggle('error', state === 'background-error'); meter.hidden = !['uploading', 'background'].includes(state); meter.value = progress;
    }

    async function runBackgroundRemoval(media, onProgress) {
      const job = await fetchJson(`/api/media/${media.id}/remove-background`, { method: 'POST' });
      updateJob(job.jobId, { id: job.jobId, type: 'Remove background', name: media.caption || media.filename, status: 'running', progress: 10 });
      const result = await mediaJobs.poll({
        fetchStatus: () => fetchJson(`/api/jobs/${job.jobId}`), interval: 900,
        onUpdate: (current) => { updateJob(job.jobId, current); onProgress(Number(current.progress || 0)); }
      });
      if (result.status === 'error') throw new Error(result.error || 'Background removal failed.');
    }

    async function submitArtifact() {
      if (!gig) return null; const current = draft();
      try {
        validateDraft(current); submit.disabled = true; setMessage('Creating artifact…');
        const result = await createArtifact({ gigId: gig.id, draft: current, uploadFiles, fetchJson, removeBackground: runBackgroundRemoval, onStatus: updateViewStatus });
        await refreshWorkspace(gig); setMessage(result.backgroundErrors.length ? `Artifact created. ${result.backgroundErrors.length} background task${result.backgroundErrors.length === 1 ? '' : 's'} failed.` : 'Artifact created.');
        form.reset(); details.replaceChildren(); renderPreview(); return result;
      } catch (error) { setMessage(error.message, true); return null; }
      finally { submit.disabled = false; }
    }

    function setup(nextGig) { gig = nextGig; return gig; }
    function bind() {
      [title, type, notes].forEach((input) => input.addEventListener('input', renderPreview));
      [front, back].forEach((input) => input.addEventListener('change', renderPreview));
      addDetail.addEventListener('click', addDetailRow); form.addEventListener('submit', (event) => { event.preventDefault(); submitArtifact(); }); renderPreview();
    }

    return { setup, bind, draft, renderPreview, addDetailRow, submit: submitArtifact };
  }

  return { typeLabels, validateDraft, createArtifact, createController };
}));
