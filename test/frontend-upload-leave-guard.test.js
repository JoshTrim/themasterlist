const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const uploadLeaveGuard = require('../public/lib/upload-leave-guard');

describe('upload navigation guard', () => {
  test('detects only running upload jobs or an active mobile queue', () => {
    const jobs = new Map([
      ['encode', { type: 'Encoding', status: 'running' }],
      ['done', { type: 'Uploading', status: 'complete' }]
    ]);
    assert.equal(uploadLeaveGuard.hasActiveUpload(jobs, false), false);
    jobs.set('upload', { type: 'Uploading', status: 'running' });
    assert.equal(uploadLeaveGuard.hasActiveUpload(jobs, false), true);
    jobs.delete('upload');
    assert.equal(uploadLeaveGuard.hasActiveUpload(jobs, true), true);
  });

  test('leaves ordinary navigation untouched', () => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    const guard = uploadLeaveGuard.createGuard({ window: {}, jobQueue: new Map(), isMobileBusy: () => false });
    assert.equal(guard.beforeUnload(event), false);
    assert.equal(event.prevented, false);
    assert.equal(event.returnValue, undefined);
  });

  test('blocks navigation during a queued mobile upload', () => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    const guard = uploadLeaveGuard.createGuard({ window: {}, jobQueue: new Map(), isMobileBusy: () => true });
    assert.equal(guard.beforeUnload(event), true);
    assert.equal(event.prevented, true);
    assert.equal(event.returnValue, '');
  });

  test('binds and unbinds the same before-unload listener', () => {
    const calls = [];
    const window = {
      addEventListener: (type, handler) => calls.push(['add', type, handler]),
      removeEventListener: (type, handler) => calls.push(['remove', type, handler])
    };
    const guard = uploadLeaveGuard.createGuard({ window, jobQueue: new Map(), isMobileBusy: () => false });
    guard.bind();
    guard.unbind();
    assert.equal(calls[0][1], 'beforeunload');
    assert.equal(calls[1][1], 'beforeunload');
    assert.equal(calls[0][2], calls[1][2]);
  });
});
