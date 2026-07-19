const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const trackEditor = require('../public/lib/track-list-editor');

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

function containerFixture() {
  return {
    innerHTML: '', lastElementChild: null,
    querySelectorAll: () => [], contains: () => true
  };
}

describe('setlist track editor', () => {
  test('renders escaped metadata fields and accessible reorder controls', () => {
    const markup = trackEditor.trackRowMarkup({ title: 'A & B', artist: '<Guest>', album: '"Album"' }, 1, escapeHtml);
    assert.match(markup, /data-track-index="1"/);
    assert.match(markup, /Reorder track 2/);
    assert.match(markup, /A &amp; B/);
    assert.match(markup, /&lt;Guest>/);
    assert.match(markup, /&quot;Album&quot;/);
  });

  test('loads tracks without mutating the caller collection', () => {
    const songs = [{ title: 'First' }, { title: 'Second' }];
    const container = containerFixture();
    const controller = trackEditor.createController({
      document: {}, escapeHtml, container, addButton: { addEventListener() {} }, getDefaultArtist: () => 'Artist',
      editor: { syncTracks: (current) => current, removeTrack: () => [], moveTrack: (current) => ({ tracks: current, index: 0 }), addTrack: (current) => current }
    });
    const loaded = controller.load(songs);
    assert.notEqual(loaded, songs);
    assert.deepEqual(controller.getTracks(), songs);
    assert.match(container.innerHTML, /First/);
    assert.match(container.innerHTML, /Second/);
  });

  test('delegates metadata-safe movement and addition to the show editor model', () => {
    const container = containerFixture();
    const calls = [];
    const editor = {
      syncTracks: (current) => current,
      moveTrack: (current, from, to, after) => { calls.push(['move', from, to, after]); const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return { tracks: next, index: to }; },
      addTrack: (current, artist) => { calls.push(['add', artist]); return [...current, { title: '', artist }]; },
      removeTrack: (current) => current
    };
    const controller = trackEditor.createController({ document: {}, editor, escapeHtml, container, addButton: { addEventListener() {} }, getDefaultArtist: () => 'Poppy' });
    controller.load([{ title: 'One' }, { title: 'Two' }]);
    controller.move(0, 1);
    assert.deepEqual(controller.getTracks().map((song) => song.title), ['Two', 'One']);
    controller.add();
    assert.equal(controller.getTracks()[2].artist, 'Poppy');
    assert.deepEqual(calls, [['move', 0, 1, false], ['add', 'Poppy']]);
  });
});
