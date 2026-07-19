function eventNeedles(gig) {
  const venue = String(gig.venue || '').trim().toLowerCase();
  const dates = [];
  if (gig.date) {
    const date = new Date(`${gig.date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      dates.push(String(date.getFullYear()));
      dates.push(date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase());
      dates.push(date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase());
    }
  }
  return { venue, dates };
}

function playableInRegion(video, regionCode = 'AU') {
  const status = video?.status || {};
  const details = video?.contentDetails || {};
  const restriction = details.regionRestriction || {};
  const region = String(regionCode || '').trim().toUpperCase();
  if (status.embeddable !== true || !video?.player?.embedHtml) return false;
  if (status.privacyStatus === 'private' || status.uploadStatus && status.uploadStatus !== 'processed') return false;
  if (details.contentRating?.ytRating === 'ytAgeRestricted') return false;
  if (region && Array.isArray(restriction.allowed) && !restriction.allowed.includes(region)) return false;
  if (region && Array.isArray(restriction.blocked) && restriction.blocked.includes(region)) return false;
  return true;
}

function createYouTubeProvider({ requestJson, regionCode = 'AU' }) {
  if (typeof requestJson !== 'function') throw new TypeError('A JSON request function is required.');
  const headersFor = (accessToken, json = false) => ({ Authorization: `Bearer ${accessToken}`, ...(json ? { 'Content-Type': 'application/json' } : {}) });

  async function exportPlaylist({ gig, accessToken, details }) {
    const headers = headersFor(accessToken, true);
    const videos = [];
    const unmatched = [];
    for (const song of gig.songs || []) {
      const artist = song.artist || gig.artist;
      const query = new URLSearchParams({ part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '1', q: `${artist} ${song.title} official audio` });
      const result = await requestJson(`https://www.googleapis.com/youtube/v3/search?${query}`, { headers }, 'YouTube search');
      const video = result.items?.[0]?.id?.videoId;
      if (video) videos.push(video); else unmatched.push(`${artist} — ${song.title}`);
    }
    const playlist = await requestJson('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
      method: 'POST', headers, body: JSON.stringify({ snippet: details, status: { privacyStatus: 'private' } })
    }, 'YouTube playlist');
    for (const videoId of videos) {
      await requestJson('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
        method: 'POST', headers, body: JSON.stringify({ snippet: { playlistId: playlist.id, resourceId: { kind: 'youtube#video', videoId } } })
      }, 'YouTube playlist');
    }
    return { url: `https://www.youtube.com/playlist?list=${playlist.id}`, matched: videos.length, unmatched };
  }

  async function searchLiveVideos({ gig, song, accessToken }) {
    const headers = headersFor(accessToken);
    const query = new URLSearchParams({
      part: 'snippet', type: 'video', maxResults: '10', videoEmbeddable: 'true', videoSyndicated: 'true',
      regionCode, q: `${song.artist || gig.artist} ${song.title} ${gig.venue} ${gig.city} live`
    });
    const result = await requestJson(`https://www.googleapis.com/youtube/v3/search?${query}`, { headers }, 'YouTube search');
    const { venue, dates } = eventNeedles(gig);
    const filtered = (result.items || []).filter((item) => {
      if (!item.id?.videoId) return false;
      const text = `${item.snippet?.title || ''} ${item.snippet?.description || ''}`.toLowerCase();
      return (venue && text.includes(venue)) || dates.some((needle) => text.includes(needle));
    });
    const candidateIds = filtered.map((item) => item.id.videoId).slice(0, 50);
    if (!candidateIds.length) return [];
    const statusQuery = new URLSearchParams({ part: 'status,contentDetails,player', id: candidateIds.join(',') });
    const statusResult = await requestJson(`https://www.googleapis.com/youtube/v3/videos?${statusQuery}`, { headers }, 'YouTube video status');
    const embeddableIds = new Set((statusResult.items || []).filter((item) => playableInRegion(item, regionCode)).map((item) => item.id));
    return filtered.filter((item) => embeddableIds.has(item.id.videoId)).slice(0, 3).map((item) => ({
      id: item.id.videoId, title: item.snippet?.title || '', description: item.snippet?.description || '',
      channel: item.snippet?.channelTitle || '', thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || ''
    }));
  }

  async function videoMetadata({ videoIds, accessToken }) {
    if (!videoIds.length) return [];
    const query = new URLSearchParams({ part: 'snippet,contentDetails,status', id: videoIds.join(',') });
    const result = await requestJson(`https://www.googleapis.com/youtube/v3/videos?${query}`, { headers: headersFor(accessToken) }, 'YouTube video metadata');
    return result.items || [];
  }

  return { exportPlaylist, searchLiveVideos, videoMetadata };
}

module.exports = { eventNeedles, playableInRegion, createYouTubeProvider };
