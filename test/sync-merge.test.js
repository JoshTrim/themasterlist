const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { syncPayloadHash, mergeText, mergeSongs, averageRating } = require('../lib/sync-merge');

describe('peer conflict merges', () => {
  test('hashes identical payloads consistently and notices content changes', () => {
    assert.equal(syncPayloadHash({ notes: 'same' }), syncPayloadHash({ notes: 'same' }));
    assert.notEqual(syncPayloadHash({ notes: 'same' }), syncPayloadHash({ notes: 'changed' }));
  });

  test('combines distinct notes without duplicating identical text', () => {
    assert.equal(mergeText('Local memory', 'Peer memory'), 'Local memory\n\nPeer memory');
    assert.equal(mergeText(' Same ', 'Same'), 'Same');
    assert.equal(mergeText('', 'Peer only'), 'Peer only');
  });

  test('combines setlists in local order using artist and title identity', () => {
    assert.deepEqual(mergeSongs(
      [{ title: 'First', artist: 'Artist' }, { title: 'Shared', artist: 'Artist', album: 'Local album' }],
      [{ title: 'shared', artist: 'artist', album: 'Peer album' }, { title: 'Peer encore', artist: 'Artist' }]
    ), [
      { title: 'First', artist: 'Artist' },
      { title: 'Shared', artist: 'Artist', album: 'Local album' },
      { title: 'Peer encore', artist: 'Artist' }
    ]);
  });

  test('averages available ratings to the nearest half star', () => {
    assert.equal(averageRating(3, 4), 3.5);
    assert.equal(averageRating(null, 5), 5);
    assert.equal(averageRating(null, ''), null);
  });
});
