'use strict';

const { syncPayloadHash, mergeText, mergeSongs, averageRating } = require('./sync-merge');

function createSharedShows({
  database, peerRows, instanceRow, findGig, contributionRows, upsertLocalContribution,
  conflictPayloadFromGig, normaliseRating, now = () => new Date().toISOString()
}) {
  function profiles() {
    return database.prepare('SELECT id, name, created_at AS createdAt FROM profiles ORDER BY name COLLATE NOCASE').all();
  }

  function requireProfile(profileId) {
    const profile = database.prepare('SELECT id, name FROM profiles WHERE id = ?').get(profileId);
    if (!profile) throw new Error('Choose a profile first.');
    return profile;
  }

  function normaliseAttendees(value, account) {
    const owner = account ? { id: account.id, type: 'owner', name: account.name } : null;
    const peers = new Map(peerRows().map((peer) => [peer.peerId, { id: peer.peerId, type: 'peer', name: peer.name }]));
    const attendees = owner ? [owner] : [];
    for (const entry of Array.isArray(value) ? value : []) {
      const peerId = String(entry?.id || '').trim();
      if (peers.has(peerId) && !attendees.some((attendee) => attendee.id === peerId)) attendees.push(peers.get(peerId));
    }
    return attendees;
  }

  function rows() {
    const shows = database.prepare('SELECT * FROM shared_shows ORDER BY date DESC').all();
    const attendees = database.prepare(`
      SELECT a.show_id AS showId, p.id, p.name
      FROM shared_attendees a JOIN profiles p ON p.id = a.profile_id
      ORDER BY p.name COLLATE NOCASE
    `).all();
    const reviews = database.prepare(`
      SELECT r.show_id AS showId, r.profile_id AS profileId, p.name,
        r.performance_rating AS performanceRating, r.venue_rating AS venueRating,
        r.favorite, r.notes, r.updated_at AS updatedAt
      FROM shared_reviews r JOIN profiles p ON p.id = r.profile_id
    `).all();
    return shows.map((show) => ({
      id: show.id,
      sourceGigId: show.source_gig_id,
      artist: show.artist,
      venue: show.venue,
      city: show.city,
      date: show.date,
      setlistFmId: show.setlist_fm_id,
      setlistFmUrl: show.setlist_fm_url,
      songs: JSON.parse(show.songs || '[]'),
      createdAt: show.created_at,
      attendees: attendees.filter((person) => person.showId === show.id),
      reviews: reviews.filter((review) => review.showId === show.id).map((review) => ({ ...review, favorite: Boolean(review.favorite) })),
      contributions: contributionRows(show.id)
    }));
  }

  function show(id) { return rows().find((entry) => entry.id === id); }

  function create(sourceGigId, profileId) {
    const profile = requireProfile(profileId);
    const gig = findGig(sourceGigId);
    const existing = database.prepare('SELECT id FROM shared_shows WHERE source_gig_id = ?').get(sourceGigId);
    if (existing) return show(existing.id);
    const id = gig.sharedId || gig.id;
    const timestamp = now();
    database.prepare(`INSERT INTO shared_shows
      (id, source_gig_id, artist, venue, city, date, setlist_fm_id, setlist_fm_url, songs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET source_gig_id=excluded.source_gig_id, artist=excluded.artist,
        venue=excluded.venue, city=excluded.city, date=excluded.date, setlist_fm_id=excluded.setlist_fm_id,
        setlist_fm_url=excluded.setlist_fm_url, songs=excluded.songs`).run(
      id, sourceGigId, gig.artist, gig.venue, gig.city, gig.date, gig.setlistFmId, gig.setlistFmUrl, JSON.stringify(gig.songs || []), timestamp
    );
    database.prepare('INSERT INTO shared_attendees (show_id, profile_id, joined_at) VALUES (?, ?, ?)').run(id, profile.id, timestamp);
    database.prepare(`INSERT INTO shared_gig_contributions
      (shared_gig_id, instance_id, local_gig_id, participant_name, performance_rating, venue_rating, favorite, performance_notes, venue_notes, media_manifest, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, instanceRow().instanceId, gig.id, profile.name, gig.performanceRating ?? null, gig.venueRating ?? null,
      gig.favorite ? 1 : 0, gig.performanceNotes || gig.notes || '', gig.venueNotes || '', JSON.stringify(gig.media || []), timestamp
    );
    return show(id);
  }

  function addAttendee(showId, profileId) {
    requireProfile(profileId);
    if (!database.prepare('SELECT id FROM shared_shows WHERE id = ?').get(showId)) throw new Error('Shared show not found.');
    database.prepare('INSERT OR IGNORE INTO shared_attendees (show_id, profile_id, joined_at) VALUES (?, ?, ?)').run(showId, profileId, now());
    return show(showId);
  }

  function updateReview(showId, profileId, body = {}) {
    if (!database.prepare('SELECT id FROM shared_shows WHERE id = ?').get(showId)) throw new Error('Shared show not found.');
    const existing = database.prepare('SELECT performance_rating AS performanceRating, venue_rating AS venueRating, favorite, notes FROM shared_reviews WHERE show_id = ? AND profile_id = ?').get(showId, profileId);
    const performanceRating = 'performanceRating' in body ? normaliseRating(body.performanceRating) : existing?.performanceRating || null;
    const venueRating = 'venueRating' in body ? normaliseRating(body.venueRating) : existing?.venueRating || null;
    const favorite = 'favorite' in body ? (body.favorite ? 1 : 0) : (existing?.favorite || 0);
    const notes = 'notes' in body ? String(body.notes || '').trim() : (existing?.notes || '');
    database.prepare(`INSERT INTO shared_reviews (show_id, profile_id, performance_rating, venue_rating, favorite, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(show_id, profile_id) DO UPDATE SET performance_rating=excluded.performance_rating,
        venue_rating=excluded.venue_rating, favorite=excluded.favorite, notes=excluded.notes, updated_at=excluded.updated_at`).run(
      showId, profileId, performanceRating, venueRating, favorite, notes, now()
    );
    return show(showId);
  }

  function applyRemoteMediaAssignments(localGigId, localMedia, remoteMedia, mode) {
    const remoteByKey = new Map();
    for (const item of remoteMedia || []) {
      for (const key of [item.checksum && `hash:${item.checksum}`, item.externalUrl && `url:${item.externalUrl}`, item.id && `id:${item.id}`].filter(Boolean)) remoteByKey.set(key, item);
    }
    for (const local of localMedia || []) {
      const remote = [local.checksum && `hash:${local.checksum}`, local.externalUrl && `url:${local.externalUrl}`, local.id && `id:${local.id}`]
        .filter(Boolean).map((key) => remoteByKey.get(key)).find(Boolean);
      if (!remote || (mode === 'merge' && local.songIndex !== null && local.songIndex !== undefined)) continue;
      const remoteSongIndex = remote.songIndex !== null && remote.songIndex !== undefined && Number.isInteger(Number(remote.songIndex)) && Number(remote.songIndex) >= 0 ? Number(remote.songIndex) : null;
      const remoteStart = remote.playbackStart !== null && remote.playbackStart !== undefined && Number.isFinite(Number(remote.playbackStart)) ? Number(remote.playbackStart) : null;
      const remoteEnd = remote.playbackEnd !== null && remote.playbackEnd !== undefined && Number.isFinite(Number(remote.playbackEnd)) ? Number(remote.playbackEnd) : null;
      database.prepare('UPDATE gig_media SET song_index = ?, playback_preferred = ?, playback_start = ?, playback_end = ? WHERE id = ? AND gig_id = ?').run(
        remoteSongIndex, remote.playbackPreferred ? 1 : 0, remoteStart, remoteEnd, local.id, localGigId
      );
      if (Array.isArray(remote.playbackClips) && (mode === 'remote' || !local.playbackClips?.length)) {
        database.prepare('DELETE FROM media_playback_clips WHERE media_id = ?').run(local.id);
        const insert = database.prepare(`INSERT INTO media_playback_clips
          (media_id, song_index, start_seconds, end_seconds, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        const timestamp = now();
        for (const clip of remote.playbackClips) {
          const songIndex = Number(clip.songIndex);
          if (!Number.isInteger(songIndex) || songIndex < 0) continue;
          const start = clip.startSeconds !== null && clip.startSeconds !== undefined && Number.isFinite(Number(clip.startSeconds)) ? Number(clip.startSeconds) : null;
          const end = clip.endSeconds !== null && clip.endSeconds !== undefined && Number.isFinite(Number(clip.endSeconds)) ? Number(clip.endSeconds) : null;
          insert.run(local.id, songIndex, start, end, Math.max(0, Number(clip.priority) || 0), timestamp, timestamp);
        }
      }
    }
  }

  function resolveConflict(id, choices = {}) {
    const row = database.prepare("SELECT * FROM peer_sync_conflicts WHERE id = ? AND status = 'open'").get(id);
    if (!row) throw new Error('Sync conflict not found or already resolved.');
    const gig = findGig(row.local_gig_id);
    const local = conflictPayloadFromGig(gig);
    const remote = JSON.parse(row.remote_payload);
    const valid = (value, allowed, fallback = 'local') => allowed.includes(value) ? value : fallback;
    const notesChoice = valid(choices.notes, ['local', 'remote', 'merge']);
    const ratingsChoice = valid(choices.ratings, ['local', 'remote', 'merge']);
    const setlistChoice = valid(choices.setlist, ['local', 'remote', 'merge']);
    const mediaChoice = valid(choices.media, ['local', 'remote', 'merge']);
    const chooseText = (field) => notesChoice === 'remote' ? remote[field] : notesChoice === 'merge' ? mergeText(local[field], remote[field]) : local[field];
    const performanceRating = ratingsChoice === 'remote' ? remote.performanceRating : ratingsChoice === 'merge' ? averageRating(local.performanceRating, remote.performanceRating) : local.performanceRating;
    const venueRating = ratingsChoice === 'remote' ? remote.venueRating : ratingsChoice === 'merge' ? averageRating(local.venueRating, remote.venueRating) : local.venueRating;
    const favorite = ratingsChoice === 'remote' ? remote.favorite : ratingsChoice === 'merge' ? Boolean(local.favorite || remote.favorite) : local.favorite;
    const songs = setlistChoice === 'remote' ? remote.songs : setlistChoice === 'merge' ? mergeSongs(local.songs, remote.songs) : local.songs;
    const resolution = { notes: notesChoice, ratings: ratingsChoice, setlist: setlistChoice, media: mediaChoice };
    database.transaction(() => {
      database.prepare(`UPDATE gigs SET notes = ?, performance_notes = ?, venue_notes = ?, performance_rating = ?, venue_rating = ?, favorite = ?, songs = ? WHERE id = ?`).run(
        chooseText('notes'), chooseText('notes'), chooseText('venueNotes'), performanceRating, venueRating, favorite ? 1 : 0, JSON.stringify(songs || []), gig.id
      );
      if (mediaChoice !== 'local') applyRemoteMediaAssignments(gig.id, local.media, remote.media, mediaChoice);
      const resolvedGig = findGig(gig.id);
      upsertLocalContribution(resolvedGig);
      const timestamp = now();
      database.prepare(`INSERT INTO peer_sync_baselines (shared_gig_id, peer_id, local_hash, remote_hash, synced_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(shared_gig_id, peer_id) DO UPDATE SET
        local_hash=excluded.local_hash, remote_hash=excluded.remote_hash, synced_at=excluded.synced_at`).run(
        row.shared_gig_id, row.peer_id, syncPayloadHash(conflictPayloadFromGig(resolvedGig)), syncPayloadHash(remote), timestamp
      );
      database.prepare("UPDATE peer_sync_conflicts SET status = 'resolved', resolved_at = ?, resolution = ? WHERE id = ?").run(timestamp, JSON.stringify(resolution), id);
      database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE type = 'peer-sync-conflict' AND shared_gig_id = ? AND peer_id = ?").run(timestamp, row.shared_gig_id, row.peer_id);
    })();
    return { ok: true, resolution, gig: findGig(gig.id) };
  }

  return { profiles, requireProfile, normaliseAttendees, rows, create, addAttendee, updateReview, applyRemoteMediaAssignments, resolveConflict };
}

module.exports = { createSharedShows };
