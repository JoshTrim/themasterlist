function createStatsRoutes({ database, requireAccount, sendJson, genreStats, usageDay, configured, youtubeQuota = 10000, setlistConfigured = false, now = () => new Date().toISOString() }) {
  const countBy = (values) => Object.entries(values.reduce((result, value) => { const key = String(value || 'Unknown'); result[key] = (result[key] || 0) + 1; return result; }, {})).sort((a, b) => b[1] - a[1]);
  return async function handleStatsRoute(request, response, url) {
    if (request.method === 'GET' && url.pathname === '/api/stats') {
      const gigs = database.prepare('SELECT artist, venue, city, date, favorite, songs FROM gigs').all(); const songs = gigs.flatMap((gig) => JSON.parse(gig.songs || '[]'));
      const topVenues = countBy(gigs.map((gig) => `${gig.venue}\u001f${gig.city}`)).slice(0, 5).map(([key, count]) => { const [name, city] = key.split('\u001f'); return [name, city, count]; });
      sendJson(response, 200, { shows: gigs.length, artists: new Set(gigs.map((gig) => gig.artist.toLowerCase())).size, venues: new Set(gigs.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size, cities: new Set(gigs.map((gig) => gig.city.toLowerCase())).size, songs: songs.length, favourites: gigs.filter((gig) => gig.favorite).length, topArtists: countBy(gigs.map((gig) => gig.artist)).slice(0, 5), topVenues, years: countBy(gigs.map((gig) => gig.date?.slice(0, 4)).filter(Boolean)) }); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/stats/genres') { requireAccount(request); sendJson(response, 200, { genres: await genreStats() }); return true; }
    if (request.method !== 'GET' || url.pathname !== '/api/limits') return false;
    requireAccount(request); const day = usageDay();
    const usage = database.prepare(`SELECT provider, COUNT(*) AS requests, COALESCE(SUM(quota_units), 0) AS units, SUM(CASE WHEN status IS NOT NULL AND status >= 400 THEN 1 ELSE 0 END) AS errors, MAX(requested_at) AS lastRequest FROM api_usage WHERE usage_day = ? GROUP BY provider`).all(day);
    const operations = database.prepare(`SELECT provider, operation, COUNT(*) AS requests, COALESCE(SUM(quota_units), 0) AS units, MAX(requested_at) AS lastRequest FROM api_usage WHERE usage_day = ? GROUP BY provider, operation ORDER BY units DESC, requests DESC LIMIT 30`).all(day);
    const recent = database.prepare(`SELECT provider, operation, quota_units AS units, status, requested_at AS requestedAt FROM api_usage WHERE usage_day = ? ORDER BY id DESC LIMIT 20`).all(day);
    const usageByProvider = new Map(usage.map((entry) => [entry.provider, entry]));
    const definitions = [
      { id: 'youtube', name: 'YouTube Data API', configured: configured('youtube'), limit: Math.max(1, Number(youtubeQuota) || 10000), unit: 'quota units', reset: 'Midnight Pacific Time', note: 'Estimated from this app’s requests. Search costs 100 units; playlist writes cost 50.' },
      { id: 'setlist.fm', name: 'setlist.fm', configured: setlistConfigured, limit: null, unit: 'requests', reset: 'Provider-managed', note: 'The API does not return a remaining-quota value, so this page shows tracked requests and errors.' },
      ...[['spotify', 'Spotify Web API'], ['apple-music', 'Apple Music API'], ['audd', 'AudD music recognition']].map(([id, name]) => ({ id, name, configured: configured(id), limit: null, unit: 'requests', reset: 'Provider-managed', note: `${name} usage is tracked, but the provider controls the allowance.` }))
    ];
    sendJson(response, 200, { day, generatedAt: now(), providers: definitions.map((definition) => { const entry = usageByProvider.get(definition.id) || { requests: 0, units: 0, errors: 0, lastRequest: null }; return { ...definition, requests: Number(entry.requests), units: Number(entry.units), errors: Number(entry.errors), remaining: definition.limit === null ? null : Math.max(0, definition.limit - Number(entry.units)), lastRequest: entry.lastRequest }; }), operations, recent }); return true;
  };
}
module.exports = { createStatsRoutes };
