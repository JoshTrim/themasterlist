function createAppleMusicProvider({ requestJson, developerToken, storefront = 'au' }) {
  if (typeof requestJson !== 'function') throw new TypeError('A JSON request function is required.');

  async function exportPlaylist({ gig, musicUserToken, details }) {
    if (!musicUserToken) throw new Error('Apple Music authorization was not completed.');
    const headers = { Authorization: `Bearer ${developerToken}`, 'Music-User-Token': musicUserToken, 'Content-Type': 'application/json' };
    const tracks = [];
    const unmatched = [];
    for (const song of gig.songs || []) {
      const artist = song.artist || gig.artist;
      const query = new URLSearchParams({ term: `${artist} ${song.title}`, types: 'songs', limit: '1' });
      const result = await requestJson(`https://api.music.apple.com/v1/catalog/${storefront}/search?${query}`, { headers }, 'Apple Music search');
      const track = result.results?.songs?.data?.[0];
      if (track) tracks.push({ id: track.id, type: 'songs' }); else unmatched.push(`${artist} — ${song.title}`);
    }
    const playlist = await requestJson('https://api.music.apple.com/v1/me/library/playlists', {
      method: 'POST', headers, body: JSON.stringify({ attributes: { name: details.name, description: details.description } })
    }, 'Apple Music playlist');
    const playlistId = playlist.data?.[0]?.id;
    if (!playlistId) throw new Error('Apple Music did not return the new playlist.');
    for (let index = 0; index < tracks.length; index += 100) {
      await requestJson(`https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, {
        method: 'POST', headers, body: JSON.stringify({ data: tracks.slice(index, index + 100) })
      }, 'Apple Music playlist');
    }
    return { url: 'https://music.apple.com/library', matched: tracks.length, unmatched };
  }

  return { exportPlaylist };
}

module.exports = { createAppleMusicProvider };
