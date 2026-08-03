(function exposeDirectoryUi(root, factory) {
  const directoryUi = factory();
  if (typeof module === 'object' && module.exports) module.exports = directoryUi;
  else root.MasterListDirectoryUi = directoryUi;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createDirectoryUi() {
  const normalize = (value) => String(value || '').trim().toLocaleLowerCase();
  function initials(name) { return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '♪'; }
  function ratingFor(show) { const local = Number(show.performanceRating || 0); return local || Math.max(0, ...(show.contributions || []).map((entry) => Number(entry.performanceRating || 0))); }
  function missingFields(type, info = {}, hasLocation = true) {
    const missing = [];
    if (!String(info.image || '').trim()) missing.push('photo');
    if (!String(info.bio || (type === 'venue' ? info.description : '') || '').trim()) missing.push('bio');
    if (!String(info.source || '').trim()) missing.push('source');
    if (type === 'venue' && !hasLocation) missing.push('location');
    return missing;
  }
  function filterMatches(entity, filter) { if (!filter || filter === 'all') return true; if (filter === 'incomplete') return entity.missingMetadata.length > 0; return entity.missingMetadata.includes(filter.replace('missing-', '')); }
  function performers(show) { return [{ name: show.artist, role: 'Headliner' }, ...(show.acts || []).map((act) => ({ name: act.artist, role: act.role }))].filter((entry) => normalize(entry.name)); }

  function buildArtists(shows, metadata = new Map()) {
    const records = new Map();
    shows.forEach((show) => {
      performers(show).forEach((performer) => {
        const key = normalize(performer.name);
        if (!records.has(key)) records.set(key, { key, name: performer.name, shows: 0, venues: new Set(), latestDate: '', ratings: [], favourites: 0 });
        const record = records.get(key); record.shows += 1; record.venues.add(normalize(`${show.venue}|${show.city}`));
        if (show.date > record.latestDate) record.latestDate = show.date;
        const rating = performer.role === 'Headliner' ? ratingFor(show) : 0; if (rating) record.ratings.push(rating);
        if (show.favorite || show.contributions?.some((entry) => entry.favorite)) record.favourites += 1;
      });
    });
    return [...records.values()].map((record) => { const info = metadata.get(record.key) || {}; return { ...record, image: info.image || '', imagePosition: info.imagePosition || 'center', description: info.description || '', missingMetadata: missingFields('artist', info), averageRating: record.ratings.length ? record.ratings.reduce((sum, rating) => sum + rating, 0) / record.ratings.length : 0 }; });
  }

  function buildVenues(shows, metadata = new Map(), locations = new Set()) {
    const records = new Map();
    shows.forEach((show) => {
      const key = normalize(`${show.venue}|${show.city}`); if (!normalize(show.venue)) return;
      if (!records.has(key)) records.set(key, { key, name: show.venue, city: show.city, shows: 0, artists: new Set(), latestDate: '', favourites: 0 });
      const record = records.get(key); record.shows += 1; performers(show).forEach((performer) => record.artists.add(normalize(performer.name)));
      if (show.date > record.latestDate) record.latestDate = show.date;
      if (show.favorite || show.contributions?.some((entry) => entry.favorite)) record.favourites += 1;
    });
    return [...records.values()].map((record) => { const info = metadata.get(record.key) || {}; const hasLocation = locations.has(record.key); return { ...record, image: info.image || '', imagePosition: info.imagePosition || 'center', description: info.description || '', isClosed: Boolean(info.isClosed), missingMetadata: missingFields('venue', info, hasLocation), hasLocation }; });
  }

  function visibleEntities(entities, { type, query = '', metadata = 'all', sort = 'shows' } = {}) {
    const needle = normalize(query);
    return entities.filter((entity) => (!needle || normalize(type === 'venue' ? `${entity.name} ${entity.city}` : entity.name).includes(needle)) && filterMatches(entity, metadata)).sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name) || String(a.city || '').localeCompare(String(b.city || ''));
      if (sort === 'recent') return (b.latestDate || '').localeCompare(a.latestDate || '') || a.name.localeCompare(b.name);
      if (sort === 'rating' && type === 'artist') return b.averageRating - a.averageRating || b.shows - a.shows || a.name.localeCompare(b.name);
      return b.shows - a.shows || (b.latestDate || '').localeCompare(a.latestDate || '') || a.name.localeCompare(b.name);
    });
  }

  function editorEntries(shows, type) {
    const entities = new Map();
    shows.forEach((show) => {
      const entries = type === 'artist' ? performers(show).map((performer) => ({ name: performer.name, city: '' })) : [{ name: show.venue, city: show.city }];
      entries.forEach(({ name, city }) => { const key = normalize(`${name}|${city}`); if (name && !entities.has(key)) entities.set(key, { name, city }); });
    });
    return [...entities.values()].sort((a, b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city));
  }

  function validateImage(file) {
    if (!file) return null;
    if (file.size > 8 * 1024 * 1024) throw new Error('Profile photos must be 8 MB or smaller.');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP or GIF image.');
    return file;
  }

  return { normalize, initials, ratingFor, missingFields, filterMatches, performers, buildArtists, buildVenues, visibleEntities, editorEntries, validateImage };
}));
