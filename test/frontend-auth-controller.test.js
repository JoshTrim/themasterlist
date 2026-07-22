const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../public/lib/auth-controller');

function classList() { const values = new Set(); return { add: (name) => values.add(name), remove: (name) => values.delete(name), contains: (name) => values.has(name) }; }
function form(entries = []) { return { entries, hidden: false, elements: { name: { value: '' } }, resetCalled: false, reset() { this.resetCalled = true; }, addEventListener() {} }; }
class FormDataStub { constructor(formValue) { this.form = formValue; } entries() { return this.form.entries[Symbol.iterator](); } }
function fixture(search = '') {
  const elements = {
    panel: { hidden: true }, profileBar: { hidden: false }, setupForm: form(), loginForm: form(), registerForm: form(),
    message: { textContent: '', classList: classList() }, logoutButton: { addEventListener() {} },
    accountForm: form(), accountMessage: { textContent: '', classList: classList() }
  };
  const window = { location: { search, replaced: '', replace(value) { this.replaced = value; } } };
  return { elements, window };
}

describe('frontend authentication controller', () => {
  test('shows only owner setup or login states', () => {
    const view = fixture('');
    const controller = auth.createController({ window: view.window, fetchJson: async () => {}, FormDataClass: FormDataStub, elements: view.elements, onSignedIn() {}, onLoggedOut() {}, onAccountUpdated() {} });
    controller.show({ configured: false });
    assert.equal(view.elements.setupForm.hidden, false);
    assert.equal(view.elements.loginForm.hidden, true);
    assert.match(view.elements.message.textContent, /Create the owner account/);
    controller.show({ configured: true });
    assert.equal(view.elements.registerForm.hidden, true);
    assert.equal(view.elements.loginForm.hidden, false);
    assert.match(view.elements.message.textContent, /Sign in to your archive/);
  });

  test('submits owner credentials and redirects home', async () => {
    const view = fixture();
    const requests = [];
    let signedIn;
    view.elements.loginForm.entries = [['name', 'Archive Owner'], ['password', 'pass']];
    const controller = auth.createController({ window: view.window, FormDataClass: FormDataStub, elements: view.elements, onSignedIn: (account) => { signedIn = account; }, onLoggedOut() {}, onAccountUpdated() {}, fetchJson: async (url, options) => { requests.push([url, options]); return { id: 'owner', name: 'Archive Owner' }; } });
    await controller.submit(view.elements.loginForm, '/api/auth/login');
    assert.deepEqual(JSON.parse(requests[0][1].body), { name: 'Archive Owner', password: 'pass' });
    assert.equal(signedIn.id, 'owner');
    assert.equal(view.window.location.replaced, '/');
  });

  test('keeps the login page visible and reports authentication failures', async () => {
    const view = fixture();
    const controller = auth.createController({ window: view.window, FormDataClass: FormDataStub, elements: view.elements, onSignedIn() {}, onLoggedOut() {}, onAccountUpdated() {}, fetchJson: async () => { throw new Error('Incorrect password'); } });
    await controller.submit(view.elements.loginForm, '/api/auth/login');
    assert.equal(view.elements.message.textContent, 'Incorrect password');
    assert.equal(view.elements.message.classList.contains('error'), true);
    assert.equal(view.window.location.replaced, '');
  });

  test('logs out and returns to the configured sign-in state', async () => {
    const view = fixture();
    let loggedOut = false;
    const controller = auth.createController({ window: view.window, FormDataClass: FormDataStub, elements: view.elements, onSignedIn() {}, onLoggedOut: () => { loggedOut = true; }, onAccountUpdated() {}, fetchJson: async () => ({}) });
    await controller.logout();
    assert.equal(loggedOut, true);
    assert.equal(view.elements.loginForm.hidden, false);
    assert.match(view.elements.message.textContent, /Sign in/);
  });

  test('updates account details and clears password fields after success', async () => {
    const view = fixture();
    view.elements.accountForm.entries = [['name', 'Updated Owner'], ['currentPassword', 'old'], ['newPassword', 'new']];
    let updated;
    const controller = auth.createController({ window: view.window, FormDataClass: FormDataStub, elements: view.elements, onSignedIn() {}, onLoggedOut() {}, onAccountUpdated: (account) => { updated = account; }, fetchJson: async () => ({ id: 'owner', name: 'Updated Owner' }) });
    await controller.updateAccount();
    assert.equal(updated.name, 'Updated Owner');
    assert.equal(view.elements.accountForm.resetCalled, true);
    assert.equal(view.elements.accountForm.elements.name.value, 'Updated Owner');
    assert.equal(view.elements.accountMessage.textContent, 'Account updated.');
  });
});
