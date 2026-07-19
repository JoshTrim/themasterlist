const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const playbackCore = require('../public/lib/playback-core');
const timelineController = require('../public/lib/playback-timeline-controller');

function markupTarget() {
  return { innerHTML: '', querySelectorAll: () => [] };
}

function fixture() {
  const media = { id: 'video', mimeType: 'video/mp4' };
  const queue = [
    { songIndex: 0, media, clip: { startSeconds: 10, endSeconds: 20 } },
    { songIndex: 1, media, clip: { startSeconds: 20, endSeconds: 30 } }
  ];
  const gig = { id: 'g1', songs: [{ title: 'First' }, { title: 'Second' }] };
  const video = { duration: 100, currentTime: 0, readyState: 1 };
  const elements = {
    player: { dataset: {} },
    stage: { querySelector: () => video },
    timeline: null,
    progress: { style: {} },
    markers: markupTarget(),
    overview: null,
    overviewProgress: { style: {} },
    overviewMarkers: markupTarget(),
    elapsed: { textContent: '' },
    total: { textContent: '' },
    mediaQuery: {}
  };
  let index = 0;
  let pending = 'unchanged';
  let played = 0;
  const controller = timelineController.createController({
    core: playbackCore,
    escapeHtml: String,
    formatPlaybackTime: (seconds) => `${seconds}s`,
    getGig: () => gig,
    getQueue: () => queue,
    getIndex: () => index,
    setIndex: (value) => { index = value; },
    getZoom: () => 5,
    setZoom() {},
    entryTitle: playbackCore.entryTitle,
    bounds: playbackCore.bounds,
    timeAt: playbackCore.timeAt,
    playTrack: () => { played += 1; },
    setPendingSeek: (value) => { pending = value; },
    getYoutubePlayer: () => null,
    elements
  });
  return { controller, elements, gig, queue, video, getIndex: () => index, getPending: () => pending, getPlayed: () => played };
}

describe('playback timeline controller', () => {
  test('clamps pointer positions to the timeline bounds', () => {
    const element = { getBoundingClientRect: () => ({ left: 100, width: 200 }) };
    assert.equal(timelineController.pointerRatio(element, 50), 0);
    assert.equal(timelineController.pointerRatio(element, 200), .5);
    assert.equal(timelineController.pointerRatio(element, 400), 1);
  });

  test('renders focused and overview markers and maps clip progress', () => {
    const view = fixture();
    view.controller.render(view.gig);
    assert.match(view.elements.markers.innerHTML, /1 · First/);
    assert.match(view.elements.markers.innerHTML, /2 · Second/);
    view.controller.setProgress(view.gig, .5, 15, 100);
    assert.equal(view.elements.progress.style.width, '25%');
    assert.equal(view.elements.overviewProgress.style.width, '25%');
    assert.equal(view.elements.elapsed.textContent, '5s');
    assert.equal(view.elements.total.textContent, '10s');
  });

  test('interpolates a timeline seek into the edited media bounds', () => {
    const view = fixture();
    view.controller.seek(.25);
    assert.equal(view.getIndex(), 0);
    assert.equal(view.video.currentTime, 15);
    assert.equal(view.getPending(), null);
    assert.equal(view.getPlayed(), 0);
    assert.equal(view.elements.progress.style.width, '25%');
  });

  test('switches tracks before seeking when the target is in another segment', () => {
    const view = fixture();
    view.controller.seek(.75);
    assert.equal(view.getIndex(), 1);
    assert.deepEqual(view.getPending(), { index: 1, fraction: .5 });
    assert.equal(view.getPlayed(), 1);
  });
});
