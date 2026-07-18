const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createController } = require('../public/lib/theatre-controller');
const theatre = require('../public/lib/theatre');

function target(extra = {}) { const listeners = {}; return { listeners, addEventListener(type, callback) { listeners[type] = callback; }, ...extra }; }
test('theatre controller binds fullscreen lifecycle and keyboard transport', async () => {
  const classes = new Set(); const calls = [];
  const player = target({ hidden: false, classList: { add: (...names) => names.forEach((name) => classes.add(name)), remove: (...names) => names.forEach((name) => classes.delete(name)), contains: (name) => classes.has(name) }, requestFullscreen: async () => { document.fullscreenElement = player; } });
  const document = target({ fullscreenElement: null, visibilityState: 'visible', exitFullscreen: async () => { document.fullscreenElement = null; } });
  const window = target(); const fullscreenButton = target({ textContent: '' }); const controlsToggle = target({ setAttribute(name, value) { this[name] = value; } });
  const controller = createController({ document, window, player, fullscreenButton, controlsToggle, theatre, isPlaying: () => false, timelineActive: () => false, requestWakeLock: () => calls.push('wake'), releaseWakeLock: () => calls.push('release'), commands: { next: () => calls.push('next') }, setTimeout, clearTimeout });
  controller.bind(); await controller.toggle(); document.listeners.fullscreenchange();
  assert.equal(fullscreenButton.textContent, '↙ Exit theatre'); assert.ok(calls.includes('wake'));
  let prevented = false; document.listeners.keydown({ key: 'ArrowRight', target: { closest: () => null }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.ok(calls.includes('next'));
});

test('theatre controller auto-hides only while active playback is eligible', () => {
  const classes = new Set(); const player = target({ hidden: false, classList: { add: (name) => classes.add(name), remove: (...names) => names.forEach((name) => classes.delete(name)), contains: (name) => classes.has(name) } });
  const document = target({ fullscreenElement: player }); const window = target(); const button = target({ setAttribute() {} });
  const controller = createController({ document, window, player, fullscreenButton: target(), controlsToggle: button, theatre, isPlaying: () => true, timelineActive: () => false, requestWakeLock: () => {}, releaseWakeLock: () => {}, commands: {}, setTimeout: (callback) => { callback(); return 1; }, clearTimeout: () => {} });
  controller.schedule(); assert.equal(classes.has('theatre-idle'), true);
});
