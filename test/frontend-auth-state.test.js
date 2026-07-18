const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAuthState, applyAuthState } = require('../public/lib/auth-state');

describe('frontend authentication state', () => {
  test('sends unauthenticated home visitors to login', () => {
    assert.deepEqual(resolveAuthState({ configured: true, account: null }, 'home'), {
      account: null,
      authenticated: false,
      redirectToLogin: true,
      showAuthPanel: false,
      showProfileBar: false,
      showAdminActions: false
    });
  });

  test('applies signed-in visibility and account name', () => {
    const state = resolveAuthState({ account: { id: 'owner', name: 'Archive Owner', isAdmin: true } }, 'shows');
    const elements = { navSignIn: {}, authPanel: {}, profileBar: {}, inviteButton: {}, accountName: {} };
    applyAuthState(state, elements);
    assert.equal(elements.navSignIn.hidden, true);
    assert.equal(elements.authPanel.hidden, true);
    assert.equal(elements.profileBar.hidden, false);
    assert.equal(elements.inviteButton.hidden, false);
    assert.equal(elements.accountName.value, 'Archive Owner');
  });
});
