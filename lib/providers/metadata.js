const DEFAULT_HEADERS = { 'User-Agent': 'TheMasterList/0.1 personal-live-music-archive', 'Accept-Language': 'en' };

function cleanMusicName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/\b(feat\.?|ft\.?).*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function pageMetadata(html, fallbackTitle, fallbackDescription = '') {
  const title = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.replace(/\s*[-|].*$/, '').trim() || fallbackTitle;
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] || fallbackDescription;
  const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || null;
  return { title, description, image };
}

function createMetadataProvider({ fetch: request = globalThis.fetch, googleApiKey = '', googleEngineId = '', headers = DEFAULT_HEADERS } = {}) {
  if (typeof request !== 'function') throw new TypeError('A fetch implementation is required.');

  async function artistGenre(name) {
    const endpoint = new URL('https://itunes.apple.com/search');
    endpoint.searchParams.set('term', name); endpoint.searchParams.set('entity', 'musicArtist'); endpoint.searchParams.set('limit', '8');
    const response = await request(endpoint);
    const results = response.ok ? (await response.json()).results || [] : [];
    const wanted = cleanMusicName(name);
    const match = results.find((entry) => cleanMusicName(entry.artistName) === wanted)
      || results.find((entry) => cleanMusicName(entry.artistName).includes(wanted) || wanted.includes(cleanMusicName(entry.artistName)));
    return match?.primaryGenreName || '';
  }

  async function wikipediaSummary(searchTerm, fallbackTitle, acceptTitle = () => true) {
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
    searchUrl.searchParams.set('action', 'query'); searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', searchTerm); searchUrl.searchParams.set('srlimit', '1'); searchUrl.searchParams.set('format', 'json');
    const searchResponse = await request(searchUrl, { headers });
    const searchResult = searchResponse.ok ? await searchResponse.json() : null;
    const candidate = searchResult?.query?.search?.[0]?.title;
    const title = candidate && acceptTitle(candidate) ? candidate : fallbackTitle;
    let response = await request(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers });
    if (!response.ok && title !== fallbackTitle) response = await request(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(fallbackTitle.replace(/ /g, '_'))}`, { headers });
    return response.ok ? response.json() : null;
  }

  async function artistInfo(name) {
    const summary = await wikipediaSummary(`${name} musician`, name);
    return summary ? {
      name, title: summary.title || name, description: summary.description || '', bio: summary.extract || '',
      image: summary.thumbnail?.source || summary.originalimage?.source || null, source: summary.content_urls?.desktop?.page || null
    } : { name, title: name, description: '', bio: '', image: null, source: null };
  }

  async function venueInfo(name, city = '') {
    const lookupName = `${name}|${city}`.toLowerCase();
    const officialSources = { 'fortitude music hall|brisbane': 'https://www.thefortitude.com.au/venue-history' };
    const officialUrl = officialSources[lookupName];
    if (officialUrl) {
      const response = await request(officialUrl, { headers });
      if (response.ok) {
        const metadata = pageMetadata(await response.text(), name);
        return { name, city, ...metadata, bio: metadata.description || `${metadata.title} is a live music venue in ${city}.`, source: officialUrl };
      }
    }

    if (googleApiKey && googleEngineId) {
      const googleUrl = new URL('https://www.googleapis.com/customsearch/v1');
      googleUrl.searchParams.set('key', googleApiKey); googleUrl.searchParams.set('cx', googleEngineId);
      googleUrl.searchParams.set('q', `${name} ${city} official venue`);
      const searchResponse = await request(googleUrl, { headers });
      const result = searchResponse.ok ? await searchResponse.json() : null;
      const officialResult = result?.items?.find((item) => /official|venue|music|theatre|theater/i.test(`${item.title} ${item.snippet}`));
      if (officialResult?.link) {
        const pageResponse = await request(officialResult.link, { headers });
        if (pageResponse.ok) {
          const metadata = pageMetadata(await pageResponse.text(), name, officialResult.snippet || '');
          return { name, city, ...metadata, bio: metadata.description, source: officialResult.link };
        }
      }
    }

    const venueWords = name.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
    const summary = await wikipediaSummary(`${name} ${city} concert venue`, name, (title) => venueWords.every((word) => title.toLowerCase().includes(word)));
    return {
      name, city, title: summary?.title || name, description: summary?.description || '', bio: summary?.extract || '',
      image: summary?.thumbnail?.source || summary?.originalimage?.source || null, source: summary?.content_urls?.desktop?.page || null
    };
  }

  async function album(artist, title) {
    const wantedArtist = cleanMusicName(artist);
    const wantedTitle = cleanMusicName(title);
    try {
      const response = await request(`https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=song&limit=8`);
      if (response.ok) {
        const matches = (await response.json()).results || [];
        const scored = matches.map((entry) => {
          const entryTitle = cleanMusicName(entry.trackName); const entryArtist = cleanMusicName(entry.artistName);
          const titleMatch = entryTitle === wantedTitle ? 3 : (entryTitle.includes(wantedTitle) || wantedTitle.includes(entryTitle) ? 1 : 0);
          const artistMatch = entryArtist === wantedArtist ? 3 : (entryArtist.includes(wantedArtist) || wantedArtist.includes(entryArtist) ? 1 : 0);
          return { entry, score: titleMatch + artistMatch };
        }).filter((candidate) => candidate.score >= 5).sort((a, b) => b.score - a.score);
        const exact = scored.find(({ entry }) => entry.collectionType === 'Album' && Number(entry.trackCount) > 1)?.entry || scored[0]?.entry;
        if (exact) return exact.collectionType === 'single' || Number(exact.trackCount) === 1 ? 'Single' : (exact.collectionName || null);
      }
    } catch { /* MusicBrainz remains available as a fallback. */ }

    try {
      const query = `artist:"${artist.replace(/"/g, '')}" AND recording:"${title.replace(/"/g, '')}"`;
      const response = await request(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=8`, { headers: { 'User-Agent': 'TheMasterList/0.1 (personal music archive)' } });
      if (!response.ok) return null;
      const recordings = (await response.json()).recordings || [];
      const recording = recordings.find((entry) => cleanMusicName(entry.title) === wantedTitle) || recordings[0];
      const releases = (recording?.releases || []).filter((release) => release.title);
      const albumRelease = releases.find((release) => release['release-group']?.['primary-type'] === 'Album' && release.status === 'Official')
        || releases.find((release) => release['release-group']?.['primary-type'] === 'Album');
      return albumRelease?.title || (releases.length === 1 ? 'Single' : null);
    } catch { return null; }
  }

  return { artistGenre, artistInfo, venueInfo, album };
}

module.exports = { DEFAULT_HEADERS, cleanMusicName, pageMetadata, createMetadataProvider };
