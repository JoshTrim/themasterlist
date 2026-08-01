const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createPeerSyncScheduler } = require('../lib/peer-sync-scheduler');

function fixture(overrides = {}) {
  const scheduled = []; const cleared = []; const errors = [];
  let calls = 0;
  const scheduler = createPeerSyncScheduler({
    syncAll: overrides.syncAll || (async () => { calls += 1; }), enabled: overrides.enabled ?? true,
    intervalMs: 60_000, initialDelayMs: 5_000,
    setTimeoutFn: (handler, delay) => { const timer = { handler, delay, unref() {} }; scheduled.push(timer); return timer; },
    clearTimeoutFn: (timer) => { if (timer) cleared.push(timer); }, logger: { error: (...args) => errors.push(args) }
  });
  return { scheduler, scheduled, cleared, errors, calls: () => calls };
}

describe('server peer sync scheduler', () => {
  test('starts after a short delay and reschedules after successful work', async () => {
    const view = fixture();
    const initial = view.scheduler.start();
    assert.equal(initial.delay, 5_000);
    assert.equal(await view.scheduler.tick(), true);
    assert.equal(view.calls(), 1);
    assert.equal(view.scheduled.at(-1).delay, 60_000);
  });

  test('recovers after scheduler errors without overlapping work', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const view = fixture({ syncAll: async () => pending });
    view.scheduler.start();
    const first = view.scheduler.tick();
    assert.equal(view.scheduler.isRunning(), true);
    assert.equal(await view.scheduler.tick(), false);
    release();
    assert.equal(await first, true);

    const failed = fixture({ syncAll: async () => { throw new Error('database busy'); } });
    failed.scheduler.start();
    assert.equal(await failed.scheduler.tick(), false);
    assert.match(failed.errors[0].join(' '), /database busy/);
    assert.equal(failed.scheduled.at(-1).delay, 60_000);
  });

  test('can be disabled and stopped cleanly', () => {
    const disabled = fixture({ enabled: false });
    assert.equal(disabled.scheduler.start(), null);
    assert.equal(disabled.scheduled.length, 0);
    const active = fixture(); const timer = active.scheduler.start(); active.scheduler.stop();
    assert.equal(active.cleared.at(-1), timer);
    assert.equal(active.scheduler.getTimer(), null);
  });
});
