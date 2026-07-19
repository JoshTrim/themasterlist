const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const editMediaUpload = require('../public/lib/edit-media-upload');

function classList() {
  const values = new Set();
  return { toggle: (name, active) => active ? values.add(name) : values.delete(name), contains: (name) => values.has(name) };
}

function fixture(overrides = {}) {
  const input = {
    dataset: {}, files: overrides.files || [], value: 'selected',
    addEventListener(_type, handler) { this.handler = handler; }
  };
  const message = { textContent: '', classList: classList() };
  const pendingFiles = new WeakMap();
  if (overrides.pending) pendingFiles.set(input, overrides.pending);
  const calls = [];
  const mobileQueueState = {};
  const controller = editMediaUpload.createController({
    isMobile: () => Boolean(overrides.mobile), input, message, pendingFiles,
    mobileState: (...args) => { calls.push(['mobileState', ...args]); return mobileQueueState; },
    startMobileQueue: (...args) => calls.push(['startMobile', ...args]),
    pollRecognition: async (...args) => { calls.push(['recognition', ...args]); if (overrides.recognized) args[1](overrides.recognized); },
    renderWorkspace: (...args) => calls.push(['workspace', ...args]),
    uploadFiles: overrides.uploadFiles || (async (...args) => { calls.push(['upload', ...args]); }),
    fetchJson: overrides.fetchJson || (async (url) => { calls.push(['fetch', url]); return overrides.refreshed || []; })
  });
  return { controller, input, message, pendingFiles, calls, mobileQueueState };
}

describe('edit media upload controller', () => {
  test('configures one mobile queue and refreshes recognition after it drains', async () => {
    const view = fixture({ mobile: true, recognized: [{ id: 'm1' }] });
    const gig = { id: 'g1' };
    assert.equal(view.controller.setup(gig), true);
    assert.equal(view.controller.setup(gig), false);
    assert.equal(view.calls.filter(([name]) => name === 'startMobile').length, 1);
    view.mobileQueueState.onUploaded({ name: 'clip.mp4' });
    assert.equal(view.message.textContent, 'clip.mp4 uploaded.');
    await view.mobileQueueState.onDrained();
    assert.equal(view.calls.some(([name]) => name === 'recognition'), true);
    assert.deepEqual(view.calls.find(([name]) => name === 'workspace').slice(1), [gig, [{ id: 'm1' }]]);
  });

  test('uploads pending desktop files immediately and refreshes the workspace', async () => {
    const file = { name: 'large.mp4' };
    const refreshed = [{ id: 'media' }];
    const view = fixture({ pending: [file], refreshed, uploadFiles: async (gigId, files, onProgress) => {
      assert.equal(gigId, 'g1');
      assert.deepEqual(files, [file]);
      onProgress(file, .6);
    } });
    const gig = { id: 'g1' };
    view.controller.setup(gig);
    await view.input.handler();
    assert.equal(view.input.value, '');
    assert.deepEqual(view.pendingFiles.get(view.input), []);
    assert.equal(view.message.textContent, 'Media uploaded.');
    assert.deepEqual(view.calls.find(([name]) => name === 'workspace').slice(1), [gig, refreshed]);
  });

  test('keeps failed desktop files available and reports the error', async () => {
    const file = { name: 'failed.mp4' };
    const view = fixture({ pending: [file], uploadFiles: async () => { throw new Error('Connection lost'); } });
    view.controller.setup({ id: 'g1' });
    await view.input.handler();
    assert.deepEqual(view.pendingFiles.get(view.input), [file]);
    assert.equal(view.input.value, 'selected');
    assert.equal(view.message.textContent, 'Connection lost');
    assert.equal(view.message.classList.contains('error'), true);
  });

  test('reports save-time upload encoding progress consistently', async () => {
    const file = { name: 'clip.mp4' };
    const view = fixture({ uploadFiles: async (_gigId, _files, onProgress) => { onProgress(file, 1); } });
    await view.controller.uploadForSave({ id: 'g1' }, [file]);
    assert.equal(view.message.textContent, 'Upload complete · preparing mobile playback for clip.mp4…');
    assert.equal(view.controller.progressMessage(file, .25), 'Uploading clip.mp4 · 25%');
  });
});
