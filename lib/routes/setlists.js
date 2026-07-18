function createSetlistRoutes({ provider, enrichAlbums, sendJson, sendError }) {
  return async function handleSetlistRoute(request, response, url) {
    const albumMatch = url.pathname.match(/^\/api\/gigs\/([\w-]+)\/album-stats$/);
    if (request.method === 'GET' && albumMatch) { sendJson(response, 200, await enrichAlbums(albumMatch[1], url.searchParams.get('refresh') === '1')); return true; }
    if (request.method === 'GET' && url.pathname === '/api/setlists/search') {
      try {
        const result = await provider.search({ artistName: url.searchParams.get('artistName')?.trim(), cityName: url.searchParams.get('cityName')?.trim(), eventDate: url.searchParams.get('eventDate')?.trim() });
        sendJson(response, 200, result);
      } catch (error) { sendError(response, error.status || 502, error.message); }
      return true;
    }
    return false;
  };
}
module.exports = { createSetlistRoutes };
