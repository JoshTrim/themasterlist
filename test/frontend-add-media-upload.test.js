const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const addMediaUpload = require('../public/lib/add-media-upload');

function fixture(overrides = {}) {
  const input = { files: overrides.files || [] };
  const pendingFiles = new WeakMap();
  if (overrides.pending) pendingFiles.set(input, overrides.pending);
  const state = {};
  const messages = [];
  const recognized = [];
  const starts = [];
  const controller = addMediaUpload.createController({
    input, pendingFiles,
    mobileState: (selectedInput, gigId) => { assert.equal(selectedInput, input); assert.equal(gigId, 'g1'); return state; },
    startMobileQueue: (...args) => starts.push(args),
    pollRecognition: overrides.pollRecognition || (async (_gigId, onMedia) => onMedia([{ id: 'm1' }])),
    uploadFiles: overrides.uploadFiles || (async () => {}),
    setMessage: (text) => messages.push(text),
    onRecognized: (...args) => recognized.push(args)
  });
  return { controller, input, pendingFiles, state, messages, recognized, starts };
}

describe('add show media upload controller', () => {
  test('prefers pending selections over the native input list', () => {
    const pending = [{ name: 'pending.mp4' }];
    const view = fixture({ pending, files: [{ name: 'native.mp4' }] });
    assert.deepEqual(view.controller.files(), pending);
  });

  test('queues mobile uploads and refreshes recognized media after drain', async () => {
    const view = fixture();
    const record = { id: 'g1' };
    assert.equal(await view.controller.queueMobile(record), view.state);
    assert.equal(view.state.releaseAfterDrain, true);
    assert.equal(view.starts.length, 1);
    const [, gigId, onUploaded, onDrained] = view.starts[0];
    assert.equal(gigId, 'g1');
    onUploaded({ name: 'clip.mp4' });
    assert.equal(view.messages[0], 'clip.mp4 uploaded. Continuing the queue…');
    await onDrained();
    assert.deepEqual(view.recognized, [[record, [{ id: 'm1' }]]]);
  });

  test('does not turn a completed upload into a failure when recognition fails', async () => {
    const view = fixture({ pollRecognition: async () => { throw new Error('AudD unavailable'); } });
    await view.controller.queueMobile({ id: 'g1' });
    await view.starts[0][3]();
    assert.deepEqual(view.recognized, []);
  });

  test('reports save-time upload and encoding progress', async () => {
    const file = { name: 'large.mp4' };
    const view = fixture({ uploadFiles: async (gigId, files, onProgress) => {
      assert.equal(gigId, 'g1');
      assert.deepEqual(files, [file]);
      onProgress(file, .4);
      onProgress(file, 1);
    } });
    await view.controller.uploadForSave({ id: 'g1' }, [file]);
    assert.deepEqual(view.messages, ['Uploading large.mp4 · 40%', 'Upload complete · preparing mobile playback for large.mp4…']);
  });
});
