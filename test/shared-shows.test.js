const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { normaliseRating } = require('../lib/validation');
const { createSharedShows } = require('../lib/shared-shows');

function fixture() {
  const database = new Database(':memory:');
  migrateSchema(database);
  const timestamp = '2026-07-19T00:00:00.000Z';
  database.prepare('INSERT INTO profiles (id, name, created_at, is_admin) VALUES (?, ?, ?, ?)').run('owner', 'Archive Owner', timestamp, 1);
  database.prepare('INSERT INTO profiles (id, name, created_at, is_admin) VALUES (?, ?, ?, ?)').run('friend-profile', 'Sam', timestamp, 0);
  database.prepare(`INSERT INTO gigs
    (id, artist, venue, city, date, notes, performance_notes, venue_notes, performance_rating, venue_rating, favorite, songs, attendees, shared_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'gig-1', 'Artist', 'Venue', 'Brisbane', '2026-07-18', 'Local memory', 'Local memory', 'Local venue note', 3, 4, 0,
    JSON.stringify([{ title: 'Local song', artist: 'Artist' }]), '[]', 'shared-1', timestamp
  );
  const findGig = (id) => {
    const row = database.prepare('SELECT * FROM gigs WHERE id = ?').get(id);
    if (!row) throw new Error('Gig not found.');
    const media = database.prepare('SELECT * FROM gig_media WHERE gig_id = ? ORDER BY sort_order').all(id).map((item) => ({
      id: item.id, checksum: item.checksum, externalUrl: item.external_url, songIndex: item.song_index,
      playbackPreferred: Boolean(item.playback_preferred), playbackStart: item.playback_start, playbackEnd: item.playback_end,
      playbackClips: database.prepare('SELECT song_index AS songIndex, start_seconds AS startSeconds, end_seconds AS endSeconds, priority FROM media_playback_clips WHERE media_id = ? ORDER BY priority').all(item.id)
    }));
    return {
      id: row.id, sharedId: row.shared_id, artist: row.artist, venue: row.venue, city: row.city, date: row.date,
      setlistFmId: row.setlist_fm_id, setlistFmUrl: row.setlist_fm_url, songs: JSON.parse(row.songs), notes: row.notes,
      performanceNotes: row.performance_notes, venueNotes: row.venue_notes, performanceRating: row.performance_rating,
      venueRating: row.venue_rating, favorite: Boolean(row.favorite), media
    };
  };
  const contributionRows = (sharedGigId) => database.prepare(`SELECT shared_gig_id AS sharedGigId, instance_id AS instanceId,
    local_gig_id AS localGigId, participant_name AS participantName, performance_rating AS performanceRating,
    venue_rating AS venueRating, favorite, performance_notes AS performanceNotes, venue_notes AS venueNotes,
    media_manifest AS mediaManifest, updated_at AS updatedAt FROM shared_gig_contributions WHERE shared_gig_id = ?`).all(sharedGigId)
    .map((entry) => ({ ...entry, favorite: Boolean(entry.favorite), media: JSON.parse(entry.mediaManifest) }));
  const conflictPayloadFromGig = (gig) => ({
    notes: gig.performanceNotes || gig.notes || '', venueNotes: gig.venueNotes || '', performanceRating: gig.performanceRating,
    venueRating: gig.venueRating, favorite: Boolean(gig.favorite), songs: gig.songs || [], media: gig.media || []
  });
  const contributionUpdates = [];
  const service = createSharedShows({
    database, peerRows: () => [{ peerId: 'peer-1', name: 'Alex' }], instanceRow: () => ({ instanceId: 'instance-1' }),
    findGig, contributionRows, upsertLocalContribution: (gig) => contributionUpdates.push(gig.id),
    conflictPayloadFromGig, normaliseRating, now: () => timestamp
  });
  return { database, service, findGig, contributionUpdates, timestamp };
}

describe('shared-show orchestration', () => {
  test('keeps the owner, accepts known peers and drops duplicates or unknown attendees', () => {
    const view = fixture();
    assert.deepEqual(view.service.normaliseAttendees([
      { id: 'peer-1', name: 'Forged name' }, { id: 'peer-1' }, { id: 'missing' }, { id: 'owner' }
    ], { id: 'owner', name: 'Archive Owner' }), [
      { id: 'owner', type: 'owner', name: 'Archive Owner' }, { id: 'peer-1', type: 'peer', name: 'Alex' }
    ]);
    view.database.close();
  });

  test('creates a shared show and persists attendees and partial review edits', () => {
    const view = fixture();
    const created = view.service.create('gig-1', 'owner');
    assert.equal(created.id, 'shared-1');
    assert.equal(created.attendees[0].name, 'Archive Owner');
    assert.equal(created.contributions[0].participantName, 'Archive Owner');
    const attended = view.service.addAttendee('shared-1', 'friend-profile');
    assert.deepEqual(attended.attendees.map((entry) => entry.name), ['Archive Owner', 'Sam']);
    view.service.updateReview('shared-1', 'owner', { performanceRating: 5, favorite: true, notes: ' Brilliant ' });
    const reviewed = view.service.updateReview('shared-1', 'owner', { notes: 'Updated memory' });
    assert.deepEqual(reviewed.reviews.map(({ performanceRating, favorite, notes }) => ({ performanceRating, favorite, notes })), [
      { performanceRating: 5, favorite: true, notes: 'Updated memory' }
    ]);
    assert.throws(() => view.service.addAttendee('missing', 'owner'), /Shared show not found/);
    view.database.close();
  });

  test('resolves simultaneous edits and applies matching remote media assignments transactionally', () => {
    const view = fixture();
    view.service.create('gig-1', 'owner');
    view.database.prepare(`INSERT INTO gig_media
      (id, gig_id, filename, mime_type, caption, category, song_index, size, checksum, created_at)
      VALUES (?, ?, ?, ?, '', 'show', NULL, ?, ?, ?)`).run('media-1', 'gig-1', 'clip.mp4', 'video/mp4', 100, 'same-hash', view.timestamp);
    const local = view.findGig('gig-1');
    const remote = {
      notes: 'Peer memory', venueNotes: 'Peer venue note', performanceRating: 5, venueRating: 2, favorite: true,
      songs: [{ title: 'Peer song', artist: 'Artist' }],
      media: [{ checksum: 'same-hash', songIndex: 0, playbackPreferred: true, playbackStart: 12, playbackEnd: 60,
        playbackClips: [{ songIndex: 0, startSeconds: 12, endSeconds: 60, priority: 0 }] }]
    };
    view.database.prepare(`INSERT INTO peer_sync_conflicts
      (id, shared_gig_id, peer_id, local_gig_id, local_payload, remote_payload, remote_snapshot, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '{}', 'open', ?)`).run('conflict-1', 'shared-1', 'peer-1', 'gig-1', JSON.stringify(local), JSON.stringify(remote), view.timestamp);
    view.database.prepare(`INSERT INTO notifications (id, type, peer_id, shared_gig_id, title, created_at)
      VALUES ('notice-1', 'peer-sync-conflict', 'peer-1', 'shared-1', 'Review edits', ?)`).run(view.timestamp);
    const result = view.service.resolveConflict('conflict-1', { notes: 'merge', ratings: 'remote', setlist: 'remote', media: 'remote' });
    assert.match(result.gig.performanceNotes, /Local memory\n\nPeer memory/);
    assert.equal(result.gig.performanceRating, 5);
    assert.deepEqual(result.gig.songs, remote.songs);
    assert.deepEqual(result.gig.media[0].playbackClips, [{ songIndex: 0, startSeconds: 12, endSeconds: 60, priority: 0 }]);
    assert.equal(view.database.prepare('SELECT status FROM peer_sync_conflicts WHERE id = ?').get('conflict-1').status, 'resolved');
    assert.equal(view.database.prepare('SELECT read_at AS readAt FROM notifications WHERE id = ?').get('notice-1').readAt, view.timestamp);
    assert.deepEqual(view.contributionUpdates, ['gig-1']);
    assert.throws(() => view.service.resolveConflict('conflict-1', {}), /already resolved/);
    view.database.close();
  });
});
