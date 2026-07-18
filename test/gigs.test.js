const { afterEach, beforeEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createGigRepository } = require('../lib/gigs');

describe('gig repository', () => {
  let database;
  let repository;
  beforeEach(() => { database = new Database(':memory:'); migrateSchema(database); repository = createGigRepository({ database, mediaRows: (id) => [{ id: `media-for-${id}` }] }); });
  afterEach(() => database.close());

  test('round-trips domain values and supplies safe defaults', async () => {
    await repository.writeAll([{ id: 'gig-1', artist: 'Artist', venue: 'Venue', city: 'City', date: '2026-01-01', songs: [{ title: 'Song' }], favorite: true }]);
    const gig = repository.find('gig-1');
    assert.equal(gig.sharedId, 'gig-1');
    assert.equal(gig.performanceNotes, '');
    assert.equal(gig.favorite, true);
    assert.deepEqual(gig.songs, [{ title: 'Song' }]);
    assert.deepEqual(gig.media, [{ id: 'media-for-gig-1' }]);
  });

  test('updates existing records without duplicating them', async () => {
    await repository.writeAll([{ id: 'gig-1', artist: 'Artist', venue: 'Venue', city: 'City', date: '2025-01-01' }]);
    const current = repository.find('gig-1');
    await repository.writeAll([{ ...current, date: '2026-01-01', performanceRating: 5, performanceNotes: 'Great show' }]);
    assert.equal((await repository.readAll()).length, 1);
    assert.equal(repository.find('gig-1').performanceRating, 5);
    assert.equal(repository.find('gig-1').performanceNotes, 'Great show');
  });

  test('orders favourites first and then by most recent date', async () => {
    await repository.writeAll([
      { id: 'old-favourite', artist: 'A', venue: 'V', city: 'C', date: '2020-01-01', favorite: true },
      { id: 'new', artist: 'B', venue: 'V', city: 'C', date: '2026-01-01' },
      { id: 'middle', artist: 'C', venue: 'V', city: 'C', date: '2025-01-01' }
    ]);
    assert.deepEqual((await repository.readAll()).map((gig) => gig.id), ['old-favourite', 'new', 'middle']);
    assert.throws(() => repository.find('missing'), /not found/i);
  });
});
