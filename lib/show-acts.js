'use strict';

const ACT_ROLES = new Set(['Opener', 'Co-headliner']);

function normaliseActs(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((act) => {
    const artist = String(act?.artist || '').trim();
    const key = artist.toLocaleLowerCase();
    if (!artist || seen.has(key)) return null;
    seen.add(key);
    return {
      artist,
      role: ACT_ROLES.has(act?.role) ? act.role : 'Opener',
      setlistFmId: String(act?.setlistFmId || '').trim() || null,
      setlistFmUrl: String(act?.setlistFmUrl || '').trim() || null,
      songs: Array.isArray(act?.songs) ? act.songs.filter((song) => String(song?.title || '').trim()) : []
    };
  }).filter(Boolean);
}

module.exports = { ACT_ROLES, normaliseActs };
