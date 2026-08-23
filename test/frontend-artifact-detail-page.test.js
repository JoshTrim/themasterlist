const test = require('node:test');
const assert = require('node:assert/strict');
const detailPage = require('../public/lib/artifact-detail-page');

const shows = [{ id: 'gig', artist: 'Artist', date: '2026-01-01', media: [
  { id: 'front-file', category: 'artifact', artifactGroupId: 'shirt', artifactView: 'front', caption: 'Tour shirt' },
  { id: 'back-file', category: 'artifact', artifactGroupId: 'shirt', artifactView: 'back' },
  { id: 'label-file', category: 'artifact', artifactGroupId: 'shirt', artifactView: 'detail', artifactViewLabel: 'Label' }
] }];

test('finds a grouped artifact by its durable artifact id', () => {
  const artifact = detailPage.findArtifact(shows, 'shirt');
  assert.equal(artifact.caption, 'Tour shirt');
  assert.deepEqual(artifact.artifactViews.map((view) => view.id), ['front-file', 'back-file', 'label-file']);
  assert.equal(detailPage.findArtifact(shows, 'missing'), null);
});

test('labels artifact views for accessible navigation', () => {
  const views = detailPage.findArtifact(shows, 'shirt').artifactViews;
  assert.deepEqual(views.map(detailPage.viewLabel), ['Front', 'Back', 'Label']);
});

test('wraps previous and next navigation around all photos', () => {
  const views = detailPage.findArtifact(shows, 'shirt').artifactViews;
  assert.equal(detailPage.nextViewIndex(views, 0, -1), 2);
  assert.equal(detailPage.nextViewIndex(views, 2, 1), 0);
});

test('flip prefers front or back and otherwise advances', () => {
  const views = detailPage.findArtifact(shows, 'shirt').artifactViews;
  assert.equal(detailPage.flipViewIndex(views, 0), 1);
  assert.equal(detailPage.flipViewIndex(views, 1), 0);
  assert.equal(detailPage.flipViewIndex(views, 2), 0);
});
