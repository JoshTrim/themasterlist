function summarizeHealth({ gigs, geocodes, artistInfo, venueInfo }) {
  const issues = [];
  const artists = new Map();
  const venues = new Map();
  for (const gig of gigs) {
    const songs = Array.isArray(gig.songs) ? gig.songs : [];
    if (!songs.length) issues.push({ id: `setlist:${gig.id}`, type: 'setlist', title: gig.artist, detail: `${gig.venue} · ${gig.date || 'Date unknown'} has no setlist`, repairable: false, href: `/edit?id=${encodeURIComponent(gig.id)}` });
    const missingAlbums = songs.filter((song) => !String(song.album || '').trim() || /^unknown album$/i.test(String(song.album).trim())).length;
    if (missingAlbums) issues.push({ id: `albums:${gig.id}`, type: 'albums', key: gig.id, title: gig.artist, detail: `${missingAlbums} of ${songs.length} tracks need album metadata`, repairable: true, href: `/edit?id=${encodeURIComponent(gig.id)}` });
    const artistKey = gig.artist.trim().toLowerCase();
    if (!artists.has(artistKey)) artists.set(artistKey, gig.artist.trim());
    const venueKey = `${gig.venue}|${gig.city}`.toLowerCase();
    if (!venues.has(venueKey)) venues.set(venueKey, { name: gig.venue, city: gig.city });
  }
  for (const [key, name] of artists) {
    const info = artistInfo(key);
    if (!info?.bio || !info?.image) issues.push({ id: `artist:${key}`, type: 'artist', key: name, title: name, detail: !info ? 'Artist profile has not been fetched' : `Artist profile is missing ${[!info.bio && 'bio', !info.image && 'photo'].filter(Boolean).join(' and ')}`, repairable: true, href: `/artist?name=${encodeURIComponent(name)}` });
  }
  for (const [key, venue] of venues) {
    const info = venueInfo(key);
    if (!(info?.bio || info?.description) || !info?.image) issues.push({ id: `venue:${key}`, type: 'venue', key, name: venue.name, city: venue.city, title: venue.name, detail: !info ? `${venue.city} venue profile has not been fetched` : `Venue profile is missing ${[!(info.bio || info.description) && 'bio', !info.image && 'photo'].filter(Boolean).join(' and ')}`, repairable: true, href: `/venue?name=${encodeURIComponent(venue.name)}&city=${encodeURIComponent(venue.city)}` });
    if (!geocodes[key]) issues.push({ id: `location:${key}`, type: 'location', key, name: venue.name, city: venue.city, title: venue.name, detail: `No map coordinates stored for ${venue.city}`, repairable: true, href: '/map' });
  }
  const counts = issues.reduce((result, issue) => { result[issue.type] = (result[issue.type] || 0) + 1; return result; }, {});
  return { totalShows: gigs.length, healthy: issues.length === 0, counts, issues };
}

function createArchiveHealthService({ readGigs, readGeocodes, artistInfo, venueInfo }) {
  async function report() {
    return summarizeHealth({ gigs: await readGigs(), geocodes: await readGeocodes(), artistInfo, venueInfo });
  }
  return { report };
}

module.exports = { summarizeHealth, createArchiveHealthService };
