const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const playbackCore = require('../public/lib/playback-core');
const playbackMedia = require('../public/lib/playback-media');
const setPlaybackController = require('../public/lib/set-playback-controller');

function button() {
  return {
    handlers: {}, disabled: false, textContent: '', className: '',
    classList: { contains: (name) => String(this?.className || '').split(' ').includes(name), add() {} },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    click() { return this.handlers.click?.({ target: this }); },
    setAttribute(name, value) { this[name] = value; }, setPointerCapture() {}
  };
}

function fixture(gig, sharedShows = []) {
  const playButton = button();
  const stage = {
    innerHTML: '', children: [],
    querySelector: () => null,
    append(...items) { this.children.push(...items); }
  };
  const player = { hidden: true, dataset: {}, append() {} };
  const element = () => ({ textContent: '', innerHTML: '', style: {}, querySelectorAll: () => [] });
  const elements = {
    playButton, player, title: element(), stage,
    nextButton: button(), previousButton: button(), restartButton: button(),
    fullscreenButton: button(), controlsToggle: button(), status: element(),
    progress: element(), markers: element(), timeline: null, overview: null,
    overviewProgress: element(), overviewMarkers: element(), elapsed: element(), total: element(),
    sourceKind: element(), sourceLabel: element(), contextPrevious: element(), contextCurrent: element(), contextNext: element()
  };
  const timeline = {
    renders: 0, bind() {}, isActive: () => false,
    render() { this.renders += 1; }, setProgress() {}, applySeek() {}
  };
  const theatre = { bind() {}, schedule() {}, reveal() {}, toggle() {} };
  const storageValues = new Map();
  const controller = setPlaybackController.createController({
    document: {
      fullscreenElement: null,
      createElement: () => button()
    },
    window: { setTimeout: () => 1, clearTimeout() {} },
    navigatorApi: {},
    storage: { getItem: (key) => storageValues.get(key) || null, setItem: (key, value) => storageValues.set(key, value), removeItem: (key) => storageValues.delete(key) },
    getGigs: () => [gig], getSharedShows: () => sharedShows, showId: gig.id,
    escapeHtml: String, formatPlaybackTime: String,
    loadYouTubeApi: async () => ({}), youtubeEmbedUrl: String,
    playbackCore, playbackMedia,
    timelineControllerModule: { createController: () => timeline },
    theatreControllerModule: { createController: () => theatre },
    theatreUi: {}, mediaQuery: { matches: false, addEventListener() {} },
    now: () => 1000, setTimeoutFn: () => 1, clearTimeoutFn() {}, setIntervalFn: () => 1, clearIntervalFn() {},
    elements
  });
  return { controller, elements, timeline };
}

describe('whole-set playback controller', () => {
  test('builds compact transport controls in playback order', () => {
    const created = [];
    const document = { createElement: (tag) => { const element = button(); element.tag = tag; element.children = []; element.append = (...children) => element.children.push(...children); created.push(element); return element; } };
    const playerChildren = [];
    const player = { append: (element) => playerChildren.push(element) };
    const parent = { inserted: [], insertBefore(element, before) { this.inserted.push({ element, before }); } };
    const nextButton = button(); nextButton.parentNode = parent;
    const fullscreenButton = button();
    const controls = setPlaybackController.createTransportControls({ document, player, nextButton, fullscreenButton });
    assert.equal(controls.previousButton.textContent, '← Previous');
    assert.equal(controls.restartButton.textContent, '↺ Start over');
    assert.equal(controls.controlsToggle['aria-label'], 'Show or hide playback controls');
    assert.deepEqual(playerChildren, [controls.controlsToggle]);
    assert.deepEqual(parent.inserted, [{ element: controls.controls, before: nextButton }]);
    assert.deepEqual(controls.controls.children, [controls.previousButton, controls.restartButton, fullscreenButton, nextButton]);
  });

  test('builds the set queue and explains when no playable media exists', () => {
    const gig = { id: 'g1', songs: [{ title: 'Opening' }], media: [] };
    const view = fixture(gig);
    view.controller.start();
    assert.equal(view.elements.player.hidden, false);
    assert.equal(view.elements.status.textContent, 'Assign media to setlist tracks first.');
    assert.equal(view.controller.getState().queue.length, 1);
    assert.equal(view.controller.getState().queue[0].media, null);
  });

  test('renders a missing-track gap without leaking queue state into the app shell', () => {
    const gig = { id: 'g1', songs: [{ title: 'Opening' }, { title: 'Finale' }], media: [{ id: 'video', mimeType: 'video/mp4', url: '/video.mp4', songIndex: 1 }] };
    const view = fixture(gig);
    view.controller.start();
    assert.equal(view.controller.getState().index, 1);
    assert.equal(view.controller.getState().queue[1].media.id, 'video');
    assert.match(view.elements.status.textContent, /2 of 2/);
    assert.equal(view.timeline.renders, 1);
  });

  test('promotes a configured backup when the active source fails', () => {
    const primary = { id: 'primary', mimeType: 'video/mp4', url: '/primary.mp4', playbackClips: [{ songIndex: 0, priority: 0 }] };
    const backup = { id: 'backup', mimeType: 'video/mp4', url: '/backup.mp4', playbackClips: [{ songIndex: 0, priority: 1 }] };
    const view = fixture({ id: 'g1', songs: [{ title: 'Opening' }], media: [primary, backup] });
    view.controller.start();
    view.controller.failSource('Primary unavailable');
    const state = view.controller.getState();
    assert.equal(state.queue[0].sourceIndex, 1);
    assert.equal(state.queue[0].media.id, 'backup');
    assert.match(view.elements.status.textContent, /backup 1/);
  });

  test('includes assigned video sources streamed from a peer contribution', () => {
    const gig = { id: 'g1', sharedId: 'shared', songs: [{ title: 'Opening' }], media: [] };
    const remote = { id: 'remote', mimeType: 'video/mp4', url: '/api/peer-media/peer/shared/remote', remote: true, songIndex: 0 };
    const view = fixture(gig, [{ id: 'shared', sourceGigId: 'g1', contributions: [{ localGigId: null, media: [remote] }] }]);
    view.controller.start();
    assert.equal(view.controller.getState().queue[0].media.id, 'remote');
    assert.match(view.elements.status.textContent, /1 of 1/);
  });
});
