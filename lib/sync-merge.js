'use strict';

const { createHash } = require('node:crypto');

function syncPayloadHash(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function mergeText(localValue, remoteValue) {
  const values = [String(localValue || '').trim(), String(remoteValue || '').trim()].filter(Boolean);
  return [...new Set(values)].join('\n\n');
}

function mergeSongs(localSongs, remoteSongs) {
  const result = [];
  const seen = new Set();
  for (const song of [...(localSongs || []), ...(remoteSongs || [])]) {
    const key = `${String(song?.artist || '').trim()}|${String(song?.title || '').trim()}`.toLowerCase();
    if (!song?.title || seen.has(key)) continue;
    seen.add(key);
    result.push(song);
  }
  return result;
}

function averageRating(...ratings) {
  const values = ratings.filter((value) => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite);
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 2) / 2 : null;
}

module.exports = { syncPayloadHash, mergeText, mergeSongs, averageRating };
