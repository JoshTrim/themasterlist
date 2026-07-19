const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const youtubePlayerApi = require('../public/lib/youtube-player-api');

function fixture(overrides = {}) {
  const scripts = [];
  const appended = [];
  const existing = overrides.existing || null;
  const document = {
    querySelector: () => existing,
    createElement: () => {
      const script = { handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } };
      scripts.push(script);
      return script;
    },
    head: { appendChild: (script) => appended.push(script) }
  };
  const window = overrides.window || {};
  const loader = youtubePlayerApi.createLoader({ window, document });
  return { loader, window, document, scripts, appended };
}

describe('YouTube iframe API loader', () => {
  test('returns an already available player API without adding a script', async () => {
    const YT = { Player: function Player() {} };
    const view = fixture({ window: { YT } });
    assert.equal(await view.loader.load(), YT);
    assert.equal(view.appended.length, 0);
  });

  test('deduplicates concurrent loads and preserves an existing ready callback', async () => {
    let previousCalls = 0;
    const view = fixture({ window: { onYouTubeIframeAPIReady: () => { previousCalls += 1; } } });
    const first = view.loader.load();
    const second = view.loader.load();
    assert.equal(first, second);
    assert.equal(view.appended.length, 1);
    assert.equal(view.appended[0].src, 'https://www.youtube.com/iframe_api');
    const YT = { Player: function Player() {} };
    view.window.YT = YT;
    view.window.onYouTubeIframeAPIReady();
    assert.equal(await first, YT);
    assert.equal(previousCalls, 1);
  });

  test('reuses an existing script element', async () => {
    const existing = { handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } };
    const view = fixture({ existing, window: {} });
    const pending = view.loader.load();
    assert.equal(view.appended.length, 0);
    view.window.YT = { Player: function Player() {} };
    view.window.onYouTubeIframeAPIReady();
    assert.equal(await pending, view.window.YT);
  });

  test('reports script failures and permits a later retry', async () => {
    const view = fixture();
    const first = view.loader.load();
    view.scripts[0].handlers.error();
    await assert.rejects(first, /Could not load the YouTube player API/);
    const second = view.loader.load();
    assert.notEqual(second, first);
    assert.equal(view.appended.length, 2);
    view.window.YT = { Player: function Player() {} };
    view.window.onYouTubeIframeAPIReady();
    await second;
  });

  test('rejects a ready callback that does not expose the API', async () => {
    const view = fixture();
    const pending = view.loader.load();
    view.window.onYouTubeIframeAPIReady();
    await assert.rejects(pending, /did not become available/);
  });
});
