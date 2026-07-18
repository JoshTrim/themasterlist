'use strict';

function validateAccount(body = {}) {
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  if (!name || name.length > 80) throw new Error('Enter a name up to 80 characters.');
  if (password.length < 10) throw new Error('Use a password with at least 10 characters.');
  return { name, password };
}

function normaliseGenres(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map((genre) => String(genre || '').trim()).filter(Boolean).map((genre) => genre.slice(0, 60)))].slice(0, 8);
}

function normaliseImagePosition(value) {
  const position = String(value || 'center').toLowerCase();
  return ['top', 'center', 'bottom'].includes(position) ? position : 'center';
}

function normaliseSongs(setlist = {}) {
  return (setlist.sets?.set || []).flatMap((set) =>
    (set.song || []).map((song, index) => ({
      title: song.name,
      artist: song.cover?.name || setlist.artist?.name || '',
      encore: Boolean(set.encore),
      position: index + 1,
      info: song.info || ''
    }))
  );
}

function validateGig(gig = {}) {
  const required = ['artist', 'venue', 'city'];
  const missing = required.filter((field) => !String(gig[field] || '').trim());
  if (missing.length) throw new Error(`Please provide: ${missing.join(', ')}.`);
}

function normaliseRating(value) {
  if (value === undefined || value === null || value === '') return null;
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Ratings must be whole stars from 1 to 5.');
  return rating;
}

module.exports = { validateAccount, normaliseGenres, normaliseImagePosition, normaliseSongs, validateGig, normaliseRating };
