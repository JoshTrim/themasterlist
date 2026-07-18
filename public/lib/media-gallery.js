(function exposeMediaGallery(root, factory) {
  const mediaGallery = factory();
  if (typeof module === 'object' && module.exports) module.exports = mediaGallery;
  else root.MasterListMediaGallery = mediaGallery;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMediaGalleryModule() {
  function createGallery({ escapeHtml, youtubeEmbedUrl, isMobileUpload, openMediaLightbox, mediaSelection, fetchJson, confirm, prompt, mediaJobs, updateJob, mediaRecognitionMarkup }) {
    function renderMediaGallery(container, media = [], { editable = false, songs = [], allowCover = true, onDelete = () => {}, afterRender = () => {} } = {}) {
      container.replaceChildren();
      if (!media.length) { afterRender(container, media); return; }
          const redraw = () => renderMediaGallery(container, media, { editable, songs, allowCover, onDelete, afterRender });
          mediaSelection.prune(media);
          const selectedCount = mediaSelection.selected(media).length;
          container.innerHTML = `${editable && selectedCount ? `<div class="media-bulk-actions"><span>${selectedCount} selected</span><button type="button" class="media-bulk-delete">Remove selected</button><button type="button" class="media-bulk-clear">Clear</button></div>` : ''}${media.map((item, index) => `<figure class="media-item${item.isCover ? ' is-cover' : ''}${item.useBackgroundRemoved ? ' is-cutout' : ''}${mediaSelection.has(item.id) ? ' is-selected' : ''}" data-media-id="${item.id}">${editable ? `<button type="button" class="media-delete-corner" aria-label="${mediaSelection.has(item.id) ? 'Deselect media' : 'Select media for removal'}" title="${mediaSelection.has(item.id) ? 'Deselect media' : 'Select media for removal'}" aria-pressed="${mediaSelection.has(item.id)}">×</button>` : ''}${item.mimeType === 'video/youtube' ? `<iframe src="${youtubeEmbedUrl(item.url)}" title="${escapeHtml(item.caption || 'YouTube video')}" loading="lazy" allowfullscreen></iframe>` : item.mimeType.startsWith('video/') ? `<video src="${item.url}" controls preload="${isMobileUpload ? 'none' : 'metadata'}"></video>` : `<button class="media-open" type="button"><img src="${item.url}" alt="${escapeHtml(item.caption || 'Photo from the show')}" loading="lazy" style="transform:rotate(${item.rotation || 0}deg)" /></button>`}<figcaption>${escapeHtml(item.caption || item.filename || '')}</figcaption>${item.backgroundStatus === 'running' ? '<small class="media-background-status">Removing background…</small>' : item.backgroundStatus === 'error' ? `<small class="media-background-status media-detection-error">${escapeHtml(item.backgroundError || 'Background removal failed')}</small>` : item.useBackgroundRemoved ? '<small class="media-background-status">Transparent cutout</small>' : ''}${mediaRecognitionMarkup(item, songs)}${editable ? `<div class="media-actions"><button type="button" class="media-menu-toggle" aria-expanded="false">⋮ Options</button><div class="media-action-menu" hidden>${songs.length && item.category !== 'artifact' ? `<label class="media-song-label">Setlist track${item.recognitionOverride ? ' · manual override' : ''}<select class="media-song-select"><option value="">Unassigned</option>${songs.map((song, songIndex) => `<option value="${songIndex}" ${item.songIndex === songIndex ? 'selected' : ''}>${songIndex + 1}. ${escapeHtml(song.title)}</option>`).join('')}</select></label>` : ''}<button class="media-caption" type="button">Caption</button>${allowCover && item.category !== 'artifact' ? `<button type="button" class="media-cover">${item.isCover ? 'Cover photo' : 'Make cover'}</button>` : ''}${item.category === 'artifact' && item.mimeType.startsWith('image/') ? `${item.backgroundFilename ? `<button type="button" class="media-background-toggle">${item.useBackgroundRemoved ? 'Use original photo' : 'Use transparent cutout'}</button>` : ''}<button type="button" class="media-background-remove" ${item.backgroundStatus === 'running' ? 'disabled' : ''}>${item.backgroundFilename ? 'Recreate cutout' : item.backgroundStatus === 'error' ? 'Retry background removal' : 'Remove background'}</button>` : ''}${item.mimeType.startsWith('video/') && item.mimeType !== 'video/youtube' ? '<button type="button" class="media-trim">Trim video</button><button type="button" class="media-rotate media-rotate-cw">↻ Clockwise</button><button type="button" class="media-rotate media-rotate-ccw">↺ Counter-clockwise</button>' : ''}<button type="button" class="media-up" ${index === 0 ? 'disabled' : ''}>↑ Move earlier</button><button type="button" class="media-down" ${index === media.length - 1 ? 'disabled' : ''}>↓ Move later</button></div></div>` : ''}</figure>`).join('')}`;
      container.querySelectorAll('.media-open').forEach((button, index) => button.addEventListener('click', () => openMediaLightbox(media[index])));
      if (editable) {
        container.querySelectorAll('.media-delete-corner').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          if (!item) return;
          mediaSelection.toggle(item.id);
          redraw();
        }));
        container.querySelector('.media-bulk-clear')?.addEventListener('click', () => { mediaSelection.clear(); redraw(); });
        container.querySelector('.media-bulk-delete')?.addEventListener('click', async (event) => {
          const selected = mediaSelection.selected(media);
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
          const index = media.indexOf(item); const nextIndex = button.classList.contains('media-up') ? index - 1 : index + 1;
          if (nextIndex < 0 || nextIndex >= media.length) return;
          [media[index], media[nextIndex]] = [media[nextIndex], media[index]];
          await Promise.all(media.map((entry, order) => fetchJson(`/api/media/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: order }) })));
          redraw();
        }));
      }
      afterRender(container, media);
    }
    return { render: renderMediaGallery };
  }

  return { createGallery };
}));
