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

  test('renders fallback source controls with clip bounds and selection', () => {
    const gig = { media: [{ id: 'one', label: 'Primary' }, { id: 'two', label: 'Backup & alt' }] };
    const dependencies = { candidates: (record) => record.media, sourceLabel: (item) => item.label, escapeHtml: (value) => String(value).replaceAll('&', '&amp;') };
    const markup = editor.fallbackMarkup(gig, { media: gig.media[1], clip: { startSeconds: 2.5, endSeconds: 8 } }, dependencies);
    assert.match(markup, /value="two" selected/);
    assert.match(markup, /Backup &amp; alt/);
    assert.match(markup, /value="2.5"/);
    assert.match(markup, /value="8"/);
  });

  test('serializes primary and ordered fallback DOM sources', () => {
    const media = [{ id: 'primary' }, { id: 'backup' }];
    const values = { '.playback-source': 'primary', '.playback-start': '1', '.playback-end': '10' };
    const fallbackValues = { '.playback-fallback-source': 'backup', '.playback-fallback-start': '2', '.playback-fallback-end': '9' };
    const fallback = { querySelector: (selector) => ({ value: fallbackValues[selector] }) };
    const row = { querySelector: (selector) => ({ value: values[selector] }), querySelectorAll: () => [fallback] };
    const sources = editor.rowSources({ media }, row);
    assert.deepEqual(sources.map((source) => ({ id: source.media.id, start: source.startValue, end: source.endValue, priority: source.priority })), [
      { id: 'primary', start: '1', end: '10', priority: 0 },
      { id: 'backup', start: '2', end: '9', priority: 1 }
    ]);
  });

  test('collects validation row state and renders health totals', () => {
    const row = {
      dataset: { songIndex: '2', mediaDuration: '120', previewUnavailable: 'true' },
      querySelector: (selector) => ({ value: selector === '.playback-source' ? '' : '' }), querySelectorAll: () => []
    };
    const rows = editor.rowsFromList({ media: [] }, { querySelectorAll: () => [row] });
    assert.equal(rows[0].songIndex, 2);
    assert.equal(rows[0].duration, 120);
    assert.equal(rows[0].previewUnavailable, true);
    const markup = editor.healthMarkup({ assigned: 2, gaps: 1, errors: ['Bad bounds'], warnings: ['Encoding'] }, 3);
    assert.match(markup, /2\/3 tracks assigned/);
    assert.match(markup, /1 gap/);
    assert.match(markup, /1 issue to fix/);
    assert.match(markup, /1 warning/);
  });
});
