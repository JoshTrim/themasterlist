(function initNotificationCenter(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListNotificationCenter = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function notificationCenterFactory() {
  function badgeText(count) { return count > 99 ? '99+' : String(count); }

  function notificationHref(notification) {
    return notification.type === 'peer-sync-conflict'
      ? '/conflicts'
      : `/shows#shared-${encodeURIComponent(notification.sharedGigId || '')}`;
  }

  function notificationMarkup(notification, escapeHtml) {
    return `<article class="peer-notification" data-notification-id="${escapeHtml(notification.id)}"><a href="${notificationHref(notification)}"><strong>${escapeHtml(notification.title)}</strong><span>${escapeHtml(notification.body || '')}</span></a><button type="button" aria-label="Dismiss notification">×</button></article>`;
  }

  function createController({ fetchJson, escapeHtml, navigate, getAccount, elements }) {
    const { panel, activityCount, conflictCount } = elements;
    const list = panel.querySelector('.peer-notification-list');

    function updateActivityCount(count) {
      panel.hidden = !count;
      activityCount.hidden = !count;
      activityCount.textContent = badgeText(count);
    }

    function render(notifications) {
      updateActivityCount(notifications.length);
      list.innerHTML = notifications.map((notification) => notificationMarkup(notification, escapeHtml)).join('');
      list.querySelectorAll('.peer-notification').forEach((item) => {
        const markRead = () => fetchJson(`/api/notifications/${encodeURIComponent(item.dataset.notificationId)}`, { method: 'PATCH' }).catch(() => {});
        item.querySelector('a').addEventListener('click', async (event) => {
          event.preventDefault();
          await markRead();
          navigate(event.currentTarget.href);
        });
        item.querySelector('button').addEventListener('click', async () => {
          await markRead();
          item.remove();
          updateActivityCount(list.children.length);
        });
      });
    }

    async function load() {
      if (!getAccount()) return [];
      try {
        const notifications = await fetchJson('/api/notifications');
        render(notifications);
        return notifications;
      } catch { return []; }
    }

    async function loadConflicts() {
      if (!getAccount()?.isAdmin || !conflictCount) return 0;
      try {
        const conflicts = await fetchJson('/api/sync/conflicts');
        conflictCount.hidden = !conflicts.length;
        conflictCount.textContent = badgeText(conflicts.length);
        return conflicts.length;
      } catch { return 0; }
    }

    return { render, load, loadConflicts };
  }

  return { badgeText, notificationHref, notificationMarkup, createController };
}));
