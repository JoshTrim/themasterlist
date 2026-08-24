(function exposeMediaGallery(root, factory) {
  const mediaGallery = factory();
  if (typeof module === 'object' && module.exports) module.exports = mediaGallery;
  else root.MasterListMediaGallery = mediaGallery;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMediaGalleryModule() {
  function createGallery({ escapeHtml, youtubeEmbedUrl, isMobileUpload, openMediaLightbox, mediaSelection, fetchJson, confirm, prompt, mediaJobs, updateJob, mediaRecognitionMarkup }) {
    const originalPreviews = new Set();
    const artifactLabels = { merch: 'Merch', ticket: 'Ticket', setlist: 'Physical setlist', poster: 'Poster', memorabilia: 'Memorabilia' };
    function artifactGroups(media) {
      const groups = new Map();
      media.forEach((item) => {
        const id = item.artifactGroupId || item.id;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(item);
      });
      return [...groups.entries()].map(([id, views]) => {
        const order = { front: 0, back: 1, detail: 2 };
        views.sort((left, right) => (order[left.artifactView || 'front'] ?? 3) - (order[right.artifactView || 'front'] ?? 3) || Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
        return { id, views, cover: views.find((item) => item.artifactIsCover) || views.find((item) => (item.artifactView || 'front') === 'front') || views[0] };
      });
    }

    function uploadArtifactView(gigId, groupId, view, label, file) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/gigs/${encodeURIComponent(gigId)}/artifacts`);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.setRequestHeader('X-Media-Filename', encodeURIComponent(file.name));
        xhr.setRequestHeader('X-Artifact-Group-Id', groupId);
        xhr.setRequestHeader('X-Artifact-View', view);
        if (label) xhr.setRequestHeader('X-Artifact-View-Label', label);
        xhr.onload = () => { let body = {}; try { body = JSON.parse(xhr.responseText); } catch {} if (xhr.status >= 200 && xhr.status < 300) resolve(body.media || body); else reject(new Error(body.error || 'Artifact upload failed.')); };
        xhr.onerror = () => reject(new Error('Artifact upload failed.'));
        xhr.send(file);
      });
    }

    function renderMediaGallery(container, media = [], { editable = false, songs = [], allowCover = true, gigId = '', onDelete = () => {}, afterRender = () => {} } = {}) {
      container.replaceChildren();
      if (!media.length) { afterRender(container, media); return; }
          const redraw = () => renderMediaGallery(container, media, { editable, songs, allowCover, gigId, onDelete, afterRender });
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
            const replaceControl = gigId && item.category === 'artifact' ? '<label class="artifact-replace-photo">Replace this photo<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" /></label>' : '';
            const artifactControls = item.category === 'artifact' && mimeType.startsWith('image/') ? `<label class="media-song-label">Artifact type<select class="artifact-type-select">${Object.entries(artifactLabels).map(([value, label]) => `<option value="${value}" ${item.artifactType === value || (!item.artifactType && value === 'memorabilia') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="artifact-notes" type="button">Notes</button>${replaceControl}<fieldset class="artifact-crop-controls"><legend>Crop and framing</legend><label>Horizontal focus<input class="artifact-crop-x" type="range" min="0" max="100" value="${Number(item.artifactCropX ?? 50)}" /></label><label>Vertical focus<input class="artifact-crop-y" type="range" min="0" max="100" value="${Number(item.artifactCropY ?? 50)}" /></label><label>Zoom<input class="artifact-zoom" type="range" min="1" max="3" step="0.05" value="${Number(item.artifactZoom ?? 1)}" /></label></fieldset>${item.backgroundFilename ? `<button type="button" class="artifact-compare">${originalPreviews.has(item.id) ? 'Preview cutout' : 'Compare with original'}</button><button type="button" class="media-background-toggle">${item.useBackgroundRemoved ? 'Make original the default' : 'Make cutout the default'}</button>` : ''}<button type="button" class="media-background-remove" ${item.backgroundStatus === 'running' ? 'disabled' : ''}>${item.backgroundFilename ? 'Recreate cutout' : item.backgroundStatus === 'error' ? 'Retry background removal' : 'Remove background'}</button>` : '';
            const menu = canEdit ? `<div class="media-actions"><button type="button" class="media-menu-toggle" aria-expanded="false">⋮ Options</button><div class="media-action-menu" hidden>${songs.length && item.category !== 'artifact' ? `<label class="media-song-label">Setlist track${item.recognitionOverride ? ' · manual override' : ''}<select class="media-song-select"><option value="">Unassigned</option>${songs.map((song, songIndex) => `<option value="${songIndex}" ${item.songIndex === songIndex ? 'selected' : ''}>${songIndex + 1}. ${escapeHtml(song.title)}</option>`).join('')}</select></label>` : ''}<button class="media-caption" type="button">${item.category === 'artifact' ? 'Title' : 'Caption'}</button>${artifactControls}${allowCover && item.category !== 'artifact' ? `<button type="button" class="media-cover">${item.isCover ? 'Cover photo' : 'Make cover'}</button>` : ''}${mimeType.startsWith('video/') && mimeType !== 'video/youtube' ? '<button type="button" class="media-trim">Trim video</button><button type="button" class="media-rotate media-rotate-cw">↻ Clockwise</button><button type="button" class="media-rotate media-rotate-ccw">↺ Counter-clockwise</button>' : ''}<button type="button" class="media-up" ${localIndex <= 0 ? 'disabled' : ''}>↑ Move earlier</button><button type="button" class="media-down" ${localIndex === localMedia.length - 1 ? 'disabled' : ''}>↓ Move later</button></div></div>` : '';
            const artifactMeta = item.category === 'artifact' ? `<div class="artifact-card-meta"><span>${escapeHtml(artifactLabels[item.artifactType] || artifactLabels.memorabilia)}</span>${item.artifactNotes ? `<p>${escapeHtml(item.artifactNotes)}</p>` : ''}</div>` : '';
            return `<figure class="media-item${item.remote ? ' is-remote' : ''}${item.isCover ? ' is-cover' : ''}${item.useBackgroundRemoved && !originalPreviews.has(item.id) ? ' is-cutout' : ''}${mediaSelection.has(item.id) ? ' is-selected' : ''}" data-media-id="${item.id}">${canEdit ? `<button type="button" class="media-delete-corner" aria-label="${mediaSelection.has(item.id) ? 'Deselect media' : 'Select media for removal'}" title="${mediaSelection.has(item.id) ? 'Deselect media' : 'Select media for removal'}" aria-pressed="${mediaSelection.has(item.id)}">×</button>` : ''}${source}<figcaption>${escapeHtml(item.caption || item.filename || '')}</figcaption>${artifactMeta}${remoteState}${background}${detection}${menu}</figure>`;
          };
          const groups = artifactGroups(media.filter((item) => item.category === 'artifact'));
          const groupMarkup = (group) => {
            const hasFront = group.views.some((item) => (item.artifactView || 'front') === 'front');
            const hasBack = group.views.some((item) => item.artifactView === 'back');
            const viewLabel = (item, index) => item.artifactView === 'detail' ? (item.artifactViewLabel || `Detail ${index + 1}`) : (item.artifactView === 'back' ? 'Back' : 'Front');
            const viewCards = editable ? group.views.map((item, index) => `<div class="artifact-group-view"><span>${escapeHtml(viewLabel(item, index))}</span>${itemMarkup(item)}</div>`).join('') : itemMarkup(group.cover);
            const add = editable && gigId ? `<div class="artifact-add-views">${!hasFront ? `<label>Add front<input class="artifact-view-upload" type="file" accept="image/jpeg,image/png,image/gif,image/webp" data-artifact-group="${escapeHtml(group.id)}" data-artifact-view="front" /></label>` : ''}${!hasBack ? `<label>Add back<input class="artifact-view-upload" type="file" accept="image/jpeg,image/png,image/gif,image/webp" data-artifact-group="${escapeHtml(group.id)}" data-artifact-view="back" /></label>` : ''}<label>Add detail<input class="artifact-view-upload" type="file" accept="image/jpeg,image/png,image/gif,image/webp" data-artifact-group="${escapeHtml(group.id)}" data-artifact-view="detail" /></label></div>` : '';
            return `<section class="artifact-group-card" data-artifact-group="${escapeHtml(group.id)}"><header><div><span>${escapeHtml(artifactLabels[group.cover.artifactType] || artifactLabels.memorabilia)}</span><h3>${escapeHtml(group.cover.caption || group.cover.filename || 'Artifact')}</h3></div><button class="artifact-open-group" type="button">${group.views.length > 1 ? `View ${group.views.length} sides` : 'View artifact'}</button></header><div class="artifact-group-views">${viewCards}</div>${add}</section>`;
          };
          const renderedGroups = new Set();
          const content = media.map((item) => {
            if (item.category !== 'artifact') return itemMarkup(item);
            const groupId = item.artifactGroupId || item.id;
            if (renderedGroups.has(groupId)) return '';
            renderedGroups.add(groupId);
            const group = groups.find((entry) => entry.id === groupId);
            return group ? groupMarkup(group) : itemMarkup(item);
          }).join('');
          container.innerHTML = `${editable && selectedCount ? `<div class="media-bulk-actions"><span>${selectedCount} selected</span><button type="button" class="media-bulk-delete">Remove selected</button><button type="button" class="media-bulk-clear">Clear</button></div>` : ''}${content}`;
      container.querySelectorAll('.media-open').forEach((button) => button.addEventListener('click', () => {
        const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
        if (item) {
          const views = item.category === 'artifact' ? artifactGroups(media).find((group) => group.id === (item.artifactGroupId || item.id))?.views : null;
          openMediaLightbox(views ? { ...item, artifactViews: views } : item);
        }
      }));
      container.querySelectorAll('.artifact-open-group').forEach((button) => button.addEventListener('click', () => {
        const group = artifactGroups(media).find((entry) => entry.id === button.closest('.artifact-group-card').dataset.artifactGroup);
        if (group) openMediaLightbox({ ...group.cover, artifactViews: group.views });
      }));
      container.querySelectorAll('.artifact-view-upload').forEach((input) => input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file || !gigId) return;
        let label = '';
        if (input.dataset.artifactView === 'detail') label = prompt('Name this detail view', '') || '';
        input.disabled = true;
        const host = input.closest('label'); const original = host.firstChild?.textContent || 'Add view';
        try {
          if (host.firstChild) host.firstChild.textContent = 'Uploading…';
          const added = await uploadArtifactView(gigId, input.dataset.artifactGroup, input.dataset.artifactView, label, file);
          media.push(added); redraw();
        } catch (error) {
          input.disabled = false;
          if (host.firstChild) host.firstChild.textContent = error.message;
          setTimeout(() => { if (host.firstChild) host.firstChild.textContent = original; }, 3000);
        }
      }));
      container.querySelectorAll('.artifact-replace-photo input').forEach((input) => input.addEventListener('change', async () => {
        const file = input.files?.[0];
        const card = input.closest('.media-item');
        const current = media.find((entry) => entry.id === card?.dataset.mediaId);
        if (!file || !current || !gigId) return;
        const label = `replacement-${Date.now()}`;
        input.disabled = true;
        try {
          const added = await uploadArtifactView(gigId, current.artifactGroupId || current.id, 'detail', label, file);
          await fetchJson(`/api/media/${current.id}`, { method: 'DELETE' });
          const replacement = await fetchJson(`/api/media/${added.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            artifactView: current.artifactView || 'front', artifactViewLabel: current.artifactViewLabel || '', artifactIsCover: Boolean(current.artifactIsCover),
            artifactCropX: current.artifactCropX ?? 50, artifactCropY: current.artifactCropY ?? 50, artifactZoom: current.artifactZoom ?? 1
          }) });
          media.splice(media.indexOf(current), 1, replacement);
          redraw();
        } catch (error) {
          input.disabled = false;
          const labelNode = input.closest('label');
          if (labelNode?.firstChild) labelNode.firstChild.textContent = error.message;
        }
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
          const groupId = item.artifactGroupId || item.id;
          media.filter((entry) => entry.category === 'artifact' && (entry.artifactGroupId || entry.id) === groupId).forEach((entry) => { entry.caption = caption; });
          if (item.category !== 'artifact') item.caption = caption;
          redraw();
        }));
        container.querySelectorAll('.artifact-type-select').forEach((select) => select.addEventListener('change', async () => {
          const item = media.find((entry) => entry.id === select.closest('.media-item').dataset.mediaId);
          const updated = await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artifactType: select.value }) });
          const groupId = item.artifactGroupId || item.id;
          media.filter((entry) => (entry.artifactGroupId || entry.id) === groupId).forEach((entry) => { entry.artifactType = updated.artifactType; });
          Object.assign(item, updated); redraw();
        }));
        container.querySelectorAll('.artifact-notes').forEach((button) => button.addEventListener('click', async () => {
          const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
          const artifactNotes = prompt('Notes about this artifact', item.artifactNotes || '');
          if (artifactNotes === null) return;
          const updated = await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artifactNotes }) });
          const groupId = item.artifactGroupId || item.id;
          media.filter((entry) => (entry.artifactGroupId || entry.id) === groupId).forEach((entry) => { entry.artifactNotes = updated.artifactNotes; });
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
