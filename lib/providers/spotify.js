function createSpotifyProvider({ requestJson }) {
  if (typeof requestJson !== 'function') throw new TypeError('A JSON request function is required.');

  async function exportPlaylist({ gig, accessToken, details }) {
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const matches = [];
    const unmatched = [];
    for (const song of gig.songs || []) {
      const artist = song.artist || gig.artist;
      const query = new URLSearchParams({ q: `track:${song.title} artist:${artist}`, type: 'track', limit: '1' });
      const result = await requestJson(`https://api.spotify.com/v1/search?${query}`, { headers }, 'Spotify search');
      const track = result.tracks?.items?.[0];
      if (track) matches.push(track.uri);
      else unmatched.push(`${artist} — ${song.title}`);
    }

    const playlist = await requestJson('https://api.spotify.com/v1/me/playlists', {
      method: 'POST', headers, body: JSON.stringify({ ...details, public: false })
    }, 'Spotify playlist');
    for (let index = 0; index < matches.length; index += 100) {
      await requestJson(`https://api.spotify.com/v1/playlists/${playlist.id}/items`, {
        method: 'POST', headers, body: JSON.stringify({ uris: matches.slice(index, index + 100) })
      }, 'Spotify playlist');
    }
    return { url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`, matched: matches.length, unmatched };
  }

  return { exportPlaylist };
}

module.exports = { createSpotifyProvider };
