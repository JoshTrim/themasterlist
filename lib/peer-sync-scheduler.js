function createPeerSyncScheduler({
  syncAll, enabled = true, intervalMs = 60_000, initialDelayMs = 15_000,
  setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, logger = console
}) {
  let timer = null;
  let running = false;
  let stopped = true;

  function schedule(delay = intervalMs) {
    if (!enabled || stopped) return null;
    clearTimeoutFn(timer);
    timer = setTimeoutFn(tick, Math.max(1_000, Number(delay) || intervalMs));
    timer?.unref?.();
    return timer;
  }

  async function tick() {
    if (!enabled || stopped || running) return false;
    running = true;
    try {
      await syncAll();
      return true;
    } catch (error) {
      logger.error?.('[peer-sync] scheduled sync failed:', error.message);
      return false;
    } finally {
      running = false;
      schedule();
    }
  }

  function start() {
    if (!enabled) return null;
    stopped = false;
    return schedule(initialDelayMs);
  }

  function stop() {
    stopped = true;
    clearTimeoutFn(timer);
    timer = null;
  }

  return { start, stop, tick, isRunning: () => running, getTimer: () => timer };
}

module.exports = { createPeerSyncScheduler };
