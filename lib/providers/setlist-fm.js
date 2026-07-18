const SEARCH_ENDPOINT = 'https://api.setlist.fm/rest/1.0/search/setlists';

class SetlistProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'SetlistProviderError';
    this.status = status;
  }
}

function createSetlistFmProvider({ apiKey, fetch: request = globalThis.fetch, recordUsage = () => {}, normaliseSongs }) {
  if (typeof request !== 'function') throw new TypeError('A fetch implementation is required.');
  if (typeof normaliseSongs !== 'function') throw new TypeError('A setlist normaliser is required.');

  function configured() {
    return Boolean(apiKey && apiKey !== 'replace-me');
  }

  async function performSearch(upstream, operation) {
    let response;
    try {
      response = await request(upstream, { headers: { Accept: 'application/json', 'x-api-key': apiKey } });
    } catch (error) {
      recordUsage('setlist.fm', operation, 1, null);
      throw new SetlistProviderError(`setlist.fm could not be reached: ${error.message}`);
    }
    recordUsage('setlist.fm', operation, 1, response.status);
    return response;
  }

  async function search({ artistName, cityName, eventDate = '' }) {
    if (!configured()) throw new SetlistProviderError('Add SETLIST_FM_API_KEY to .env before searching setlist.fm.', 503);
    if (!artistName || !cityName) throw new SetlistProviderError('Artist and city are required.', 400);

    const upstream = new URL(SEARCH_ENDPOINT);
    upstream.searchParams.set('artistName', String(artistName).trim());
    upstream.searchParams.set('cityName', String(cityName).trim());
    if (eventDate) upstream.searchParams.set('date', String(eventDate).split('-').reverse().join('-'));

    let response = await performSearch(upstream, 'search/setlists');
    if (response.status === 404) {
      upstream.searchParams.delete('cityName');
      response = await performSearch(upstream, 'search/setlists retry');
    }
    if (response.status === 404) return { total: 0, setlists: [] };
    if (!response.ok) throw new SetlistProviderError('setlist.fm could not complete this search.', response.status);

    const result = await response.json();
    const setlists = (result.setlist || []).map((setlist) => ({
      id: setlist.id,
      artist: setlist.artist?.name || artistName,
      venue: setlist.venue?.name || '',
      city: setlist.venue?.city?.name || cityName,
      date: setlist.eventDate,
      url: setlist.url,
      songs: normaliseSongs(setlist)
    }));
    return { total: result.total || 0, setlists };
  }

  return { configured, search };
}

module.exports = { SEARCH_ENDPOINT, SetlistProviderError, createSetlistFmProvider };
