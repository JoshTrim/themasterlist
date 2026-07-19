(function exposeConflictsPage(root, factory) {
  const conflictsPage = factory();
  if (typeof module === 'object' && module.exports) module.exports = conflictsPage;
  else root.MasterListConflictsPage = conflictsPage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createConflictsPageModule() {
  function valueSummary(kind, value, escapeHtml) {
    if (kind === 'notes') return `<p>${escapeHtml(value.notes || 'No performance notes')}</p>${value.venueNotes ? `<p><b>Venue:</b> ${escapeHtml(value.venueNotes)}</p>` : ''}`;
    if (kind === 'ratings') return `<p>${value.performanceRating ?? '—'} / 5 · ${value.favorite ? '♥ Favourite' : 'Not favourite'}</p>`;
    if (kind === 'setlist') return value.songs?.length ? `<ol>${value.songs.map((song) => `<li>${escapeHtml(song.title || 'Untitled')}</li>`).join('')}</ol>` : '<p>No setlist</p>';
    const assignedMedia = (value.media || []).filter((item) => item.songIndex !== null && item.songIndex !== undefined);
    const assignments = assignedMedia.map((item) => `<li>${escapeHtml(item.caption || item.filename || 'Media')} → ${escapeHtml(value.songs?.[item.songIndex]?.title || `Track ${Number(item.songIndex) + 1}`)}</li>`).join('');
    return `<p>${value.media?.length || 0} media item${value.media?.length === 1 ? '' : 's'} · ${assignedMedia.length} assigned to tracks</p>${assignments ? `<ol>${assignments}</ol>` : ''}`;
  }

  function choiceMarkup(name, mergeLabel, escapeHtml) {
    return `<label class="conflict-choice">Resolution<select name="${name}"><option value="local">Keep local</option><option value="remote">Use peer</option><option value="merge">${escapeHtml(mergeLabel)}</option></select></label>`;
  }

  function conflictMarkup(conflict, { escapeHtml, formatGigDate }) {
    const fields = [
      ['notes', 'Notes', 'Combine notes'],
      ['ratings', 'Rating & favourite', 'Average / combine'],
      ['setlist', 'Setlist', 'Combine unique tracks'],
      ['media', 'Media assignments', 'Fill unassigned media']
    ];
    return `<form class="conflict-card" data-conflict-id="${escapeHtml(conflict.id)}"><header><div><p class="eyebrow">Edited here and by ${escapeHtml(conflict.peerName)}</p><h2>${escapeHtml(conflict.artist)}</h2><p>${escapeHtml(conflict.venue)} · ${escapeHtml(conflict.city)} · ${escapeHtml(formatGigDate(conflict.date))}</p></div><a class="text-button" href="/edit?id=${encodeURIComponent(conflict.localGigId)}">Open show</a></header>${fields.map(([kind, label, mergeLabel]) => `<section class="conflict-field"><div class="conflict-field-heading"><h3>${label}</h3>${choiceMarkup(kind, mergeLabel, escapeHtml)}</div><div class="conflict-comparison"><article><strong>This instance</strong>${valueSummary(kind, conflict.local, escapeHtml)}</article><article><strong>${escapeHtml(conflict.peerName)}</strong>${valueSummary(kind, conflict.remote, escapeHtml)}</article></div></section>`).join('')}<footer><button class="button" type="submit">Resolve conflict</button><p class="form-message" role="status"></p></footer></form>`;
  }

  function createController({ page, getAccount, fetchJson, escapeHtml, formatGigDate, refreshNotifications, FormDataClass = globalThis.FormData, elements }) {
    const { list, message, navCount } = elements;

    async function resolve(form) {
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('.form-message');
      button.disabled = true;
      status.textContent = 'Applying resolution…';
      status.classList.remove('error');
      try {
        const choices = Object.fromEntries(new FormDataClass(form).entries());
        await fetchJson(`/api/sync/conflicts/${encodeURIComponent(form.dataset.conflictId)}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(choices) });
        status.textContent = 'Resolved.';
        await Promise.all([render(), refreshNotifications()]);
      } catch (error) {
        status.textContent = error.message;
        status.classList.add('error');
        button.disabled = false;
      }
    }

    async function render() {
      if (!getAccount()?.isAdmin) {
        if (list) list.innerHTML = '<div class="empty-state">Only the instance owner can review sync conflicts.</div>';
        return;
      }
      let conflicts;
      try { conflicts = await fetchJson('/api/sync/conflicts'); }
      catch (error) {
        if (message) { message.textContent = error.message; message.classList.add('error'); }
        return;
      }
      if (navCount) { navCount.hidden = !conflicts.length; navCount.textContent = String(conflicts.length); }
      if (page !== 'conflicts' || !list) return;
      message?.classList.remove('error');
      list.innerHTML = conflicts.length
        ? conflicts.map((conflict) => conflictMarkup(conflict, { escapeHtml, formatGigDate })).join('')
        : '<div class="empty-state">No simultaneous edits need review.</div>';
      list.querySelectorAll('.conflict-card').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); resolve(form); }));
    }

    return { render, resolve };
  }

  return { valueSummary, choiceMarkup, conflictMarkup, createController };
}));
