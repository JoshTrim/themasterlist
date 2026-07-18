const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeHealth, createArchiveHealthService } = require('../lib/archive-health');

const completeArtist = { bio: 'Biography', image: 'artist.jpg' };
const completeVenue = { bio: 'Venue history', image: 'venue.jpg' };

describe('archive metadata health', () => {
  test('reports missing setlists, album data, profiles and locations', () => {
    const report = summarizeHealth({
      gigs: [
        { id: 'empty', artist: 'Unknown Artist', venue: 'Unknown Venue', city: 'Brisbane', date: '', songs: [] },
        { id: 'albums', artist: 'Known Artist', venue: 'Known Venue', city: 'Brisbane', date: '2026-01-01', songs: [{ title: 'One', album: null }, { title: 'Two', album: 'Album' }] }
      ],
      geocodes: { 'known venue|brisbane': { lat: -27, lng: 153 } },
      artistInfo: (key) => key === 'known artist' ? completeArtist : null,
      venueInfo: (key) => key === 'known venue|brisbane' ? completeVenue : null
    });
    assert.equal(report.healthy, false);
    assert.deepEqual(report.counts, { setlist: 1, albums: 1, artist: 1, venue: 1, location: 1 });
    assert.equal(report.issues.find((issue) => issue.type === 'albums').detail, '1 of 2 tracks need album metadata');
  });

  test('marks a complete archive healthy and deduplicates repeated entities', () => {
    const report = summarizeHealth({
      gigs: [1, 2].map((id) => ({ id: String(id), artist: 'Artist', venue: 'Venue', city: 'Brisbane', date: '2026-01-01', songs: [{ title: 'Song', album: 'Album' }] })),
      geocodes: { 'venue|brisbane': { lat: -27, lng: 153 } }, artistInfo: () => completeArtist, venueInfo: () => completeVenue
    });
    assert.deepEqual(report, { totalShows: 2, healthy: true, counts: {}, issues: [] });
  });

  test('loads repositories through the service boundary', async () => {
    const service = createArchiveHealthService({ readGigs: async () => [], readGeocodes: async () => ({}), artistInfo: () => null, venueInfo: () => null });
    assert.deepEqual(await service.report(), { totalShows: 0, healthy: true, counts: {}, issues: [] });
  });
});
