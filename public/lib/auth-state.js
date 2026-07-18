(function exposeAuthState(root, factory) {
  const authState = factory();
  if (typeof module === 'object' && module.exports) module.exports = authState;
  else root.MasterListAuthState = authState;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAuthStateModule() {
  function resolveAuthState(status, page) {
    const account = status?.account || null;
    return {
      account,
      authenticated: Boolean(account),
      redirectToLogin: !account && page === 'home',
      showAuthPanel: !account && page !== 'home',
      showProfileBar: Boolean(account),
      showAdminActions: Boolean(account?.isAdmin)
    };
  }

  function applyAuthState(state, elements) {
    if (elements.navSignIn) elements.navSignIn.hidden = state.authenticated;
    if (elements.authPanel) elements.authPanel.hidden = !state.showAuthPanel;
    if (elements.profileBar) elements.profileBar.hidden = !state.showProfileBar;
    if (elements.inviteButton) elements.inviteButton.hidden = !state.showAdminActions;
    if (elements.accountName && state.account) elements.accountName.value = state.account.name;
  }

  return { resolveAuthState, applyAuthState };
}));
