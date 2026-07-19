const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const conflictsPage = require('../public/lib/conflicts-page');

const escapeHtml = (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const formatGigDate = (value) => value;

function classList() {
  const names = new Set();
  return { add: (name) => names.add(name), remove: (name) => names.delete(name), contains: (name) => names.has(name) };
}

function elementsFixture() {
  return {
    list: { innerHTML: '', querySelectorAll: () => [] },
    message: { textContent: '', classList: classList() },
    navCount: { hidden: true, textContent: '' }
  };
}

const conflict = {
  id: 'conflict 1', peerName: '<Peer>', artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-07-19', localGigId: 'gig 1',
  local: { notes: 'Local', performanceRating: 5, favorite: true, songs: [{ title: 'Track One' }], media: [{ filename: 'clip.mp4', songIndex: 0 }] },
  remote: { notes: 'Remote', performanceRating: 4, favorite: false, songs: [], media: [] }
};

describe('peer conflicts page', () => {
  test('summarizes notes, ratings, setlists and media assignments', () => {
    assert.match(conflictsPage.valueSummary('notes', conflict.local, escapeHtml), /Local/);
    assert.match(conflictsPage.valueSummary('ratings', conflict.local, escapeHtml), /Favourite/);
    assert.match(conflictsPage.valueSummary('setlist', conflict.local, escapeHtml), /Track One/);
    assert.match(conflictsPage.valueSummary('media', conflict.local, escapeHtml), /clip.mp4 → Track One/);
  });

  test('renders all merge choices and escapes peer data', () => {
    const markup = conflictsPage.conflictMarkup(conflict, { escapeHtml, formatGigDate });
    assert.match(markup, /&lt;Peer&gt;/);
    assert.match(markup, /name="notes"/);
    assert.match(markup, /name="ratings"/);
    assert.match(markup, /name="setlist"/);
    assert.match(markup, /name="media"/);
    assert.match(markup, /id=gig%201/);
  });

  test('blocks conflict details for non-owner accounts', async () => {
    const elements = elementsFixture();
    const controller = conflictsPage.createController({ page: 'conflicts', getAccount: () => ({ isAdmin: false }), fetchJson: async () => { throw new Error('should not fetch'); }, escapeHtml, formatGigDate, refreshNotifications: async () => {}, elements });
    await controller.render();
    assert.match(elements.list.innerHTML, /Only the instance owner/);
  });

  test('renders owner conflicts and updates the navigation count', async () => {
    const elements = elementsFixture();
    const controller = conflictsPage.createController({ page: 'conflicts', getAccount: () => ({ isAdmin: true }), fetchJson: async () => [conflict], escapeHtml, formatGigDate, refreshNotifications: async () => {}, elements });
    await controller.render();
    assert.match(elements.list.innerHTML, /Poppy/);
    assert.equal(elements.navCount.hidden, false);
    assert.equal(elements.navCount.textContent, '1');
  });

  test('posts explicit merge choices and refreshes conflicts', async () => {
    const elements = elementsFixture();
    const requests = [];
    let refreshed = 0;
    class FormDataStub { entries() { return [['notes', 'merge'], ['ratings', 'local']][Symbol.iterator](); } }
    const controller = conflictsPage.createController({
      page: 'conflicts', getAccount: () => ({ isAdmin: true }), escapeHtml, formatGigDate, elements, FormDataClass: FormDataStub,
      refreshNotifications: async () => { refreshed += 1; },
      fetchJson: async (url, options) => { requests.push([url, options]); return url === '/api/sync/conflicts' ? [] : {}; }
    });
    const status = { textContent: '', classList: classList() };
    const button = { disabled: false };
    const form = { dataset: { conflictId: 'conflict 1' }, querySelector: (selector) => selector.includes('button') ? button : status };
    await controller.resolve(form);
    assert.equal(requests[0][0], '/api/sync/conflicts/conflict%201/resolve');
    assert.deepEqual(JSON.parse(requests[0][1].body), { notes: 'merge', ratings: 'local' });
    assert.equal(status.textContent, 'Resolved.');
    assert.equal(refreshed, 1);
  });
});
