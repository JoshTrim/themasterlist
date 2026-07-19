(function initPeerSyncPoller(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListPeerSyncPoller = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function peerSyncPollerFactory() {
  function createPoller({
    fetchJson, getAccount, loadNotifications, loadConflicts, onArchive,
    setTimeoutFn = globalThis.setTimeout, clearTimeoutFn = globalThis.clearTimeout,
    intervalMs = 30_000
  }) {
    let running = false;
    let timer = null;

    function schedule(delay = intervalMs) {
      clearTimeoutFn(timer);
      timer = setTimeoutFn(poll, delay);
      return timer;
    }

    async function poll() {
      if (!getAccount() || running) return false;
      running = true;
      try {
        const result = await fetchJson('/api/peers/sync-all', { method: 'POST' });
        const notifications = await loadNotifications();
        await loadConflicts();
        if (result.applied > 0 || notifications.length) {
          const [gigs, sharedShows] = await Promise.all([fetchJson('/api/gigs'), fetchJson('/api/shared/shows')]);
          await onArchive({ gigs, sharedShows });
        }
        return true;
      } catch {
        return false;
      } finally {
        running = false;
        schedule();
      }
    }

    function stop() {
      clearTimeoutFn(timer);
      timer = null;
    }

    return { poll, start: schedule, stop, isRunning: () => running, getTimer: () => timer };
  }

  return { createPoller };
}));
