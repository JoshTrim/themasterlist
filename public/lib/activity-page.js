(function exposeActivityPage(root, factory) {
  const activityPage = factory();
  if (typeof module === 'object' && module.exports) module.exports = activityPage;
  else root.MasterListActivityPage = activityPage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createActivityPageModule() {
  function visibleEntries(entries = [], filter = 'all') {
    return entries.filter((entry) => filter === 'all' || entry.unread);
  }

  function entryLabel(entry) {
    if (entry.type === 'peer-sync-conflict') return 'Conflict needs review';
    if (entry.type === 'peer-show-updated') return 'Show updated';
    return 'New shared show';
  }

  function entryHref(entry) {
    return entry.type === 'peer-sync-conflict' ? '/conflicts' : `/shows#shared-${encodeURIComponent(entry.sharedGigId || '')}`;
  }

  function entryMarkup(entry, escapeHtml) {
    const action = entry.type === 'peer-sync-conflict' ? 'Review conflict' : 'Open show';
    return `<article class="activity-entry ${entry.unread ? 'is-unread' : ''}" data-activity-id="${escapeHtml(entry.id)}"><i aria-hidden="true"></i><div><span>${entryLabel(entry)} · ${escapeHtml(new Date(entry.createdAt).toLocaleString())}</span><h2>${escapeHtml(entry.title)}</h2><p>${escapeHtml(entry.body || '')}</p></div><div class="activity-entry-actions"><a class="button button-secondary" href="${entryHref(entry)}">${action}</a>${entry.unread ? '<button class="text-button activity-read" type="button">Mark read</button>' : '<small>Read</small>'}</div></article>`;
  }

  function createController({ page, fetchJson, escapeHtml, refreshNotifications, navigate, now = () => new Date(), elements }) {
    const { list, filters, message, markAll } = elements;
    let entries = [];
    let filter = 'all';

    async function markRead(entry) {
      if (!entry?.unread) return;
      await fetchJson(`/api/notifications/${encodeURIComponent(entry.id)}`, { method: 'PATCH' });
      entry.unread = false;
      entry.readAt = now().toISOString();
    }

    function renderList() {
      if (!list) return;
      const visible = visibleEntries(entries, filter);
      filters.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.activityFilter === filter));
      list.innerHTML = visible.length ? visible.map((entry) => entryMarkup(entry, escapeHtml)).join('') : '<div class="empty-state">No peer activity matches this filter.</div>';
      list.querySelectorAll('.activity-entry').forEach((item) => {
        const entry = entries.find((candidate) => candidate.id === item.dataset.activityId);
        item.querySelector('.activity-read')?.addEventListener('click', async () => { await markRead(entry); renderList(); await refreshNotifications(); });
        item.querySelector('a')?.addEventListener('click', async (event) => { event.preventDefault(); await markRead(entry); navigate(event.currentTarget.href); });
      });
      markAll.disabled = !entries.some((entry) => entry.unread);
    }

    async function render() {
      if (page !== 'activity' || !list) return;
      try {
        entries = await fetchJson('/api/notifications?scope=all');
        message.classList.remove('error');
        renderList();
      } catch (error) {
        message.textContent = error.message;
        message.classList.add('error');
      }
    }

    async function markAllRead() {
      markAll.disabled = true;
      try {
        await fetchJson('/api/notifications/read-all', { method: 'POST' });
        entries.forEach((entry) => { entry.unread = false; entry.readAt ||= now().toISOString(); });
        renderList();
        await refreshNotifications();
        message.textContent = 'All activity marked as read.';
        message.classList.remove('error');
      } catch (error) {
        message.textContent = error.message;
        message.classList.add('error');
      }
    }

    function bind() {
      filters?.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { filter = button.dataset.activityFilter; renderList(); }));
      markAll?.addEventListener('click', markAllRead);
    }

    return { render, renderList, markAllRead, markRead, bind, getEntries: () => entries, getFilter: () => filter };
  }

  return { visibleEntries, entryLabel, entryHref, entryMarkup, createController };
}));
