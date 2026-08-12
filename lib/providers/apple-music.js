function createAppleMusicProvider({ requestJson, developerToken, storefront = 'au' }) {
  if (typeof requestJson !== 'function') throw new TypeError('A JSON request function is required.');

  async function exportPlaylist({ gig, musicUserToken, details, onProgress = async () => {}, shouldCancel = () => false }) {
    if (!musicUserToken) throw new Error('Apple Music authorization was not completed.');
    const headers = { Authorization: `Bearer ${developerToken}`, 'Music-User-Token': musicUserToken, 'Content-Type': 'application/json' };
    const tracks = [];
    const unmatched = [];
    const songs = gig.songs || [];
    for (let index = 0; index < songs.length; index += 1) {
      if (shouldCancel()) throw Object.assign(new Error('Playlist export cancelled.'), { code: 'cancelled' });
      const song = songs[index];
      const artist = song.artist || gig.artist;
      const query = new URLSearchParams({ term: `${artist} ${song.title}`, types: 'songs', limit: '1' });
      const result = await requestJson(`https://api.music.apple.com/v1/catalog/${storefront}/search?${query}`, { headers }, 'Apple Music search');
      const track = result.results?.songs?.data?.[0];
      if (track) tracks.push({ id: track.id, type: 'songs' }); else unmatched.push(`${artist} — ${song.title}`);
      await onProgress({ phase: 'searching', current: index + 1, total: songs.length, progress: 5 + (65 * (index + 1) / Math.max(1, songs.length)), matched: tracks.length, unmatched });
    }
    await onProgress({ phase: 'creating', progress: 75, matched: tracks.length, unmatched });
    const playlist = await requestJson('https://api.music.apple.com/v1/me/library/playlists', {
      method: 'POST', headers, body: JSON.stringify({ attributes: { name: details.name, description: details.description } })
    }, 'Apple Music playlist');
    const playlistId = playlist.data?.[0]?.id;
    if (!playlistId) throw new Error('Apple Music did not return the new playlist.');
    for (let index = 0; index < tracks.length; index += 100) {
      if (shouldCancel()) throw Object.assign(new Error('Playlist export cancelled.'), { code: 'cancelled' });
      await requestJson(`https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, {
        method: 'POST', headers, body: JSON.stringify({ data: tracks.slice(index, index + 100) })
      }, 'Apple Music playlist');
      await onProgress({ phase: 'adding', current: Math.min(index + 100, tracks.length), total: tracks.length, progress: 80 + (19 * Math.min(index + 100, tracks.length) / Math.max(1, tracks.length)), playlistId, url: 'https://music.apple.com/library', matched: tracks.length, unmatched });
    }
    return { url: 'https://music.apple.com/library', matched: tracks.length, unmatched };
  }

  return { exportPlaylist };
}

module.exports = { createAppleMusicProvider };
