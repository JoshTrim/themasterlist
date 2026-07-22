(function exposeAuthController(root, factory) {
  const authController = factory();
  if (typeof module === 'object' && module.exports) module.exports = authController;
  else root.MasterListAuthController = authController;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAuthControllerModule() {
  function createController({ window, fetchJson, FormDataClass = globalThis.FormData, elements, onSignedIn, onLoggedOut, onAccountUpdated }) {
    const { panel, profileBar, setupForm, loginForm, registerForm, message, logoutButton, accountForm, accountMessage } = elements;

    function show(status) {
      panel.hidden = false;
      profileBar.hidden = true;
      setupForm.hidden = Boolean(status.configured);
      loginForm.hidden = !status.configured;
      const setupTokenField = setupForm.querySelector?.('#setup-token-field');
      if (setupTokenField) {
        setupTokenField.hidden = !status.setupTokenRequired;
        setupTokenField.querySelector('input').required = Boolean(status.setupTokenRequired);
      }
      if (registerForm) registerForm.hidden = true;
      message.textContent = status.configured ? 'Sign in to your archive.' : 'Create the owner account for this instance.';
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
      show({ configured: true });
    }

    async function updateAccount() {
      const body = Object.fromEntries(new FormDataClass(accountForm).entries());
      accountMessage.textContent = 'Updating…';
      accountMessage.classList.remove('error');
      try {
        const account = await fetchJson('/api/auth/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        onAccountUpdated(account);
        accountMessage.textContent = 'Account updated.';
        accountForm.reset();
        accountForm.elements.name.value = account.name;
      } catch (error) { accountMessage.textContent = error.message; accountMessage.classList.add('error'); }
    }

    function bind() {
      setupForm.addEventListener('submit', (event) => { event.preventDefault(); submit(setupForm, '/api/auth/setup'); });
      loginForm.addEventListener('submit', (event) => { event.preventDefault(); submit(loginForm, '/api/auth/login'); });
      logoutButton.addEventListener('click', logout);
      accountForm?.addEventListener('submit', (event) => { event.preventDefault(); updateAccount(); });
    }

    return { show, submit, logout, updateAccount, bind };
  }

  return { createController };
}));
