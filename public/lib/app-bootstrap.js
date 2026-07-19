(function initAppBootstrap(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListAppBootstrap = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function appBootstrapFactory() {
  function showCountLabel(total) {
    const value = Number(total) || 0;
    return `${value} show${value === 1 ? '' : 's'}`;
  }

  function createBootstrap({
    window, page, fetchJson, runtime, authStateModule, authElements,
    showAuth, onAccount, onAuthenticated, onData, remoteShowCount,
    controllers, afterRun, countElement
  }) {
    async function updateCount(data) {
      const requirements = runtime.requirementsFor(page);
      if (requirements.includes('gigs')) {
        const remote = requirements.includes('sharedShows') ? Number(remoteShowCount?.() || 0) : 0;
        const total = (data.gigs || []).length + remote;
        countElement.textContent = showCountLabel(total);
        return total;
      }
      const stats = await fetchJson('/api/stats').catch(() => null);
      if (stats) countElement.textContent = showCountLabel(stats.shows);
      return stats?.shows ?? null;
    }

    async function initialize() {
      if (page === 'shared') {
        window.location.replace('/shows');
        return { redirected: true };
      }
      const auth = await fetchJson('/api/auth/status');
      const state = authStateModule.resolveAuthState(auth, page);
      onAccount(state.account);
      authStateModule.applyAuthState(state, authElements);
      if (state.redirectToLogin) {
        window.location.replace('/login');
        return { redirected: true, auth: state };
      }
      if (!state.authenticated) {
        showAuth(auth);
        return { authenticated: false, auth: state };
      }
      await onAuthenticated?.(state.account);
      const data = await runtime.loadPageData(page, { authenticated: true, fetchJson });
      await onData(data);
      await updateCount(data);
      await runtime.runController(page, controllers, { account: state.account, data });
      await afterRun?.({ account: state.account, data });
      return { authenticated: true, auth: state, data };
    }

    return { initialize, updateCount };
  }

  return { createBootstrap, showCountLabel };
}));
