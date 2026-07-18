const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const HEADERS = { 'User-Agent': 'TheMasterList/0.1 personal-live-music-archive', 'Accept-Language': 'en' };

function validCoordinates(lat, lng) {
  return Number.isFinite(Number(lat)) && Number(lat) >= -90 && Number(lat) <= 90
    && Number.isFinite(Number(lng)) && Number(lng) >= -180 && Number(lng) <= 180;
}

function createGeocodingService({ fetch: request = globalThis.fetch, read, write, wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), now = Date.now, minimumIntervalMs = 1_000 }) {
  if (typeof request !== 'function') throw new TypeError('A fetch implementation is required.');
  if (typeof read !== 'function' || typeof write !== 'function') throw new TypeError('A geocode store is required.');
  let lastLookup = 0;

  async function search(address) {
    const remaining = minimumIntervalMs - (now() - lastLookup);
    if (lastLookup && remaining > 0) await wait(remaining);
    const query = new URL(NOMINATIM_ENDPOINT);
    query.searchParams.set('q', address); query.searchParams.set('format', 'jsonv2'); query.searchParams.set('limit', '1');
    const response = await request(query, { headers: HEADERS });
    lastLookup = now();
    const match = response.ok ? (await response.json())[0] : null;
    return match && validCoordinates(match.lat, match.lon) ? { lat: Number(match.lat), lng: Number(match.lon) } : null;
  }

  async function get(key) {
    return (await read())[String(key || '').toLowerCase()] || null;
  }

  async function set(key, coordinates) {
    if (!validCoordinates(coordinates?.lat, coordinates?.lng)) throw new Error('Invalid map coordinates.');
    const values = await read();
    values[String(key || '').toLowerCase()] = { lat: Number(coordinates.lat), lng: Number(coordinates.lng) };
    await write(values);
    return values[String(key || '').toLowerCase()];
  }

  async function remove(key) {
    const values = await read();
    delete values[String(key || '').toLowerCase()];
    await write(values);
  }

  async function locationsForGigs(gigs) {
    const geocodes = await read();
    const locations = new Map();
    let changed = false;
    for (const gig of gigs) {
      const key = `${gig.venue}|${gig.city}`.toLowerCase();
      if (!(key in geocodes)) {
        geocodes[key] = await search(`${gig.venue}, ${gig.city}`);
        changed = true;
      }
      const coordinates = geocodes[key];
      if (!coordinates) continue;
      if (!locations.has(key)) locations.set(key, { ...coordinates, venue: gig.venue, city: gig.city, gigs: [] });
      locations.get(key).gigs.push({ id: gig.id, artist: gig.artist, date: gig.date });
    }
    if (changed) await write(geocodes);
    return [...locations.values()];
  }

  return { search, get, set, remove, read, locationsForGigs };
}

module.exports = { NOMINATIM_ENDPOINT, HEADERS, validCoordinates, createGeocodingService };
