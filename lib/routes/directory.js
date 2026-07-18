'use strict';

function createDirectoryRoutes({
  database, requireAccount, readBody, sendJson, sendError, fetchArtistInfo, fetchVenueInfo,
  cachedArtistGenres, saveArtistGenres, normaliseImagePosition, saveProfileImageUpload,
  removeReplacedProfileImage, geocoding, validCoordinates, now = () => new Date().toISOString()
}) {
  return async function handleDirectoryRoute(request, response, url) {
    if (request.method === 'GET' && url.pathname === '/api/directory/metadata') {
      requireAccount(request);
      const artists = database.prepare('SELECT lookup_name AS lookupName, title, description, bio, image, image_position AS imagePosition, source, is_manual AS isManual FROM artist_info').all();
      const venues = database.prepare('SELECT lookup_name AS lookupName, title, description, bio, image, image_position AS imagePosition, source, is_manual AS isManual, is_closed AS isClosed FROM venue_info').all();
      const locations = Object.entries(await geocoding.read())
        .filter(([, coordinates]) => Number.isFinite(Number(coordinates?.lat)) && Number.isFinite(Number(coordinates?.lng)))
        .map(([key]) => key);
      sendJson(response, 200, { artists, venues, locations }); return true;
    }

    if (request.method === 'GET' && url.pathname === '/api/artists') {
      const info = await fetchArtistInfo(url.searchParams.get('name'));
      const genres = cachedArtistGenres(info.name)?.genres || [];
      sendJson(response, 200, { ...info, imagePosition: normaliseImagePosition(info.imagePosition), genres }); return true;
    }

    if (request.method === 'GET' && url.pathname === '/api/venues') {
      const name = url.searchParams.get('name'); const city = url.searchParams.get('city');
      const info = await fetchVenueInfo(name, city);
      const lookupName = `${String(name || '').trim()}|${String(city || '').trim()}`.toLowerCase();
      const coordinates = await geocoding.get(lookupName);
      sendJson(response, 200, { ...info, imagePosition: normaliseImagePosition(info.imagePosition), isClosed: Boolean(info.isClosed), coordinates }); return true;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/artists') {
      requireAccount(request);
      const name = String(url.searchParams.get('name') || '').trim();
      if (!name) { sendError(response, 400, 'An artist name is required.'); return true; }
      const body = await readBody(request); const lookupName = name.toLowerCase();
      const existing = database.prepare('SELECT title, description, bio, image, image_position AS imagePosition, source FROM artist_info WHERE lookup_name = ?').get(lookupName);
      const uploadedImage = await saveProfileImageUpload(body.imageUpload);
      const info = {
        title: String(body.title ?? existing?.title ?? name).trim(), description: String(body.description ?? existing?.description ?? '').trim(),
        bio: String(body.bio ?? existing?.bio ?? '').trim(), image: uploadedImage || String(body.image ?? existing?.image ?? '').trim() || null,
        imagePosition: normaliseImagePosition(body.imagePosition ?? existing?.imagePosition), source: String(body.source ?? existing?.source ?? '').trim() || null
      };
      const genres = Object.prototype.hasOwnProperty.call(body, 'genres') ? saveArtistGenres(name, body.genres, 'manual') : (cachedArtistGenres(name)?.genres || []);
      database.prepare('INSERT OR REPLACE INTO artist_info (lookup_name, title, description, bio, image, image_position, is_manual, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.imagePosition, info.source, now());
      await removeReplacedProfileImage(existing?.image, info.image);
      sendJson(response, 200, { name, ...info, genres }); return true;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/venues') {
      requireAccount(request);
      const name = String(url.searchParams.get('name') || '').trim(); const city = String(url.searchParams.get('city') || '').trim();
      if (!name) { sendError(response, 400, 'A venue name is required.'); return true; }
      const body = await readBody(request); const lookupName = `${name}|${city}`.toLowerCase();
      const existing = database.prepare('SELECT title, description, bio, image, image_position AS imagePosition, is_closed AS isClosed, source FROM venue_info WHERE lookup_name = ?').get(lookupName);
      let coordinates = await geocoding.get(lookupName);
      const address = String(body.locationAddress || '').trim(); const latitudeValue = String(body.latitude ?? '').trim(); const longitudeValue = String(body.longitude ?? '').trim();
      if (address) {
        coordinates = await geocoding.search(address);
        if (!coordinates) { sendError(response, 404, 'That address could not be found. Try including the suburb, city and country.'); return true; }
      } else if (latitudeValue || longitudeValue) {
        const lat = Number(latitudeValue); const lng = Number(longitudeValue);
        if (!validCoordinates(lat, lng)) { sendError(response, 400, 'Enter valid latitude and longitude coordinates.'); return true; }
        coordinates = { lat, lng };
      }
      const uploadedImage = await saveProfileImageUpload(body.imageUpload);
      const info = {
        title: String(body.title ?? existing?.title ?? name).trim(), description: String(body.description ?? existing?.description ?? '').trim(),
        bio: String(body.bio ?? existing?.bio ?? '').trim(), image: uploadedImage || String(body.image ?? existing?.image ?? '').trim() || null,
        imagePosition: normaliseImagePosition(body.imagePosition ?? existing?.imagePosition),
        isClosed: Object.prototype.hasOwnProperty.call(body, 'isClosed') ? [true, 1, '1', 'true', 'on'].includes(body.isClosed) : Boolean(existing?.isClosed),
        source: String(body.source ?? existing?.source ?? '').trim() || null
      };
      database.prepare('INSERT OR REPLACE INTO venue_info (lookup_name, title, description, bio, image, image_position, is_manual, is_closed, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)').run(lookupName, info.title, info.description, info.bio, info.image, info.imagePosition, info.isClosed ? 1 : 0, info.source, now());
      if (coordinates) await geocoding.set(lookupName, coordinates);
      await removeReplacedProfileImage(existing?.image, info.image);
      sendJson(response, 200, { name, city, ...info, coordinates }); return true;
    }

    return false;
  };
}

module.exports = { createDirectoryRoutes };
