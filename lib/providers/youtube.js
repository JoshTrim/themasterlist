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

function transientPlaylistWrite(error) {
  const message = String(error?.message || '');
  const status = Number(error?.status || 0);
  return [408, 409, 429].includes(status) || status >= 500
    || /operation was aborted|backend\s*error|internal\s*error|temporarily unavailable/i.test(message);
}

function createYouTubeProvider({ requestJson, regionCode = 'AU', sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), insertAttempts = 4 }) {
  if (typeof requestJson !== 'function') throw new TypeError('A JSON request function is required.');
  const headersFor = (accessToken, json = false) => ({ Authorization: `Bearer ${accessToken}`, ...(json ? { 'Content-Type': 'application/json' } : {}) });

  async function playlistVideoAtPosition(playlistId, position, headers) {
    let pageToken = '';
    let offset = 0;
    do {
      const query = new URLSearchParams({ part: 'snippet', playlistId, maxResults: '50' });
      if (pageToken) query.set('pageToken', pageToken);
      const result = await requestJson(`https://www.googleapis.com/youtube/v3/playlistItems?${query}`, { headers }, 'YouTube playlist');
      const items = result.items || [];
      if (position < offset + items.length) return items[position - offset]?.snippet?.resourceId?.videoId || null;
      offset += items.length;
      pageToken = result.nextPageToken || '';
    } while (pageToken && offset <= position);
    return null;
  }

  async function insertPlaylistItem(playlistId, videoId, position, headers, verifyExisting = false) {
    if (verifyExisting && await playlistVideoAtPosition(playlistId, position, headers) === videoId) return { alreadyPresent: true };
    let lastError;
    for (let attempt = 0; attempt < insertAttempts; attempt += 1) {
      try {
        return await requestJson('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
          method: 'POST', headers, body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } })
        }, 'YouTube playlist');
      } catch (error) {
        lastError = error;
        if (!transientPlaylistWrite(error) || attempt === insertAttempts - 1) break;
        if (await playlistVideoAtPosition(playlistId, position, headers) === videoId) return { alreadyPresent: true };
        await sleep(300 * (2 ** attempt));
      }
    }
    throw lastError;
  }

  async function exportPlaylist({ gig, accessToken, details, resumeState = {}, onProgress = async () => {}, shouldCancel = () => false }) {
    const headers = headersFor(accessToken, true);
    // Spotify calls this field `name`, while YouTube expects the playlist
    // title nested under `snippet.title`. Keep the shared playlist details
    // shape and translate it at the provider boundary.
    const snippet = {
      title: details?.title || details?.name || 'The Master List playlist',
      description: details?.description || ''
    };
    const songs = gig.songs || [];
    const state = {
      searchIndex: Math.max(0, Number(resumeState.searchIndex) || 0),
      videos: Array.isArray(resumeState.videos) ? resumeState.videos : [],
      unmatched: Array.isArray(resumeState.unmatched) ? resumeState.unmatched : [],
      playlistId: resumeState.playlistId || null,
      insertIndex: Math.max(0, Number(resumeState.insertIndex) || 0),
      matched: Math.max(0, Number(resumeState.matched) || 0)
    };
    for (let index = state.searchIndex; index < songs.length; index += 1) {
      if (shouldCancel()) throw Object.assign(new Error('Playlist export cancelled.'), { code: 'cancelled' });
      const song = songs[index];
      const artist = song.artist || gig.artist;
      const query = new URLSearchParams({ part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '1', q: `${artist} ${song.title} official audio` });
      const result = await requestJson(`https://www.googleapis.com/youtube/v3/search?${query}`, { headers }, 'YouTube search');
      const video = result.items?.[0]?.id?.videoId;
      const label = `${artist} — ${song.title}`;
      if (video) state.videos.push({ id: video, label }); else state.unmatched.push(label);
      state.searchIndex = index + 1;
      await onProgress({ phase: 'searching', current: state.searchIndex, total: songs.length, progress: 5 + (45 * state.searchIndex / Math.max(1, songs.length)), state, unmatched: state.unmatched });
    }
    const resumedPlaylist = Boolean(state.playlistId);
    if (!state.playlistId) {
      await onProgress({ phase: 'creating', progress: 52, state, unmatched: state.unmatched });
      const playlist = await requestJson('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
        method: 'POST', headers, body: JSON.stringify({ snippet, status: { privacyStatus: 'private' } })
      }, 'YouTube playlist');
      state.playlistId = playlist.id;
      await onProgress({ phase: 'adding', current: 0, total: state.videos.length, progress: 55, playlistId: state.playlistId, url: `https://www.youtube.com/playlist?list=${state.playlistId}`, state, unmatched: state.unmatched });
    }
    for (let index = state.insertIndex; index < state.videos.length; index += 1) {
      if (shouldCancel()) throw Object.assign(new Error('Playlist export cancelled.'), { code: 'cancelled' });
      const video = state.videos[index];
      try {
        await insertPlaylistItem(state.playlistId, video.id, state.matched, headers, resumedPlaylist);
        state.matched += 1;
      } catch (error) {
        if (!transientPlaylistWrite(error)) throw error;
        state.unmatched.push(video.label);
      }
      state.insertIndex = index + 1;
      await onProgress({
        phase: 'adding', current: state.insertIndex, total: state.videos.length,
        progress: 55 + (44 * state.insertIndex / Math.max(1, state.videos.length)),
        playlistId: state.playlistId, url: `https://www.youtube.com/playlist?list=${state.playlistId}`,
        matched: state.matched, unmatched: state.unmatched, state
      });
    }
    return { playlistId: state.playlistId, url: `https://www.youtube.com/playlist?list=${state.playlistId}`, matched: state.matched, unmatched: state.unmatched, state };
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

module.exports = { eventNeedles, playableInRegion, transientPlaylistWrite, createYouTubeProvider };
