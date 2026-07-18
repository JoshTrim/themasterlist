const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createUploader } = require('../public/lib/media-uploader');

test('mobile uploader sends files serially in resumable chunks with artifact identity', async () => {
  const requests = []; const jobs = []; let active = 0; let maximumActive = 0;
  const uploader = createUploader({
    fetch: async (url, options) => {
      active += 1; maximumActive = Math.max(maximumActive, active); requests.push({ url, headers: options.headers });
      await Promise.resolve(); active -= 1;
      return { ok: true, status: 200, json: async () => ({ complete: true, media: { category: 'artifact' } }) };
    }, AbortController, randomUUID: (() => { let id = 0; return () => `upload-${++id}`; })(),
    updateJob: (id, update) => jobs.push({ id, ...update }), isMobile: () => true, sleep: async () => {}, now: () => 1, random: () => .5
  });
  const files = ['one.jpg', 'two.jpg'].map((name) => ({ name, type: 'image/jpeg', size: 10, slice: () => ({}) }));
  await uploader.upload('gig', files, () => {}, 'artifact');
  assert.equal(maximumActive, 1); assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.url === '/api/gigs/gig/artifacts/chunk'));
  assert.ok(requests.every((request) => request.headers['X-Media-Category'] === 'artifact'));
  assert.equal(jobs.filter((job) => job.status === 'complete').length, 2);
});

test('uploader chooses stable endpoint names', () => {
  const uploader = createUploader({ fetch: async () => {}, XMLHttpRequest: function () {}, AbortController, randomUUID: () => 'id', updateJob: () => {} });
  assert.equal(uploader.endpoint('show-1', 'show'), '/api/gigs/show-1/media');
  assert.equal(uploader.endpoint('show-1', 'artifact'), '/api/gigs/show-1/artifacts');
});
