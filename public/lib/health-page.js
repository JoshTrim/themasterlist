(function exposeHealthPage(root, factory) {
  const healthPage = factory();
  if (typeof module === 'object' && module.exports) module.exports = healthPage;
  else root.MasterListHealthPage = healthPage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createHealthPageModule() {
  const typeLabels = { setlist: 'Setlists', albums: 'Albums', artist: 'Artists', venue: 'Venues', location: 'Map' };

  function manualForm(issue, escapeHtml) {
    if (issue.type === 'location') return '<form class="health-manual-form" hidden><div class="health-manual-grid"><label class="health-manual-wide">Venue address<input name="address" placeholder="Street, suburb, city, country" /></label><p class="health-coordinate-divider">Or enter exact coordinates</p><label>Latitude<input name="lat" type="number" min="-90" max="90" step="any" placeholder="-27.4698" /></label><label>Longitude<input name="lng" type="number" min="-180" max="180" step="any" placeholder="153.0251" /></label></div><button class="button" type="submit">Save location</button><button class="button button-secondary health-manual-cancel" type="button">Cancel</button></form>';
    if (!['artist', 'venue'].includes(issue.type)) return '';
    return `<form class="health-manual-form" hidden><div class="health-manual-grid"><label>Display name<input name="title" value="${escapeHtml(issue.title)}" required /></label><label>Short description<input name="description" placeholder="Optional short description" /></label><label class="health-manual-wide">Biography<textarea name="bio" rows="4" placeholder="Enter the information you want displayed"></textarea></label><label>Photo URL<input name="image" type="url" placeholder="https://…" /></label><label>Source URL<input name="source" type="url" placeholder="https://…" /></label></div><button class="button" type="submit">Save manual entry</button><button class="button button-secondary health-manual-cancel" type="button">Cancel</button></form>`;
  }

  function showLevelIssueCount(data) {
    return new Set(data.issues.filter((issue) => issue.href?.startsWith('/show') || issue.href?.startsWith('/edit')).map((issue) => issue.href)).size;
  }

  function summaryMarkup(data) {
    const repairable = data.issues.filter((issue) => issue.repairable).length;
    const soundShows = Math.max(0, data.totalShows - showLevelIssueCount(data));
    return `<article><strong>${data.totalShows}</strong><span>Shows scanned</span></article><article><strong>${data.issues.length}</strong><span>Issues found</span></article><article><strong>${repairable}</strong><span>Can auto-repair</span></article><article class="${data.healthy ? 'is-healthy' : ''}"><strong>${data.healthy ? '✓' : soundShows}</strong><span>${data.healthy ? 'Archive healthy' : 'Shows without show-level issues'}</span></article>`;
  }

  function availableTypes(data) {
    return ['all', ...Object.keys(typeLabels).filter((type) => data.counts[type])];
  }

  function visibleIssues(data, filter = 'all') {
    return data.issues.filter((issue) => filter === 'all' || issue.type === filter);
  }

  function issueMarkup(issue, escapeHtml) {
    const action = ['setlist', 'albums'].includes(issue.type) ? 'Edit manually' : 'Open';
    const repair = issue.repairable ? '<button class="button health-repair" type="button">Repair</button>' : '';
    const manual = ['artist', 'venue', 'location'].includes(issue.type) ? '<button class="button button-secondary health-manual-toggle" type="button">Enter manually</button>' : '';
    return `<article class="health-item" data-health-issue="${escapeHtml(issue.id)}"><div class="health-item-copy"><span class="health-type">${escapeHtml(typeLabels[issue.type] || issue.type)}</span><h2>${escapeHtml(issue.title)}</h2><p>${escapeHtml(issue.detail)}</p></div><div class="health-actions"><a class="button button-secondary" href="${escapeHtml(issue.href)}">${action}</a>${repair}${manual}</div>${manualForm(issue, escapeHtml)}</article>`;
  }

  function completionMessage(latest, albumOnly) {
    const remainingAlbums = latest.issues.filter((issue) => issue.type === 'albums').length;
    if (albumOnly) return remainingAlbums
      ? `Album search complete. ${remainingAlbums} set${remainingAlbums === 1 ? '' : 's'} still need manual album information.`
      : 'Album search complete. All setlist tracks have album information.';
    return latest.issues.length ? 'Metadata repair pass complete. Some records may still need manual attention.' : 'Metadata repair complete. The archive is healthy.';
  }

  function createController({ page, fetchJson, escapeHtml, FormDataClass = globalThis.FormData, elements }) {
    const { summary, filters, list, message, repairAll, repairAlbums } = elements;
    let snapshot = null;
    let filter = 'all';

    async function repairOne(issue, button) {
      button.disabled = true;
      button.textContent = 'Repairing…';
      message.textContent = `Repairing ${issue.title}…`;
      try {
        renderSnapshot(await fetchJson('/api/health/repair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(issue) }));
        message.textContent = `${issue.title} checked.`;
        message.classList.remove('error');
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Retry';
        message.textContent = error.message;
        message.classList.add('error');
      }
    }

    async function saveManual(issue, form) {
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Saving…';
      message.classList.remove('error');
      message.textContent = `Saving ${issue.title}…`;
      try {
        const manual = Object.fromEntries(new FormDataClass(form).entries());
        renderSnapshot(await fetchJson('/api/health/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...issue, ...manual }) }));
        message.textContent = `${issue.title} saved.`;
      } catch (error) {
        submit.disabled = false;
        submit.textContent = 'Retry save';
        message.textContent = error.message;
        message.classList.add('error');
      }
    }

    function bindSnapshotActions(visible) {
      list.querySelectorAll('.health-repair').forEach((button) => {
        const issue = visible.find((entry) => entry.id === button.closest('.health-item').dataset.healthIssue);
        button.addEventListener('click', () => repairOne(issue, button));
      });
      list.querySelectorAll('.health-manual-toggle').forEach((button) => button.addEventListener('click', () => {
        const form = button.closest('.health-item').querySelector('.health-manual-form');
        form.hidden = !form.hidden;
        button.textContent = form.hidden ? 'Enter manually' : 'Close manual entry';
        if (!form.hidden) form.querySelector('input, textarea')?.focus();
      }));
      list.querySelectorAll('.health-manual-cancel').forEach((button) => button.addEventListener('click', () => {
        const card = button.closest('.health-item');
        card.querySelector('.health-manual-form').hidden = true;
        card.querySelector('.health-manual-toggle').textContent = 'Enter manually';
      }));
      list.querySelectorAll('.health-manual-form').forEach((form) => form.addEventListener('submit', (event) => {
        event.preventDefault();
        const issue = visible.find((entry) => entry.id === form.closest('.health-item').dataset.healthIssue);
        saveManual(issue, form);
      }));
    }

    function renderSnapshot(data) {
      if (!summary || !list) return;
      snapshot = data;
      const repairable = data.issues.filter((issue) => issue.repairable).length;
      summary.innerHTML = summaryMarkup(data);
      filters.innerHTML = availableTypes(data).map((type) => `<button type="button" class="${type === filter ? 'active' : ''}" data-health-filter="${type}">${type === 'all' ? 'All' : typeLabels[type]} <span>${type === 'all' ? data.issues.length : data.counts[type]}</span></button>`).join('');
      filters.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { filter = button.dataset.healthFilter; renderSnapshot(snapshot); }));
      const visible = visibleIssues(data, filter);
      list.innerHTML = visible.length ? visible.map((issue) => issueMarkup(issue, escapeHtml)).join('') : `<div class="empty-state">${data.healthy ? 'Everything is in good shape.' : 'No issues match this filter.'}</div>`;
      bindSnapshotActions(visible);
      repairAll.disabled = !repairable;
      repairAlbums.disabled = !data.issues.some((issue) => issue.type === 'albums' && issue.repairable);
    }

    async function render() {
      if (page !== 'health' || !list) return;
      try { renderSnapshot(await fetchJson('/api/health')); message.classList.remove('error'); }
      catch (error) { message.textContent = error.message; message.classList.add('error'); }
    }

    async function repairMany(issues, button, idleLabel, albumOnly = false) {
      if (!issues.length) return;
      repairAll.disabled = true;
      repairAlbums.disabled = true;
      message.classList.remove('error');
      let latest = snapshot;
      for (const [index, issue] of issues.entries()) {
        button.textContent = `${index + 1} / ${issues.length}`;
        message.textContent = `Repairing ${issue.title}…`;
        try { latest = await fetchJson('/api/health/repair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(issue) }); }
        catch (error) { message.textContent = `${issue.title}: ${error.message}`; message.classList.add('error'); }
      }
      renderSnapshot(latest);
      button.textContent = idleLabel;
      message.textContent = completionMessage(latest, albumOnly);
    }

    function bind() {
      repairAlbums?.addEventListener('click', () => repairMany((snapshot?.issues || []).filter((issue) => issue.type === 'albums' && issue.repairable), repairAlbums, 'Find missing albums', true));
      repairAll?.addEventListener('click', () => repairMany((snapshot?.issues || []).filter((issue) => issue.repairable), repairAll, 'Repair all available'));
    }

    return { render, renderSnapshot, repairOne, saveManual, repairMany, bind, getSnapshot: () => snapshot, getFilter: () => filter };
  }

  return { typeLabels, manualForm, showLevelIssueCount, summaryMarkup, availableTypes, visibleIssues, issueMarkup, completionMessage, createController };
}));
