const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const mediaUi = require('../public/lib/media-ui');
const uploadQueue = require('../public/lib/upload-queue');
const mediaJobs = require('../public/lib/media-jobs');

describe('media presentation and edit safety', () => {
  test('reports recognition state and honours manual track overrides', () => {
    const songs = [{ title: 'Concrete' }];
    assert.match(mediaUi.recognitionMarkup({ recognitionOverride: true, songIndex: 0 }, songs), /Manual override: Concrete/);
    assert.match(mediaUi.recognitionMarkup({ recognitionStatus: 'running' }), /Detecting track/);
    assert.match(mediaUi.recognitionMarkup({ recognitionStatus: 'matched', recognitionTitle: 'Concrete', recognitionArtist: 'Poppy' }), /matched to setlist/);
  });

  test('classifies media health and calculates workspace totals', () => {
    const media = [
      { mimeType: 'video/mp4', playbackStatus: 'encoding', recognitionStatus: 'complete', songIndex: 0 },
      { mimeType: 'video/mp4', playbackStatus: 'ready', recognitionStatus: 'complete', songIndex: null },
      { mimeType: 'video/mp4', playbackStatus: 'error', recognitionStatus: 'complete', songIndex: 0 },
      { mimeType: 'image/jpeg', category: 'artifact' }
    ];
    assert.deepEqual(mediaUi.workspaceTotals(media), { all: 4, processing: 1, failed: 1, unassigned: 1, ready: 1 });
  });

  test('bulk selection prunes removed items and returns archive objects', () => {
    const selection = mediaUi.createSelection();
    const media = [{ id: 'one' }, { id: 'two' }];
    selection.toggle('one'); selection.toggle('missing');
    selection.prune(media);
    assert.deepEqual(selection.selected(media), [{ id: 'one' }]);
    selection.clear();
    assert.equal(selection.size, 0);
  });

  test('ordinary show patches cannot replace attached media', () => {
    const originalMedia = [{ id: 'existing-video' }];
    const patch = mediaUi.safeShowPatch({ artist: 'Poppy', notes: 'Updated', media: [], artifacts: [], mediaFiles: ['new'] }, { attendees: [{ id: 'owner' }], songs: [{ title: 'Track' }] });
    assert.deepEqual(patch, { artist: 'Poppy', notes: 'Updated', attendees: [{ id: 'owner' }], songs: [{ title: 'Track' }] });
    assert.deepEqual(originalMedia, [{ id: 'existing-video' }]);
  });
});

describe('mobile upload queue state', () => {
  const files = [{ name: 'one.mp4', size: 100 }, { name: 'two.mp4', size: 200 }];

  test('holds files until a show exists, then queues them in selection order', () => {
    const state = uploadQueue.createState();
    uploadQueue.enqueueFiles(state, files, (() => { let id = 0; return () => `upload-${++id}`; })());
    assert.deepEqual(state.items.map((item) => item.status), ['waiting', 'waiting']);
    uploadQueue.bindGig(state, 'gig-1');
    assert.deepEqual(state.items.map((item) => item.status), ['queued', 'queued']);
    assert.equal(uploadQueue.nextQueued(state).name, 'one.mp4');
  });

  test('retries failures, clears pending work and renders progress', () => {
    const state = uploadQueue.createState();
    uploadQueue.bindGig(state, 'gig-1');
    uploadQueue.enqueueFiles(state, files, () => `id-${state.items.length}`);
    Object.assign(state.items[0], { status: 'error', error: 'Network lost', progress: 60 });
    assert.match(uploadQueue.queueMarkup(state, { formatSize: (size) => `${size} B` }), /Retry/);
    uploadQueue.retry(state, state.items[0].id);
    assert.equal(state.items[0].status, 'queued');
    state.items[0].status = 'uploading';
    uploadQueue.clearPending(state);
    assert.deepEqual(state.items.map((item) => item.status), ['uploading']);
  });
});

describe('media background job polling', () => {
  test('publishes each update and stops at completion', async () => {
    const statuses = [{ status: 'queued', progress: 0 }, { status: 'running', progress: 50 }, { status: 'complete', progress: 100 }];
    const seen = [];
    const result = await mediaJobs.poll({ fetchStatus: async () => statuses.shift(), onUpdate: (status) => seen.push(status.progress), sleep: async () => {} });
    assert.equal(result.status, 'complete');
    assert.deepEqual(seen, [0, 50, 100]);
  });

  test('recognition polling follows the media collection until no work remains', async () => {
    const snapshots = [[{ recognitionStatus: 'queued' }], [{ recognitionStatus: 'running' }], [{ recognitionStatus: 'matched' }]];
    const seen = [];
    const result = await mediaJobs.pollRecognition({ fetchMedia: async () => snapshots.shift(), onUpdate: (media) => seen.push(media[0].recognitionStatus), sleep: async () => {} });
    assert.equal(result[0].recognitionStatus, 'matched');
    assert.deepEqual(seen, ['queued', 'running', 'matched']);
  });
});
