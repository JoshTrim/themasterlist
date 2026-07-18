const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAccount, normaliseGenres, normaliseImagePosition, normaliseSongs, validateGig, normaliseRating } = require('../lib/validation');

describe('input validation', () => {
  test('validates and trims owner account details', () => {
    assert.deepEqual(validateAccount({ name: '  Archive Owner  ', password: 'long-enough' }), { name: 'Archive Owner', password: 'long-enough' });
    assert.throws(() => validateAccount({ name: '', password: 'long-enough' }), /name/i);
    assert.throws(() => validateAccount({ name: 'Archive Owner', password: 'short' }), /10 characters/i);
  });

  test('normalizes genre lists with stable deduplication and limits', () => {
    assert.deepEqual(normaliseGenres('Rock, Electronic, Rock, , Ambient'), ['Rock', 'Electronic', 'Ambient']);
    assert.equal(normaliseGenres(Array.from({ length: 12 }, (_, index) => `Genre ${index}`)).length, 8);
    assert.equal(normaliseGenres(['x'.repeat(80)])[0].length, 60);
  });

  test('normalizes metadata display positions', () => {
    assert.equal(normaliseImagePosition('TOP'), 'top');
    assert.equal(normaliseImagePosition('left'), 'center');
    assert.equal(normaliseImagePosition(), 'center');
  });

  test('flattens setlist.fm sets and preserves encore and cover metadata', () => {
    assert.deepEqual(normaliseSongs({ artist: { name: 'Main Artist' }, sets: { set: [
      { song: [{ name: 'Original' }] },
      { encore: 1, song: [{ name: 'Cover', cover: { name: 'Cover Artist' }, info: 'with guest' }] }
    ] } }), [
      { title: 'Original', artist: 'Main Artist', encore: false, position: 1, info: '' },
      { title: 'Cover', artist: 'Cover Artist', encore: true, position: 1, info: 'with guest' }
    ]);
  });

  test('reports all missing gig fields together', () => {
    assert.doesNotThrow(() => validateGig({ artist: 'A', venue: 'V', city: 'C' }));
    assert.throws(() => validateGig({ artist: 'A' }), /venue, city/);
  });

  test('accepts only whole one-to-five star ratings', () => {
    assert.equal(normaliseRating('5'), 5);
    assert.equal(normaliseRating(''), null);
    assert.equal(normaliseRating(null), null);
    assert.throws(() => normaliseRating(0), /whole stars/);
    assert.throws(() => normaliseRating(3.5), /whole stars/);
  });
});
