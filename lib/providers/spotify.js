function createSpotifyProvider({ requestJson }) {
  if (typeof requestJson !== 'function') throw new TypeError('A JSON request function is required.');

  async function exportPlaylist({ gig, accessToken, details, onProgress = async () => {}, shouldCancel = () => false }) {
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const matches = [];
    const unmatched = [];
    const songs = gig.songs || [];
    for (let index = 0; index < songs.length; index += 1) {
      if (shouldCancel()) throw Object.assign(new Error('Playlist export cancelled.'), { code: 'cancelled' });
      const song = songs[index];
      const artist = song.artist || gig.artist;
      const query = new URLSearchParams({ q: `track:${song.title} artist:${artist}`, type: 'track', limit: '1' });
      const result = await requestJson(`https://api.spotify.com/v1/search?${query}`, { headers }, 'Spotify search');
      const track = result.tracks?.items?.[0];
      if (track) matches.push(track.uri);
      else unmatched.push(`${artist} — ${song.title}`);
      await onProgress({ phase: 'searching', current: index + 1, total: songs.length, progress: 5 + (65 * (index + 1) / Math.max(1, songs.length)), matched: matches.length, unmatched });
    }

    await onProgress({ phase: 'creating', progress: 75, matched: matches.length, unmatched });
    const playlist = await requestJson('https://api.spotify.com/v1/me/playlists', {
      method: 'POST', headers, body: JSON.stringify({ ...details, public: false })
    }, 'Spotify playlist');
    for (let index = 0; index < matches.length; index += 100) {
      if (shouldCancel()) throw Object.assign(new Error('Playlist export cancelled.'), { code: 'cancelled' });
      await requestJson(`https://api.spotify.com/v1/playlists/${playlist.id}/items`, {
        method: 'POST', headers, body: JSON.stringify({ uris: matches.slice(index, index + 100) })
      }, 'Spotify playlist');
      await onProgress({ phase: 'adding', current: Math.min(index + 100, matches.length), total: matches.length, progress: 80 + (19 * Math.min(index + 100, matches.length) / Math.max(1, matches.length)), playlistId: playlist.id, url: playlist.external_urls?.spotify, matched: matches.length, unmatched });
    }
    return { url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`, matched: matches.length, unmatched };
  }

  return { exportPlaylist };
}

module.exports = { createSpotifyProvider };
