const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const mobileUploads = require('../public/lib/mobile-upload-controller');
const queue = require('../public/lib/upload-queue');

function inputFixture() {
  const status = { hidden: true, innerHTML: '', replaceChildren() { this.innerHTML = ''; }, querySelectorAll: () => [] };
  const input = {
    files: [], value: '', inserted: null, handlers: {},
    closest: () => ({ querySelector: () => status }), addEventListener(type, handler) { this.handlers[type] = handler; },
    insertAdjacentElement(_position, element) { this.inserted = element; }
  };
  return { input, status };
}

function controllerFixture(overrides = {}) {
  const pendingFiles = new WeakMap();
  const document = {
    visibilityState: 'visible', handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; },
    createElement() { return { handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } }; }
  };
  const controller = mobileUploads.createController({
    document, navigator: {}, isMobile: () => true, queue, pendingFiles, escapeHtml: String,
    uploadFiles: async (_gigId, _files, progress) => progress(null, 1),
    setTimeoutFn: (fn) => { fn(); return 1; }, clearTimeoutFn() {}, ...overrides
  });
  return { controller, pendingFiles, document };
}

describe('mobile upload controller', () => {
  test('formats upload sizes for queue presentation', () => {
    assert.equal(mobileUploads.formatSize(0), '0 B');
    assert.equal(mobileUploads.formatSize(1024), '1.0 KB');
    assert.equal(mobileUploads.formatSize(5 * 1024 * 1024), '5.0 MB');
  });

  test('holds selected files until a show id is available', () => {
    const view = inputFixture();
    const { controller, pendingFiles } = controllerFixture();
    const file = { name: 'clip.mp4', size: 100 };
    const items = controller.queueFiles(view.input, [file]);
    assert.equal(items[0].status, 'waiting');
    assert.deepEqual(pendingFiles.get(view.input), [file]);
    assert.equal(controller.isBusy(view.input), true);
    assert.equal(view.status.hidden, false);
    assert.match(view.status.innerHTML, /Waiting for show/);
  });

  test('uploads queued files sequentially and calls lifecycle hooks', async () => {
    const view = inputFixture();
    const calls = [];
    const { controller, pendingFiles } = controllerFixture({
      uploadFiles: async (gigId, files, progress, category) => { calls.push(['upload', gigId, files[0].name, category]); progress(files[0], 0.5); progress(files[0], 1); }
    });
    controller.queueFiles(view.input, [{ name: 'one.mp4', size: 100 }, { name: 'two.mp4', size: 200 }]);
    let drained = 0;
    await controller.start(view.input, 'gig-1', (item) => calls.push(['complete', item.name]), (count) => { drained = count; }, 'artifact');
    await Promise.resolve();
    assert.deepEqual(calls.map((call) => call[0]), ['upload', 'complete', 'upload', 'complete']);
    assert.equal(calls[0][1], 'gig-1');
    assert.equal(calls[0][3], 'artifact');
    assert.equal(drained, 2);
    assert.deepEqual(pendingFiles.get(view.input), []);
    assert.equal(controller.isBusy(view.input), false);
    assert.equal(controller.stateFor(view.input).items.every((item) => item.status === 'complete'), true);
  });

  test('preserves failed items for retry', async () => {
    const view = inputFixture();
    const { controller } = controllerFixture({ uploadFiles: async () => { throw new Error('Network lost'); } });
    controller.queueFiles(view.input, [{ name: 'clip.mp4', size: 100 }]);
    await controller.start(view.input, 'gig-1');
    const state = controller.stateFor(view.input);
    assert.equal(state.items[0].status, 'error');
    assert.equal(state.items[0].error, 'Network lost');
    assert.match(view.status.innerHTML, /Failed · Network lost/);
  });

  test('clear button removes waiting and failed work without touching active uploads', () => {
    const view = inputFixture();
    const { controller, pendingFiles } = controllerFixture();
    controller.queueFiles(view.input, [{ name: 'waiting.mp4', size: 100 }]);
    const button = controller.addClearButton(view.input);
    button.handlers.click();
    assert.deepEqual(pendingFiles.get(view.input), []);
    assert.equal(controller.stateFor(view.input).items.length, 0);
    assert.equal(view.status.hidden, true);
  });

  test('retains and releases a screen wake lock around active processing', async () => {
    const view = inputFixture();
    let requested = 0;
    let released = 0;
    const wakeLock = { addEventListener() {}, release: async () => { released += 1; } };
    const { controller } = controllerFixture({ navigator: { wakeLock: { request: async () => { requested += 1; return wakeLock; } } } });
    controller.queueFiles(view.input, [{ name: 'clip.mp4', size: 100 }]);
    await controller.start(view.input, 'gig-1');
    await Promise.resolve();
    assert.equal(requested, 1);
    assert.equal(released, 1);
  });
});
