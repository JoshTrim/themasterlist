'use strict';

function createGigRepository({ database, mediaRows }) {
  function mapRow(row) {
    return {
      id: row.id,
      sharedId: row.shared_id || row.id,
      artist: row.artist,
      venue: row.venue,
      city: row.city,
      date: row.date,
      notes: row.notes,
      performanceNotes: row.performance_notes,
      venueNotes: row.venue_notes,
      performanceRating: row.performance_rating,
      venueRating: row.venue_rating,
      favorite: Boolean(row.favorite),
      setlistFmId: row.setlist_fm_id,
      setlistFmUrl: row.setlist_fm_url,
      songs: JSON.parse(row.songs || '[]'),
      attendees: JSON.parse(row.attendees || '[]'),
      media: mediaRows(row.id),
      createdAt: row.created_at
    };
  }

  async function readAll() {
    return database.prepare('SELECT * FROM gigs ORDER BY favorite DESC, date DESC').all().map(mapRow);
  }

  async function writeAll(gigs) {
    const insert = database.prepare(`
      INSERT INTO gigs (id, shared_id, artist, venue, city, date, notes, performance_notes, venue_notes,
        performance_rating, venue_rating, favorite, setlist_fm_id, setlist_fm_url, songs, attendees, created_at)
      VALUES (@id, @sharedId, @artist, @venue, @city, @date, @notes, @performanceNotes, @venueNotes,
        @performanceRating, @venueRating, @favorite, @setlistFmId, @setlistFmUrl, @songs, @attendees, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        shared_id = excluded.shared_id, artist = excluded.artist, venue = excluded.venue, city = excluded.city, date = excluded.date,
        notes = excluded.notes, performance_notes = excluded.performance_notes, venue_notes = excluded.venue_notes,
        performance_rating = excluded.performance_rating, venue_rating = excluded.venue_rating, favorite = excluded.favorite,
        setlist_fm_id = excluded.setlist_fm_id, setlist_fm_url = excluded.setlist_fm_url, songs = excluded.songs, attendees = excluded.attendees
    `);
    database.transaction((records) => {
      for (const gig of records) insert.run({
        ...gig,
        sharedId: gig.sharedId || gig.id,
        notes: gig.notes || '',
        performanceNotes: gig.performanceNotes || gig.notes || '',
        venueNotes: gig.venueNotes || '',
        performanceRating: gig.performanceRating ?? null,
        venueRating: gig.venueRating ?? null,
        favorite: gig.favorite ? 1 : 0,
        setlistFmId: gig.setlistFmId || null,
        setlistFmUrl: gig.setlistFmUrl || null,
        songs: JSON.stringify(gig.songs || []),
        attendees: JSON.stringify(gig.attendees || []),
        createdAt: gig.createdAt || new Date().toISOString()
      });
    })(gigs);
  }

  function find(id) {
    const row = database.prepare('SELECT * FROM gigs WHERE id = ?').get(id);
    if (!row) throw new Error('Gig not found.');
    return mapRow(row);
  }

  return { readAll, writeAll, find };
}

module.exports = { createGigRepository };
