(function exposeAuthController(root, factory) {
  const authController = factory();
  if (typeof module === 'object' && module.exports) module.exports = authController;
  else root.MasterListAuthController = authController;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAuthControllerModule() {
  function createController({ window, fetchJson, FormDataClass = globalThis.FormData, elements, onSignedIn, onLoggedOut, onAccountUpdated }) {
    const {
      panel, profileBar, setupForm, loginForm, registerForm, message, logoutButton,
      recoveryPanel, recoveryForm, recoveryMessage, accountForm, accountMessage,
      passwordForm, passwordMessage, logoutAllButton, logoutAllMessage
    } = elements;

    function show(status) {
      panel.hidden = false;
      profileBar.hidden = true;
      setupForm.hidden = Boolean(status.configured);
      loginForm.hidden = !status.configured;
      if (recoveryPanel) recoveryPanel.hidden = !status.configured || !status.recoveryAvailable;
      const setupTokenField = setupForm.querySelector?.('#setup-token-field');
      if (setupTokenField) {
        setupTokenField.hidden = !status.setupTokenRequired;
        setupTokenField.querySelector('input').required = Boolean(status.setupTokenRequired);
      }
      if (registerForm) registerForm.hidden = true;
      const imported = status.lastInstanceImport?.summary;
      message.textContent = imported
        ? `Import applied: ${imported.gigs || 0} shows and ${imported.media || 0} media items. Sign in with the source instance account.`
        : status.configured ? 'Sign in to your archive.' : 'Create the owner account for this instance.';
    }

    async function submit(form, endpoint, extra = {}) {
      try {
        const payload = { ...Object.fromEntries(new FormDataClass(form).entries()), ...extra };
        const account = await fetchJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        message.classList.remove('error');
        onSignedIn(account);
        window.location.replace('/');
      } catch (error) { message.textContent = error.message; message.classList.add('error'); }
    }

    async function logout() {
      await fetchJson('/api/auth/logout', { method: 'POST' });
      onLoggedOut();
      window.location.replace('/login');
    }

    async function updateAccount() {
      const body = Object.fromEntries(new FormDataClass(accountForm).entries());
      accountMessage.textContent = 'Updating…';
      accountMessage.classList.remove('error');
      try {
        const account = await fetchJson('/api/auth/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        onAccountUpdated(account);
        accountMessage.textContent = 'Display name updated.';
        accountForm.reset();
        accountForm.elements.name.value = account.name;
      } catch (error) { accountMessage.textContent = error.message; accountMessage.classList.add('error'); }
    }

    async function updatePassword() {
      const body = Object.fromEntries(new FormDataClass(passwordForm).entries());
      passwordMessage.classList.remove('error');
      if (body.newPassword !== body.confirmPassword) {
        passwordMessage.textContent = 'The new passwords do not match.';
        passwordMessage.classList.add('error');
        return;
      }
      passwordMessage.textContent = 'Changing password…';
      try {
        const account = await fetchJson('/api/auth/account', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: body.currentPassword, newPassword: body.newPassword })
        });
        onAccountUpdated(account);
        passwordForm.reset();
        passwordMessage.textContent = 'Password changed. Other sessions were signed out.';
      } catch (error) { passwordMessage.textContent = error.message; passwordMessage.classList.add('error'); }
    }

    async function recoverAccount() {
      const body = Object.fromEntries(new FormDataClass(recoveryForm).entries());
      recoveryMessage.classList.remove('error');
      if (body.newPassword !== body.confirmPassword) {
        recoveryMessage.textContent = 'The new passwords do not match.';
        recoveryMessage.classList.add('error');
        return;
      }
      recoveryMessage.textContent = 'Resetting owner password…';
      try {
        const account = await fetchJson('/api/auth/recover', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setupToken: body.setupToken, newPassword: body.newPassword })
        });
        onSignedIn(account);
        window.location.replace('/');
      } catch (error) { recoveryMessage.textContent = error.message; recoveryMessage.classList.add('error'); }
    }

    async function logoutAll() {
      if (!window.confirm('Sign out every active session, including this browser?')) return;
      logoutAllMessage.textContent = 'Signing out all sessions…';
      logoutAllMessage.classList.remove('error');
      try {
        await fetchJson('/api/auth/logout-all', { method: 'POST' });
        onLoggedOut();
        window.location.replace('/login');
      } catch (error) { logoutAllMessage.textContent = error.message; logoutAllMessage.classList.add('error'); }
    }

    function bind() {
      setupForm.addEventListener('submit', (event) => { event.preventDefault(); submit(setupForm, '/api/auth/setup'); });
      loginForm.addEventListener('submit', (event) => { event.preventDefault(); submit(loginForm, '/api/auth/login'); });
      logoutButton.addEventListener('click', logout);
      accountForm?.addEventListener('submit', (event) => { event.preventDefault(); updateAccount(); });
      passwordForm?.addEventListener('submit', (event) => { event.preventDefault(); updatePassword(); });
      recoveryForm?.addEventListener('submit', (event) => { event.preventDefault(); recoverAccount(); });
      logoutAllButton?.addEventListener('click', logoutAll);
    }

    return { show, submit, logout, updateAccount, updatePassword, recoverAccount, logoutAll, bind };
  }

  return { createController };
}));
