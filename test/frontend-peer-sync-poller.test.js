const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const peerSyncPoller = require('../public/lib/peer-sync-poller');

function fixture(overrides = {}) {
  const scheduled = [];
  const cleared = [];
  const archives = [];
  let account = overrides.account === undefined ? { id: 'owner' } : overrides.account;
  const poller = peerSyncPoller.createPoller({
    fetchJson: overrides.fetchJson || (async (url) => url === '/api/peers/sync-all' ? { applied: 0 } : []),
    getAccount: () => account,
    loadNotifications: overrides.loadNotifications || (async () => []),
    loadConflicts: overrides.loadConflicts || (async () => {}),
    onArchive: async (archive) => archives.push(archive),
    setTimeoutFn: (handler, delay) => { const timer = { handler, delay }; scheduled.push(timer); return timer; },
    clearTimeoutFn: (timer) => { if (timer) cleared.push(timer); },
    intervalMs: 30_000
  });
  return { poller, scheduled, cleared, archives, setAccount: (value) => { account = value; } };
}

describe('peer sync poller', () => {
  test('does not poll or schedule while signed out', async () => {
    const view = fixture({ account: null });
    assert.equal(await view.poller.poll(), false);
    assert.equal(view.scheduled.length, 0);
  });

  test('refreshes archive data after applied changes and schedules the next poll', async () => {
    const requests = [];
    const view = fixture({
      fetchJson: async (url, options) => {
        requests.push([url, options]);
        if (url === '/api/peers/sync-all') return { applied: 1 };
        if (url === '/api/gigs') return [{ id: 'g1' }];
        if (url === '/api/shared/shows') return [{ id: 's1' }];
        throw new Error(`Unexpected ${url}`);
      }
    });
    assert.equal(await view.poller.poll(), true);
    assert.equal(requests[0][0], '/api/peers/sync-all');
    assert.equal(requests[0][1].method, 'POST');
    assert.deepEqual(view.archives, [{ gigs: [{ id: 'g1' }], sharedShows: [{ id: 's1' }] }]);
    assert.equal(view.scheduled.at(-1).delay, 30_000);
    assert.equal(view.poller.isRunning(), false);
  });

  test('notifications also trigger refresh while a quiet sync does not', async () => {
    let archiveRequests = 0;
    const view = fixture({
      fetchJson: async (url) => {
        if (url === '/api/peers/sync-all') return { applied: 0 };
        archiveRequests += 1;
        return [];
      },
      loadNotifications: async () => [{ id: 'notification' }]
    });
    await view.poller.poll();
    assert.equal(archiveRequests, 2);

    const quiet = fixture();
    await quiet.poller.poll();
    assert.deepEqual(quiet.archives, []);
  });

  test('prevents overlapping sync requests and recovers after failure', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const view = fixture({ fetchJson: async () => pending });
    const first = view.poller.poll();
    assert.equal(view.poller.isRunning(), true);
    assert.equal(await view.poller.poll(), false);
    release({ applied: 0 });
    assert.equal(await first, true);

    const failed = fixture({ fetchJson: async () => { throw new Error('offline'); } });
    assert.equal(await failed.poller.poll(), false);
    assert.equal(failed.poller.isRunning(), false);
    assert.equal(failed.scheduled.length, 1);
  });

  test('supports explicit startup and cancellation', () => {
    const view = fixture();
    const timer = view.poller.start(5_000);
    assert.equal(timer.delay, 5_000);
    view.poller.stop();
    assert.equal(view.cleared.at(-1), timer);
    assert.equal(view.poller.getTimer(), null);
  });
});
