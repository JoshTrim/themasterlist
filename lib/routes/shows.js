function createShowRoutes({ database, readGigs, readBody, sendJson, sendError, validateGig, normaliseRating, normaliseAttendees, randomUUID, now = () => new Date().toISOString() }) {
  return async function handleShowRoute(request, response, url) {
    if (request.method === 'GET' && url.pathname === '/api/gigs') {
      const gigs = await readGigs(); sendJson(response, 200, gigs.sort((a, b) => b.date.localeCompare(a.date))); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/gigs') {
      const gig = await readBody(request); validateGig(gig);
      const record = { id: randomUUID(), sharedId: randomUUID(), artist: gig.artist.trim(), venue: gig.venue.trim(), city: gig.city.trim(), date: String(gig.date || '').trim(), notes: String(gig.notes || '').trim(), performanceNotes: String(gig.performanceNotes || gig.notes || '').trim(), venueNotes: String(gig.venueNotes || '').trim(), performanceRating: normaliseRating(gig.performanceRating), venueRating: normaliseRating(gig.venueRating), favorite: gig.favorite === true || gig.favorite === 'true', setlistFmId: gig.setlistFmId || null, setlistFmUrl: gig.setlistFmUrl || null, songs: Array.isArray(gig.songs) ? gig.songs : [], attendees: normaliseAttendees(gig.attendees, request.account), createdAt: now() };
      database.prepare(`INSERT INTO gigs (id, shared_id, artist, venue, city, date, notes, performance_notes, venue_notes, performance_rating, venue_rating, favorite, setlist_fm_id, setlist_fm_url, songs, attendees, created_at)
        VALUES (@id, @sharedId, @artist, @venue, @city, @date, @notes, @performanceNotes, @venueNotes, @performanceRating, @venueRating, @favorite, @setlistFmId, @setlistFmUrl, @songs, @attendees, @createdAt)`).run({ ...record, performanceRating: record.performanceRating ?? null, venueRating: record.venueRating ?? null, favorite: record.favorite ? 1 : 0, songs: JSON.stringify(record.songs), attendees: JSON.stringify(record.attendees) });
      sendJson(response, 201, record); return true;
    }
    const match = url.pathname.match(/^\/api\/gigs\/([\w-]+)$/);
    if (!match) return false;
    if (request.method === 'PATCH') {
      const update = await readBody(request); const gigs = await readGigs(); const gig = gigs.find((entry) => entry.id === match[1]);
      if (!gig) { sendError(response, 404, 'Gig not found'); return true; }
      for (const field of ['artist', 'venue', 'city', 'date']) if (field in update) gig[field] = String(update[field] || '').trim();
      if ('attendees' in update) gig.attendees = normaliseAttendees(update.attendees, request.account);
      if ('songs' in update && Array.isArray(update.songs)) gig.songs = update.songs.map((song, index) => {
        const existing = gig.songs[index] || {}; const merged = { ...existing, ...song, title: String(song.title || '').trim(), artist: String(song.artist ?? existing.artist ?? '').trim(), album: String(song.album ?? existing.album ?? '').trim() || null, encore: 'encore' in song ? Boolean(song.encore) : Boolean(existing.encore), position: index + 1, info: String(song.info ?? existing.info ?? '').trim(), startSeconds: song.startSeconds === '' || song.startSeconds == null ? null : Number(song.startSeconds), endSeconds: song.endSeconds === '' || song.endSeconds == null ? null : Number(song.endSeconds) };
        if (!Number.isFinite(merged.startSeconds)) merged.startSeconds = null; if (!Number.isFinite(merged.endSeconds)) merged.endSeconds = null; return merged;
      }).filter((song) => song.title);
      if ('favorite' in update) gig.favorite = update.favorite === true;
      if ('performanceRating' in update) gig.performanceRating = normaliseRating(update.performanceRating);
      if ('venueRating' in update) gig.venueRating = normaliseRating(update.venueRating);
      if ('performanceNotes' in update) gig.performanceNotes = String(update.performanceNotes || '').trim();
      if ('venueNotes' in update) gig.venueNotes = String(update.venueNotes || '').trim();
      validateGig(gig);
      database.prepare(`UPDATE gigs SET artist = ?, venue = ?, city = ?, date = ?, songs = ?, attendees = ?, favorite = ?, performance_rating = ?, venue_rating = ?, performance_notes = ?, venue_notes = ?, notes = ? WHERE id = ?`).run(gig.artist, gig.venue, gig.city, gig.date, JSON.stringify(gig.songs || []), JSON.stringify(gig.attendees || []), gig.favorite ? 1 : 0, gig.performanceRating ?? null, gig.venueRating ?? null, gig.performanceNotes || '', gig.venueNotes || '', gig.notes || '', gig.id);
      sendJson(response, 200, gig); return true;
    }
    if (request.method === 'DELETE') {
      const result = database.prepare('DELETE FROM gigs WHERE id = ?').run(match[1]);
      if (!result.changes) sendError(response, 404, 'Gig not found'); else sendJson(response, 200, { ok: true });
      return true;
    }
    return false;
  };
}

module.exports = { createShowRoutes };
