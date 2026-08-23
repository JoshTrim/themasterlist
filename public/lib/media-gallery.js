(function exposeMediaGallery(root, factory) {
  const mediaGallery = factory();
  if (typeof module === 'object' && module.exports) module.exports = mediaGallery;
  else root.MasterListMediaGallery = mediaGallery;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMediaGalleryModule() {
  function createGallery({ escapeHtml, youtubeEmbedUrl, isMobileUpload, openMediaLightbox, mediaSelection, fetchJson, confirm, prompt, mediaJobs, updateJob, mediaRecognitionMarkup }) {
    const originalPreviews = new Set();
    const artifactLabels = { merch: 'Merch', ticket: 'Ticket', setlist: 'Physical setlist', poster: 'Poster', memorabilia: 'Memorabilia' };
    function renderMediaGallery(container, media = [], { editable = false, songs = [], allowCover = true, onDelete = () => {}, afterRender = () => {} } = {}) {
      container.replaceChildren();
      if (!media.length) { afterRender(container, media); return; }
          const redraw = () => renderMediaGallery(container, media, { editable, songs, allowCover, onDelete, afterRender });
          const localMedia = media.filter((item) => !item.remote);
          mediaSelection.prune(localMedia);
          const selectedCount = mediaSelection.selected(localMedia).length;
          const itemMarkup = (item) => {
            const mimeType = String(item.mimeType || '');
            const localIndex = localMedia.indexOf(item);
            const canEdit = editable && !item.remote;
            const artifactImageUrl = item.category === 'artifact' && !item.remote && originalPreviews.has(item.id)
              ? `/api/media/${encodeURIComponent(item.id)}?variant=original`
              : item.url;
            const imageStyle = `object-position:${Number(item.artifactCropX ?? 50)}% ${Number(item.artifactCropY ?? 50)}%;transform:rotate(${Number(item.rotation || 0)}deg) scale(${Number(item.artifactZoom || 1)})`;
            const source = mimeType === 'video/youtube'
              ? `<iframe src="${youtubeEmbedUrl(item.url)}" title="${escapeHtml(item.caption || 'YouTube video')}" loading="lazy" allowfullscreen></iframe>`
              : mimeType.startsWith('video/')
                ? `<video src="${item.url}" controls preload="${isMobileUpload ? 'none' : 'metadata'}"></video>`
                : `<button class="media-open" type="button"><img src="${artifactImageUrl}" alt="${escapeHtml(item.caption || 'Photo from the show')}" loading="lazy" style="${imageStyle}" /></button>`;
            const remoteState = item.remote ? `<small class="peer-media-source${item.remoteAvailable ? '' : ' is-offline'}">${item.remoteAvailable ? 'Available' : 'Currently offline'} from ${escapeHtml(item.peerName || 'peer')}</small>${item.copyUrl ? '<button type="button" class="peer-media-copy">Save local copy</button>' : ''}` : '';
            const detection = item.remote ? '' : mediaRecognitionMarkup(item, songs);
            const background = item.backgroundStatus === 'running' ? '<small class="media-background-status">Removing background…</small>' : item.backgroundStatus === 'error' ? `<small class="media-background-status media-detection-error">${escapeHtml(item.backgroundError || 'Background removal failed')}</small>` : item.useBackgroundRemoved ? '<small class="media-background-status">Transparent cutout</small>' : '';
            const artifactControls = item.category === 'artifact' && mimeType.startsWith('image/') ? `<label class="media-song-label">Artifact type<select class="artifact-type-select">${Object.entries(artifactLabels).map(([value, label]) => `<option value="${value}" ${item.artifactType === value || (!item.artifactType && value === 'memorabilia') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="artifact-notes" type="button">Notes</button><fieldset class="artifact-crop-controls"><legend>Crop and framing</legend><label>Horizontal focus<input class="artifact-crop-x" type="range" min="0" max="100" value="${Number(item.artifactCropX ?? 50)}" /></label><label>Vertical focus<input class="artifact-crop-y" type="range" min="0" max="100" value="${Number(item.artifactCropY ?? 50)}" /></label><label>Zoom<input class="artifact-zoom" type="range" min="1" max="3" step="0.05" value="${Number(item.artifactZoom ?? 1)}" /></label></fieldset>${item.backgroundFilename ? `<button type="button" class="artifact-compare">${originalPreviews.has(item.id) ? 'Preview cutout' : 'Compare with original'}</button><button type="button" class="media-background-toggle">${item.useBackgroundRemoved ? 'Make original the default' : 'Make cutout the default'}</button>` : ''}<button type="button" class="media-background-remove" ${item.backgroundStatus === 'running' ? 'disabled' : ''}>${item.backgroundFilename ? 'Recreate cutout' : item.backgroundStatus === 'error' ? 'Retry background removal' : 'Remove background'}</button>` : '';
            const menu = canEdit ? `<div class="media-actions"><button type="button" class="media-menu-toggle" aria-expanded="false">⋮ Options</button><div class="media-action-menu" hidden>${songs.length && item.category !== 'artifact' ? `<label class="media-song-label">Setlist track${item.recognitionOverride ? ' · manual override' : ''}<select class="media-song-select"><option value="">Unassigned</option>${songs.map((song, songIndex) => `<option value="${songIndex}" ${item.songIndex === songIndex ? 'selected' : ''}>${songIndex + 1}. ${escapeHtml(song.title)}</option>`).join('')}</select></label>` : ''}<button class="media-caption" type="button">${item.category === 'artifact' ? 'Title' : 'Caption'}</button>${artifactControls}${allowCover && item.category !== 'artifact' ? `<button type="button" class="media-cover">${item.isCover ? 'Cover photo' : 'Make cover'}</button>` : ''}${mimeType.startsWith('video/') && mimeType !== 'video/youtube' ? '<button type="button" class="media-trim">Trim video</button><button type="button" class="media-rotate media-rotate-cw">↻ Clockwise</button><button type="button" class="media-rotate media-rotate-ccw">↺ Counter-clockwise</button>' : ''}<button type="button" class="media-up" ${localIndex <= 0 ? 'disabled' : ''}>↑ Move earlier</button><button type="button" class="media-down" ${localIndex === localMedia.length - 1 ? 'disabled' : ''}>↓ Move later</button></div></div>` : '';
            const artifactMeta = item.category === 'artifact' ? `<div class="artifact-card-meta"><span>${escapeHtml(artifactLabels[item.artifactType] || artifactLabels.memorabilia)}</span>${item.artifactNotes ? `<p>${escapeHtml(item.artifactNotes)}</p>` : ''}</div>` : '';
            return `<figure class="media-item${item.remote ? ' is-remote' : ''}${item.isCover ? ' is-cover' : ''}${item.useBackgroundRemoved && !originalPreviews.has(item.id) ? ' is-cutout' : ''}${mediaSelection.has(item.id) ? ' is-selected' : ''}" data-media-id="${item.id}">${canEdit ? `<button type="button" class="media-delete-corner" aria-label="${mediaSelection.has(item.id) ? 'Deselect media' : 'Select media for removal'}" title="${mediaSelection.has(item.id) ? 'Deselect media' : 'Select media for removal'}" aria-pressed="${mediaSelection.has(item.id)}">×</button>` : ''}${source}<figcaption>${escapeHtml(item.caption || item.filename || '')}</figcaption>${artifactMeta}${remoteState}${background}${detection}${menu}</figure>`;
          };
          container.innerHTML = `${editable && selectedCount ? `<div class="media-bulk-actions"><span>${selectedCount} selected</span><button type="button" class="media-bulk-delete">Remove selected</button><button type="button" class="media-bulk-clear">Clear</button></div>` : ''}${media.map(itemMarkup).join('')}`;
      container.querySelectorAll('.media-open').forEach((button) => button.addEventListener('click', () => {
        const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
        if (item) openMediaLightbox(item);
      }));
      container.querySelectorAll('.peer-media-copy').forEach((button) => button.addEventListener('click', async () => {
        const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
        if (!item?.copyUrl) return;
        button.disabled = true; button.textContent = 'Queueing…';
        try {
          const result = await fetchJson(item.copyUrl, { method: 'POST' });
          if (result.duplicate) button.textContent = 'Already saved';
          else { updateJob(result.id, result); button.textContent = 'Copy queued'; }
        } catch (error) { button.disabled = false; button.textContent = error.message; }
      }));
      if (editable) {
        container.querySelectorAll('.media-delete-corner').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          if (!item) return;
          mediaSelection.toggle(item.id);
          redraw();
        }));
        container.querySelector('.media-bulk-clear')?.addEventListener('click', () => { mediaSelection.clear(); redraw(); });
        container.querySelector('.media-bulk-delete')?.addEventListener('click', async (event) => {
          const selected = mediaSelection.selected(localMedia);
          if (!selected.length || !confirm(`Remove ${selected.length} selected media item${selected.length === 1 ? '' : 's'}?`)) return;
          event.currentTarget.disabled = true;
          try {
            await Promise.all(selected.map((item) => fetchJson(`/api/media/${item.id}`, { method: 'DELETE' })));
            selected.forEach((item) => { mediaSelection.delete(item.id); media.splice(media.indexOf(item), 1); });
            onDelete(selected);
            redraw();
          } catch (error) { event.currentTarget.disabled = false; event.currentTarget.textContent = error.message; }
        });
        container.querySelectorAll('.media-song-select').forEach((select) => select.addEventListener('change', async () => {
          const item = media.find((entry) => entry.id === select.closest('.media-item').dataset.mediaId);
          const value = select.value === '' ? null : Number(select.value);
          await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songIndex: value, recognitionOverride: true }) });
          item.songIndex = value;
          item.recognitionOverride = true;
          redraw();
        }));
        container.querySelectorAll('.media-menu-toggle').forEach((button) => button.addEventListener('click', () => {
          const menu = button.nextElementSibling;
          const open = menu.hidden;
          container.querySelectorAll('.media-action-menu').forEach((entry) => { entry.hidden = true; });
          container.querySelectorAll('.media-menu-toggle').forEach((entry) => entry.setAttribute('aria-expanded', 'false'));
          menu.hidden = !open;
          button.setAttribute('aria-expanded', String(open));
        }));
        container.querySelectorAll('.media-caption').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          const caption = prompt('Caption this memory', item.caption || item.filename || '');
          if (caption === null) return;
          await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caption }) });
          item.caption = caption; redraw();
        }));
        container.querySelectorAll('.artifact-type-select').forEach((select) => select.addEventListener('change', async () => {
          const item = media.find((entry) => entry.id === select.closest('.media-item').dataset.mediaId);
          const updated = await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artifactType: select.value }) });
          Object.assign(item, updated); redraw();
        }));
        container.querySelectorAll('.artifact-notes').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          const artifactNotes = prompt('Notes about this artifact', item.artifactNotes || '');
          if (artifactNotes === null) return;
          const updated = await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artifactNotes }) });
          Object.assign(item, updated); redraw();
        }));
        container.querySelectorAll('.artifact-compare').forEach((button) => button.addEventListener('click', () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          if (originalPreviews.has(item.id)) originalPreviews.delete(item.id); else originalPreviews.add(item.id);
          redraw();
        }));
        container.querySelectorAll('.artifact-crop-controls input').forEach((input) => {
          const preview = () => {
            const card = input.closest('.media-item'); const item = media.find((entry) => entry.id === card.dataset.mediaId);
            item.artifactCropX = Number(card.querySelector('.artifact-crop-x').value);
            item.artifactCropY = Number(card.querySelector('.artifact-crop-y').value);
            item.artifactZoom = Number(card.querySelector('.artifact-zoom').value);
            const image = card.querySelector('img');
            if (image) image.style.cssText = `object-position:${item.artifactCropX}% ${item.artifactCropY}%;transform:rotate(${Number(item.rotation || 0)}deg) scale(${item.artifactZoom})`;
          };
          input.addEventListener('input', preview);
          input.addEventListener('change', async () => {
          const item = media.find((entry) => entry.id === input.closest('.media-item').dataset.mediaId); preview();
          const body = {
            artifactCropX: Number(input.closest('.artifact-crop-controls').querySelector('.artifact-crop-x').value),
            artifactCropY: Number(input.closest('.artifact-crop-controls').querySelector('.artifact-crop-y').value),
            artifactZoom: Number(input.closest('.artifact-crop-controls').querySelector('.artifact-zoom').value)
          };
          const updated = await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          Object.assign(item, updated); redraw();
          });
        });
        container.querySelectorAll('.media-background-toggle').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          const updated = await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useBackgroundRemoved: !item.useBackgroundRemoved }) });
          Object.assign(item, updated);
          redraw();
        }));
        container.querySelectorAll('.media-background-remove').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          button.disabled = true;
          try {
            const job = await fetchJson(`/api/media/${item.id}/remove-background`, { method: 'POST' });
            item.backgroundStatus = 'running';
            updateJob(job.jobId, { id: job.jobId, type: 'Remove background', name: item.caption || item.filename, status: 'running', progress: 10 });
            const status = await mediaJobs.poll({ fetchStatus: () => fetchJson(`/api/jobs/${job.jobId}`), onUpdate: (current) => updateJob(job.jobId, current), interval: 900 });
            if (status.status === 'error') throw new Error(status.error || 'Background removal failed.');
            item.backgroundStatus = 'complete';
            item.backgroundFilename = `${item.id}.cutout.png`;
            item.backgroundError = '';
            item.useBackgroundRemoved = true;
            item.url = `/api/media/${item.id}?variant=cutout&v=${Date.now()}`;
          } catch (error) {
            item.backgroundStatus = 'error'; item.backgroundError = error.message;
          }
          redraw();
        }));
        container.querySelectorAll('.media-cover').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isCover: true }) });
          media.forEach((entry) => { entry.isCover = entry.id === item.id; }); redraw();
        }));
        container.querySelectorAll('.media-trim').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          const start = prompt('Trim start time in seconds', '0'); if (start === null) return;
          const end = prompt('Trim end time in seconds', ''); if (end === null || end === '' || Number(end) <= Number(start)) return;
          button.disabled = true; button.textContent = 'Trimming…';
          try { const job = await fetchJson(`/api/media/${item.id}/trim?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { method: 'POST' }); const status = await mediaJobs.poll({ fetchStatus: () => fetchJson(`/api/media/rotate/${job.jobId}`), isActive: (current) => current.status === 'running', onUpdate: (current) => { button.textContent = `Trimming ${current.progress}%`; } }); if (status.status === 'error') throw new Error(status.error || 'Video trim failed.'); redraw(); } catch (error) { button.textContent = error.message; } finally { button.disabled = false; }
        }));
        container.querySelectorAll('.media-rotate').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          if (item.mimeType.startsWith('video/')) {
            button.disabled = true; button.textContent = 'Rotating…';
            const direction = button.classList.contains('media-rotate-ccw') ? 'counterclockwise' : 'clockwise';
            const job = await fetchJson(`/api/media/${item.id}/rotate?direction=${direction}`, { method: 'POST' });
            const status = await mediaJobs.poll({ fetchStatus: () => fetchJson(`/api/media/rotate/${job.jobId}`), isActive: (current) => current.status === 'running', onUpdate: (current) => { button.textContent = `Rotating ${current.progress}%`; } });
            if (status.status === 'error') throw new Error(status.error || 'Video rotation failed.');
          } else {
            item.rotation = ((item.rotation || 0) + 90) % 360;
            await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotation: item.rotation }) });
          }
          redraw();
        }));
        container.querySelectorAll('.media-up, .media-down').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          const index = localMedia.indexOf(item); const nextIndex = button.classList.contains('media-up') ? index - 1 : index + 1;
          if (nextIndex < 0 || nextIndex >= localMedia.length) return;
          [localMedia[index], localMedia[nextIndex]] = [localMedia[nextIndex], localMedia[index]];
          media.splice(0, localMedia.length, ...localMedia);
          await Promise.all(localMedia.map((entry, order) => fetchJson(`/api/media/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: order }) })));
          redraw();
        }));
      }
      afterRender(container, media);
    }
    return { render: renderMediaGallery };
  }

  return { createGallery };
}));
