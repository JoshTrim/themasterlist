const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../public/lib/show-form-controller');

test('new show workflow saves before queueing mobile uploads and external media', async () => {
  const calls = [];
  const result = await controller.createShow({
    payload: { artist: 'Poppy' }, mediaFiles: [{ name: 'clip.mp4' }], mobile: true,
    saveShow: async (payload) => { calls.push(['save', payload]); return { id: 'gig' }; },
    queueMobileUploads: async (gig, files) => calls.push(['queue', gig.id, files.length]), uploadFiles: async () => calls.push(['direct']),
    addExternalMedia: async (gig) => calls.push(['external', gig.id])
  });
  assert.deepEqual(calls, [['save', { artist: 'Poppy' }], ['queue', 'gig', 1], ['external', 'gig']]);
  assert.equal(result.uploadsQueued, true);
});

test('edit workflow persists values, uploads, external media and then refreshes', async () => {
  const calls = []; const gig = { id: 'gig' };
  const result = await controller.updateShow({
    gig, update: { notes: 'Changed' }, mediaFiles: [{ name: 'clip.mp4' }],
    saveShow: async (_gig, update) => { calls.push(['save', update]); return { id: 'gig', ...update }; },
    uploadFiles: async () => calls.push(['upload']), addExternalMedia: async () => calls.push(['external']),
    refreshMedia: async () => { calls.push(['refresh']); return [{ id: 'media' }]; }
  });
  assert.deepEqual(calls.map((entry) => entry[0]), ['save', 'upload', 'external', 'refresh']);
  assert.deepEqual(result.media, [{ id: 'media' }]);
});
