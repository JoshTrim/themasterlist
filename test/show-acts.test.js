const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normaliseActs } = require('../lib/show-acts');
const supportingActs = require('../public/lib/supporting-acts');

test('show acts accept only the supported roles and deduplicate artists', () => {
  assert.deepEqual(normaliseActs([
    { artist: ' Support ', role: 'Co-headliner', songs: [{ title: 'Song' }] },
    { artist: 'support', role: 'Opener' },
    { artist: 'Second', role: 'Support' }
  ]), [
    { artist: 'Support', role: 'Co-headliner', setlistFmId: null, setlistFmUrl: null, songs: [{ title: 'Song' }] },
    { artist: 'Second', role: 'Opener', setlistFmId: null, setlistFmUrl: null, songs: [] }
  ]);
});

test('supporting act UI normalisation preserves setlists and restricts roles', () => {
  const result = supportingActs.normalise([{ artist: 'Act', role: 'Other', songs: [{ title: 'One' }], setlistFmId: 'set' }]);
  assert.equal(result[0].role, 'Opener');
  assert.equal(result[0].setlistFmId, 'set');
});
