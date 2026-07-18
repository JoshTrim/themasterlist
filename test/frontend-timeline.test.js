const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const timeline = require('../public/lib/timeline-page');

describe('archive timeline model', () => {
  const shows = [
    { id: 'one', date: '2022-01-03' }, { id: 'two', date: '2022-07-10' },
    { id: 'three', date: '2024-07-01' }, { id: 'four', date: '2024-07-15' },
    { id: 'undated', date: '' }
  ];
  test('counts active and quiet years while preserving undated shows', () => {
    const model = timeline.buildTimelineModel(shows);
    assert.deepEqual(model.activeYears, [2022, 2024]);
    assert.deepEqual(model.years, [2022, 2023, 2024]);
    assert.deepEqual(model.counts, { 2022: 2, 2024: 2 });
    assert.equal(model.busiestYear, 2024);
    assert.equal(model.undatedCount, 1);
  });
  test('builds chronological year details and monthly totals', () => {
    const detail = timeline.yearDetail(timeline.buildTimelineModel(shows), 2024);
    assert.deepEqual(detail.shows.map((show) => show.id), ['three', 'four']);
    assert.equal(detail.months[6], 2); assert.equal(detail.previousCount, 0); assert.equal(detail.difference, 2);
  });
  test('handles an archive with no dated shows', () => {
    const model = timeline.buildTimelineModel([{ date: '' }]);
    assert.deepEqual(model.years, []); assert.equal(model.busiestYear, null); assert.equal(model.undatedCount, 1);
  });
});
