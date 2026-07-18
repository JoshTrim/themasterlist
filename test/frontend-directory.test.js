const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const directory = require('../public/lib/directory-ui');

describe('artist and venue directory state', () => {
  const shows = [
    { artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20', performanceRating: 4, favorite: true },
    { artist: 'Poppy', venue: 'Riverstage', city: 'Brisbane', date: '2025-01-20', contributions: [{ performanceRating: 5 }] },
    { artist: 'Nine Inch Nails', venue: 'Riverstage', city: 'Brisbane', date: '2024-01-20' }
  ];
  test('aggregates artist visits, ratings, favourites and metadata gaps', () => {
    const metadata = new Map([['poppy', { image: '/poppy.jpg', bio: 'Bio', source: 'Source' }]]);
    const artists = directory.buildArtists(shows, metadata);
    const poppy = artists.find((artist) => artist.key === 'poppy');
    assert.equal(poppy.shows, 2); assert.equal(poppy.venues.size, 2); assert.equal(poppy.averageRating, 4.5); assert.equal(poppy.favourites, 1); assert.deepEqual(poppy.missingMetadata, []);
    assert.equal(directory.visibleEntities(artists, { type: 'artist', query: 'nine', metadata: 'incomplete' })[0].name, 'Nine Inch Nails');
  });
  test('aggregates venues and tracks location and closure metadata', () => {
    const metadata = new Map([['riverstage|brisbane', { image: '/venue.jpg', description: 'Bio', source: 'Source', isClosed: true }]]);
    const venues = directory.buildVenues(shows, metadata, new Set(['riverstage|brisbane']));
    const riverstage = venues.find((venue) => venue.name === 'Riverstage');
    assert.equal(riverstage.shows, 2); assert.equal(riverstage.artists.size, 2); assert.equal(riverstage.isClosed, true); assert.deepEqual(riverstage.missingMetadata, []);
  });
  test('builds deduplicated editor navigation and validates profile images', () => {
    assert.deepEqual(directory.editorEntries(shows, 'artist').map((entry) => entry.name), ['Nine Inch Nails', 'Poppy']);
    assert.equal(directory.initials('Nine Inch Nails'), 'NI');
    assert.throws(() => directory.validateImage({ size: 1, type: 'text/plain' }), /JPEG/);
  });
});
