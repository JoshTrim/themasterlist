const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const playbackEditorController = require('../public/lib/playback-editor-controller');

function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name)
  };
}

function fixture(overrides = {}) {
  const list = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const suggestButton = {
    disabled: false,
    textContent: '',
    addEventListener(_type, handler) { this.handler = handler; }
  };
  const elements = {
    list,
    health: { innerHTML: '' },
    suggestions: { innerHTML: '', querySelector: () => null },
    message: { textContent: '', classList: classList() },
    suggestButton,
    saveButton: { disabled: false, title: '', onclick: null }
  };
  const gigs = overrides.gigs || [];
  const controller = playbackEditorController.createController({
    document: { createElement: () => ({ innerHTML: '', firstElementChild: null }) },
    fetchJson: overrides.fetchJson || (async () => ({})),
    escapeHtml: String,
    formatPlaybackTime: (value) => `${value}s`,
    youtubeEmbedUrl: String,
    loadYouTubeApi: async () => ({}),
    playbackCore: {},
    playbackEditor: {},
    getGigs: () => gigs,
    onGigs() {},
    editGigId: overrides.editGigId || 'g1',
    EventClass: class Event {},
    setIntervalFn: () => 1,
    clearIntervalFn() {},
    elements
  });
  return { controller, elements };
}

describe('playback editor controller', () => {
  test('shows an actionable empty state and disables saving without a setlist', () => {
    const { controller, elements } = fixture();
    controller.render({ id: 'g1', songs: [], media: [] });
    assert.match(elements.list.innerHTML, /Add a setlist before building the playback plan/);
    assert.equal(elements.saveButton.disabled, true);
    assert.equal(elements.health.innerHTML, '');
  });

  test('requests and presents automatic playback suggestions without mutating the show', async () => {
    const gig = { id: 'g1', songs: [], media: [] };
    let requested = '';
    const { controller, elements } = fixture({
      gigs: [gig],
      fetchJson: async (url, options) => {
        requested = url;
        assert.equal(options.method, 'POST');
        return { inspected: 2, suggestions: [{ songIndex: 0, mediaId: 'm1', sourceLabel: 'Video', confidence: .9 }] };
      }
    });
    assert.equal(typeof elements.suggestButton.handler, 'function');
    await elements.suggestButton.handler();
    assert.equal(requested, '/api/gigs/g1/playback-plan/suggest');
    assert.match(elements.suggestions.innerHTML, /1 suggestion ready to review/);
    assert.match(elements.message.textContent, /Inspected 2 videos/);
    assert.equal(elements.suggestButton.disabled, false);
    assert.equal(elements.suggestButton.textContent, '✦ Suggest plan');
    assert.deepEqual(gig.media, []);
    assert.equal(controller.captureDraft('g1'), null);
  });

  test('surfaces suggestion failures and restores the control state', async () => {
    const { elements } = fixture({ gigs: [{ id: 'g1' }], fetchJson: async () => { throw new Error('Quota unavailable'); } });
    await elements.suggestButton.handler();
    assert.equal(elements.message.textContent, 'Quota unavailable');
    assert.equal(elements.message.classList.contains('error'), true);
    assert.equal(elements.suggestButton.disabled, false);
  });
});
