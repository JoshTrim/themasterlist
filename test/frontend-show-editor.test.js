const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../public/lib/show-editor');

describe('shared show editor', () => {
  test('detects local and peer duplicates without flagging the edited show', () => {
    const values = { artist: ' Poppy ', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20' };
    const gigs = [
      { id: 'editing', artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20' },
      { id: 'local', artist: 'POPPY', venue: 'the tivoli', city: 'brisbane', date: '2026-01-20' }
    ];
    const sharedShows = [{ id: 'peer', sourceGigId: 'peer-source', artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20' }];
    const matches = editor.findDuplicates(values, { gigs, sharedShows, excludeId: 'editing' });
    assert.deepEqual(matches.map((show) => [show.id, show.duplicateSource]), [['local', 'Your archive'], ['peer', 'Shared by a peer']]);
  });

  test('does not show a peer contribution as a duplicate of its local shared copy', () => {
    const values = { artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20' };
    const matches = editor.findDuplicates(values, {
      gigs: [{ id: 'local', sharedId: 'shared', artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20' }],
      sharedShows: [{ id: 'shared', artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20' }],
      excludeId: 'local'
    });
    assert.deepEqual(matches, []);
  });

  test('always includes the owner and preserves selected peers', () => {
    const options = editor.attendeeOptions({ id: 'owner', name: 'Archive Owner' }, [{ peerId: 'sam', name: 'Sam' }, { peerId: 'alex', name: 'Alex' }], [{ id: 'sam' }]);
    assert.deepEqual(options.map((option) => [option.id, option.selected, option.isOwner]), [
      ['owner', true, true], ['sam', true, false], ['alex', false, false]
    ]);
    const inputs = options.map((option) => ({ checked: option.selected, value: option.id, dataset: { attendeeType: option.type } }));
    assert.deepEqual(editor.selectedAttendees(inputs), [{ id: 'owner', type: 'owner' }, { id: 'sam', type: 'peer' }]);
  });

  test('creates add and edit payloads without file or media fields', () => {
    const entries = { artist: 'Poppy', venue: 'The Tivoli', media: [{ id: 'old' }], artifacts: [{}], mediaFiles: [{}] };
    const setlist = { id: 'set-1', url: 'https://setlist.fm/set-1', songs: [{ title: 'Concrete' }] };
    assert.deepEqual(editor.createAddPayload(entries, { attendees: [{ id: 'owner' }], setlist }), {
      artist: 'Poppy', venue: 'The Tivoli', attendees: [{ id: 'owner' }], songs: setlist.songs, setlistFmId: 'set-1', setlistFmUrl: setlist.url
    });
    assert.deepEqual(editor.createEditPayload(entries, { attendees: [], songs: setlist.songs }), {
      artist: 'Poppy', venue: 'The Tivoli', attendees: [], songs: setlist.songs
    });
  });

  test('editing fields preserves the rest of each track metadata object', () => {
    const tracks = [
      { title: 'Old title', artist: 'Poppy', album: 'I Disagree', encore: true, cover: { artist: 'Someone' }, playbackHint: 'keep' },
      { title: 'Track two', artist: 'Poppy', album: 'Negative Spaces', set: 2 }
    ];
    const synced = editor.syncTracks(tracks, [
      { title: 'New title', artist: 'Poppy', album: 'I Disagree' },
      { title: 'Track two', artist: 'Poppy', album: 'Negative Spaces' }
    ]);
    assert.equal(synced[0].title, 'New title');
    assert.equal(synced[0].encore, true);
    assert.deepEqual(synced[0].cover, { artist: 'Someone' });
    assert.equal(synced[0].playbackHint, 'keep');
    assert.equal(synced[1].set, 2);
  });

  test('reorders, removes and adds tracks without losing metadata', () => {
    const tracks = [{ title: 'One', album: 'A' }, { title: 'Two', album: 'B' }, { title: 'Three', album: 'C' }];
    const moved = editor.moveTrack(tracks, 0, 2, true);
    assert.deepEqual(moved.tracks.map((track) => track.title), ['Two', 'Three', 'One']);
    assert.equal(moved.tracks[2].album, 'A');
    assert.deepEqual(editor.removeTrack(moved.tracks, 1).map((track) => track.title), ['Two', 'One']);
    assert.deepEqual(editor.addTrack([], 'Poppy'), [{ title: '', artist: 'Poppy', album: '' }]);
  });
});
