const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const path = require('node:path');
const { parseProgressTime, createMediaProcessor } = require('../lib/media-processing');

function fakeChild({ stdout = '', stderr = '', code = 0, signal = null } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  queueMicrotask(() => {
    if (stdout) child.stdout.write(stdout);
    if (stderr) child.stderr.write(stderr);
    child.emit('close', code, signal);
  });
  return child;
}

test('FFmpeg progress parsing survives split chunks and returns the latest time', () => {
  const first = parseProgressTime('', 'frame=4\nout_time_ms=12');
  assert.equal(first.microseconds, null);
  const second = parseProgressTime(first.buffer, '3456\nprogress=continue\nout_time_us=2200000\n');
  assert.equal(second.microseconds, 2_200_000);
});

test('media processor reports FFmpeg progress and rotation direction', async () => {
  const calls = [];
  const progress = [];
  const processor = createMediaProcessor({
    spawn(command, args) {
      calls.push({ command, args });
      return fakeChild({ stdout: 'out_time_us=1000000\nout_time_us=2500000\nprogress=end\n' });
    },
    fs: {}, path, root: '/app', existsSync: () => false, logger: { log() {}, error() {} }
  });
  await processor.rotateVideo('in.mp4', 'out.mp4', 'counterclockwise', { onProgress: (value) => progress.push(value) });
  assert.ok(calls[0].args.includes('transpose=2'));
  assert.deepEqual(progress, [2_500_000]);
});

test('media processor exposes failures and converts cancelled processes into a useful error', async () => {
  const processor = createMediaProcessor({
    spawn: () => fakeChild({ stderr: 'decoder exploded', code: 1 }),
    fs: {}, path, root: '/app', existsSync: () => false, logger: { log() {}, error() {} }
  });
  await assert.rejects(processor.trimVideo('in.mp4', 'out.mp4', 2, 5), /decoder exploded/);

  const cancelled = createMediaProcessor({
    spawn: () => fakeChild({ code: null, signal: 'SIGTERM' }),
    fs: {}, path, root: '/app', existsSync: () => false, logger: { log() {}, error() {} }
  });
  await assert.rejects(cancelled.extractRecognitionSample('in.mp4', 'sample.mp3'), /cancelled/);
});

test('playback encoding retains its boolean compatibility contract', async () => {
  const success = createMediaProcessor({ spawn: () => fakeChild(), fs: {}, path, root: '/app', existsSync: () => false, logger: { log() {}, error() {} } });
  const failure = createMediaProcessor({ spawn: () => fakeChild({ code: 1 }), fs: {}, path, root: '/app', existsSync: () => false, logger: { log() {}, error() {} } });
  assert.equal(await success.createPlaybackProxy('in.mov', 'out.mp4'), true);
  assert.equal(await failure.createPlaybackProxy('in.mov', 'out.mp4'), false);
});
