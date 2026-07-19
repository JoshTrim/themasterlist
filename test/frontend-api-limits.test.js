const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const limits = require('../public/lib/api-limits-page');

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function classList() {
  const names = new Set();
  return { add: (name) => names.add(name), remove: (name) => names.delete(name), contains: (name) => names.has(name) };
}

describe('API limits page', () => {
  test('formats missing, invalid and real request times safely', () => {
    assert.equal(limits.formatApiTime(''), 'No requests today');
    assert.equal(limits.formatApiTime('not-a-date'), 'not-a-date');
    assert.notEqual(limits.formatApiTime('2026-07-19T00:00:00Z'), '2026-07-19T00:00:00Z');
  });

  test('caps quota bars and escapes provider content', () => {
    const markup = limits.providerMarkup({ configured: true, name: '<YouTube>', reset: 'Daily', units: 120, limit: 100, unit: 'units', remaining: 0, errors: 0, requests: 2, note: '<note>', lastRequest: '' }, escapeHtml);
    assert.match(markup, /width:100%/);
    assert.match(markup, /&lt;YouTube&gt;/);
    assert.match(markup, /&lt;note&gt;/);
  });

  test('renders provider cards and only operations with requests', async () => {
    const elements = { grid: { innerHTML: '' }, note: { textContent: '', classList: classList() }, detail: { innerHTML: '' } };
    const data = {
      day: '2026-07-19',
      providers: [{ configured: false, name: 'YouTube', reset: 'Daily', units: 0, limit: null, unit: 'calls', remaining: 0, errors: 0, requests: 3, note: 'Tracked locally', lastRequest: '' }],
      operations: [{ provider: 'YouTube', operation: 'search', units: 300, requests: 3 }, { provider: 'Spotify', operation: 'auth', units: 0, requests: 0 }],
      recent: [{ provider: 'YouTube', operation: 'search', units: 100, requestedAt: '', status: 200 }]
    };
    const controller = limits.createController({ page: 'api-limits', fetchJson: async () => data, getAccount: () => ({}), escapeHtml, elements });
    await controller.render();
    assert.match(elements.grid.innerHTML, /YouTube/);
    assert.doesNotMatch(elements.grid.innerHTML, /api-limit-bar/);
    assert.match(elements.detail.innerHTML, /search/);
    assert.doesNotMatch(elements.detail.innerHTML, /Spotify/);
    assert.match(elements.note.textContent, /2026-07-19/);
  });

  test('uses a sign-in prompt for unauthenticated failures and clears stale output', async () => {
    const elements = { grid: { innerHTML: 'stale' }, note: { textContent: '', classList: classList() }, detail: { innerHTML: 'stale' } };
    const controller = limits.createController({ page: 'api-limits', fetchJson: async () => { throw new Error('Forbidden'); }, getAccount: () => null, escapeHtml, elements });
    await controller.render();
    assert.equal(elements.note.textContent, 'Sign in to view tracked API usage.');
    assert.equal(elements.grid.innerHTML, '');
    assert.equal(elements.detail.innerHTML, '');
    assert.equal(elements.note.classList.contains('error'), true);
  });
});
