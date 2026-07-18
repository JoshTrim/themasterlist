const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { compareDates, selectArchiveShows, archiveStats } = require('../public/lib/shows');

const gigs = [
  { id: 'old', artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2024-01-01', favorite: true, performanceRating: 3, songs: [{ title: 'A' }] },
  { id: 'new', artist: 'Ninajirachi', venue: 'The Triffid', city: 'Brisbane', date: '2026-02-01', favorite: false, performanceRating: 5, songs: [{ title: 'B' }, { title: 'C' }] },
  { id: 'undated', artist: 'Mystery Act', venue: 'Elsewhere', city: 'Gold Coast', date: '', favorite: false, songs: [] }
];
const remoteShows = [{ id: 'shared', artist: 'Poppy', venue: 'Forum', city: 'Melbourne', date: '2025-03-01', songs: [{ title: 'D' }], contributions: [{ participantName: 'Sam', favorite: true, performanceRating: 4 }] }];

describe('show archive selection', () => {
  test('orders newest first while leaving undated shows last', () => {
    const result = selectArchiveShows({ gigs, remoteShows, sort: 'newest' });
    assert.deepEqual(result.local.map((gig) => gig.id), ['new', 'old', 'undated']);
    assert.ok(compareDates('', '2026-01-01') > 0);
  });

  test('filters local and peer shows using archive controls', () => {
    const search = selectArchiveShows({ gigs, remoteShows, query: 'poppy', favouritesOnly: true });
    assert.deepEqual(search.local.map((gig) => gig.id), ['old']);
    assert.deepEqual(search.remote.map((gig) => gig.id), ['shared']);
    assert.deepEqual(selectArchiveShows({ gigs, remoteShows, year: '2026' }).local.map((gig) => gig.id), ['new']);
  });

  test('sorts ratings and calculates combined archive statistics', () => {
    assert.deepEqual(selectArchiveShows({ gigs, remoteShows, sort: 'rating' }).local.map((gig) => gig.id), ['new', 'old', 'undated']);
    assert.deepEqual(archiveStats(gigs, remoteShows), { shows: 4, artists: 3, venues: 4, favourites: 2, songs: 4 });
  });
});
