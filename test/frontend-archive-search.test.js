const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSearchController } = require('../public/lib/archive-search');

const control = (value = '') => ({ value, checked: false, innerHTML: '', addEventListener() {}, focus() {} });
test('archive search controller searches shows, tracks, places and media with filters', () => {
  const input = control('concrete'); const year = control(''); const rating = control('0'); const media = control('any'); const favourite = control();
  const summary = { textContent: '' }; const results = { innerHTML: '' };
  const gigs = [{ id: 'gig', artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20', performanceRating: 5, favorite: true, songs: [{ title: 'Concrete', album: 'I Disagree' }], media: [{ caption: 'Concrete live', category: 'show' }] }];
  const controller = createSearchController({ page: 'search', window: { location: { search: '?q=concrete' } }, getGigs: () => gigs, escapeHtml: String, formatGigDate: String, input, yearInput: year, ratingInput: rating, mediaInput: media, favouriteInput: favourite, summary, results });
  controller.render();
  assert.match(summary.textContent, /result/); assert.match(results.innerHTML, /Tracks/); assert.match(results.innerHTML, /Media & artifacts/);
  favourite.checked = true; rating.value = '5'; controller.update(); assert.match(results.innerHTML, /Poppy/);
});

test('archive search controller renders an empty state for unmatched terms', () => {
  const input = control('missing'); const results = { innerHTML: '' };
  const controller = createSearchController({ page: 'search', window: { location: { search: '' } }, getGigs: () => [], escapeHtml: String, formatGigDate: String, input, yearInput: control(), ratingInput: control(), mediaInput: control('any'), favouriteInput: control(), summary: { textContent: '' }, results });
  controller.update(); assert.match(results.innerHTML, /No archive entries/);
});
