const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../public/lib/playback-editor');

describe('frontend playback editor state', () => {
  test('validates missing files, bad bounds and overlaps across one source', () => {
    const media = { id: 'video', mimeType: 'video/mp4', originalExists: true, playbackStatus: 'ready' };
    const health = editor.validatePlan([{ title: 'One' }, { title: 'Two' }], [
      { songIndex: 0, primaryId: 'video', duration: 100, sources: [{ media, startValue: '0', endValue: '60', priority: 0 }] },
      { songIndex: 1, primaryId: 'video', duration: 100, sources: [{ media, startValue: '50', endValue: '90', priority: 0 }] }
    ]);
    assert.equal(health.assigned, 2); assert.equal(health.gaps, 0);
    assert.match(health.errors.join(' '), /overlaps “One”/i);
  });

  test('normalizes clip payloads and keeps source priority', () => {
    assert.deepEqual(editor.clipsFromRows([{ songIndex: 3, sources: [{ media: { id: 'primary' }, startValue: '', endValue: '12.5', priority: 0 }, { media: { id: 'backup' }, startValue: '2', endValue: '', priority: 1 }] }]), [
      { mediaId: 'primary', songIndex: 3, startSeconds: null, endSeconds: 12.5, priority: 0 },
      { mediaId: 'backup', songIndex: 3, startSeconds: 2, endSeconds: null, priority: 1 }
    ]);
  });

  test('describes suggestion confidence and timing', () => {
    assert.equal(editor.suggestionConfidence({ confidence: .95 }), 'High confidence');
    assert.equal(editor.suggestionConfidence({ confidence: .5, reason: 'interpolated chapters' }), 'Timing estimate');
    assert.equal(editor.suggestionTiming({ startSeconds: 10, endSeconds: null }, (value) => `${value}s`), '10s–video end');
  });
});
