const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const artifactCreator = require('../public/lib/artifact-creator');

function draft(overrides = {}) {
  return {
    title: 'Tour shirt', type: 'merch', notes: 'Limited print',
    front: { key: 'front', view: 'front', label: 'Front', file: { name: 'front.jpg' } },
    back: { key: 'back', view: 'back', label: 'Back', file: { name: 'back.jpg' } },
    details: [{ key: 'detail-1', view: 'detail', label: 'Sleeve', file: { name: 'sleeve.jpg' } }],
    removeBackground: false, ...overrides
  };
}

describe('artifact creation workflow', () => {
  test('requires a title, front photo and names for selected detail photos', () => {
    assert.throws(() => artifactCreator.validateDraft(draft({ title: '' })), /title/);
    assert.throws(() => artifactCreator.validateDraft(draft({ front: { key: 'front', view: 'front', file: null } })), /front photo/);
    assert.throws(() => artifactCreator.validateDraft(draft({ details: [{ key: 'detail', view: 'detail', label: '', file: {} }] })), /Name each detail/);
    assert.equal(artifactCreator.validateDraft(draft()), true);
  });

  test('creates the front first, applies shared metadata and attaches remaining views', async () => {
    const uploads = []; const patches = []; const statuses = [];
    const result = await artifactCreator.createArtifact({
      gigId: 'gig-1', draft: draft(),
      uploadFiles: async (gigId, files, onProgress, category, options) => {
        uploads.push({ gigId, file: files[0].name, category, options }); onProgress(files[0], .5); onProgress(files[0], 1);
        return [{ id: options.artifactView, artifactGroupId: options.artifactGroupId || 'group-1', category: 'artifact' }];
      },
      fetchJson: async (url, options) => { patches.push({ url, body: JSON.parse(options.body) }); return { id: 'front', artifactGroupId: 'group-1', caption: 'Tour shirt' }; },
      onStatus: (...args) => statuses.push(args)
    });
    assert.deepEqual(uploads.map((entry) => entry.options), [
      { artifactView: 'front' },
      { artifactGroupId: 'group-1', artifactView: 'back', artifactViewLabel: '' },
      { artifactGroupId: 'group-1', artifactView: 'detail', artifactViewLabel: 'Sleeve' }
    ]);
    assert.deepEqual(patches[0], { url: '/api/media/front', body: { caption: 'Tour shirt', artifactType: 'merch', artifactNotes: 'Limited print' } });
    assert.equal(result.groupId, 'group-1'); assert.equal(result.media.length, 3);
    assert.ok(statuses.some(([key, state, progress]) => key === 'back' && state === 'uploading' && progress === 50));
  });

  test('tracks background removal independently and keeps a usable artifact when one cutout fails', async () => {
    const statuses = [];
    const result = await artifactCreator.createArtifact({
      gigId: 'gig-1', draft: draft({ removeBackground: true }),
      uploadFiles: async (_gigId, _files, _progress, _category, options) => [{ id: options.artifactView, artifactGroupId: 'group-1', category: 'artifact' }],
      fetchJson: async () => ({ id: 'front', artifactGroupId: 'group-1' }),
      removeBackground: async (media, progress) => { progress(45); if (media.id === 'back') throw new Error('Cutout failed'); progress(100); },
      onStatus: (...args) => statuses.push(args)
    });
    assert.equal(result.media.length, 3); assert.equal(result.backgroundErrors.length, 1);
    assert.ok(statuses.some(([key, state]) => key === 'back' && state === 'background-error'));
    assert.ok(statuses.some(([key, state]) => key === 'detail-1' && state === 'complete'));
  });
});
