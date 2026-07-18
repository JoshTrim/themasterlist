const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { quickRatingMarkup, mediaSectionState, localCardModel, remoteCardModel, setupMediaSection, setupArtifactSection } = require('../public/lib/show-cards');

describe('show card presentation', () => {
  test('builds local card links and partitions ordinary media from artifacts', () => {
    const model = localCardModel({
      id: 'gig 1', artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20',
      favorite: true, performanceRating: 4, performanceNotes: 'Huge set', venueNotes: 'Great room',
      songs: [{ title: 'Concrete' }], media: [{ id: 'video', category: 'show' }, { id: 'shirt', category: 'artifact' }]
    });
    assert.equal(model.id, 'gig-gig 1');
    assert.equal(model.editHref, '/edit?id=gig%201');
    assert.equal(model.artistHref, '/artist?name=Poppy');
    assert.equal(model.favoriteLabel, 'Remove from favourites');
    assert.equal(model.hasSetlist, true);
    assert.deepEqual(model.media.map((item) => item.id), ['video']);
    assert.deepEqual(model.artifacts.map((item) => item.id), ['shirt']);
  });

  test('aggregates peer favourites, ratings, participants and media', () => {
    const model = remoteCardModel({ id: 'shared', date: '2025-01-01', songs: [], contributions: [
      { participantName: 'Archive Owner', favorite: false, performanceRating: 3, media: [{}, {}] },
      { participantName: 'Sam', favorite: true, performanceRating: 5, media: [{}] }
    ] });
    assert.equal(model.id, 'shared-shared');
    assert.equal(model.showRating, 5);
    assert.equal(model.showFavorite, '1');
    assert.equal(model.mediaTotal, 3);
    assert.deepEqual(model.participants, ['Archive Owner', 'Sam']);
  });

  test('renders exactly five rating controls with the saved stars selected', () => {
    const markup = quickRatingMarkup('performanceRating', 'Performance', 3);
    assert.equal((markup.match(/class="quick-star/g) || []).length, 5);
    assert.equal((markup.match(/quick-star selected/g) || []).length, 3);
    assert.match(markup, /Rate performance 5 out of 5/);
  });

  test('hides empty media accordions and labels populated ones', () => {
    assert.deepEqual(mediaSectionState('Media', []), { hidden: true, label: 'Media', count: 0 });
    assert.deepEqual(mediaSectionState('Artifacts', [{}, {}]), { hidden: false, label: 'Artifacts · 2', count: 2 });
    const label = {};
    const gallery = {};
    const section = { hidden: false, querySelector(selector) { return selector === '.media-gallery' ? gallery : label; } };
    const card = { querySelector() { return section; } };
    let rendered = false;
    setupMediaSection(card, [], {}, () => { rendered = true; });
    assert.equal(section.hidden, true);
    assert.equal(label.textContent, 'Media');
    assert.equal(rendered, false);
    setupMediaSection(card, [{ id: 'one' }], {}, () => { rendered = true; });
    assert.equal(section.hidden, false);
    assert.equal(label.textContent, 'Media · 1');
    assert.equal(rendered, true);
  });

  test('artifact deletion updates the owning gig and collapses the empty section', () => {
    const artifact = { id: 'shirt', category: 'artifact' };
    const gig = { media: [artifact, { id: 'clip', category: 'show' }] };
    const label = {};
    const gallery = {};
    const section = { hidden: false, querySelector() { return label; } };
    const card = { querySelector(selector) { return selector === '.artifact-section' ? section : gallery; } };
    let firstRender = true;
    setupArtifactSection(card, gig, (target, artifacts, options) => {
      if (!firstRender) return;
      firstRender = false;
      artifacts.splice(0, 1);
      options.onDelete([artifact]);
    });
    assert.deepEqual(gig.media.map((item) => item.id), ['clip']);
    assert.equal(section.hidden, true);
    assert.equal(label.textContent, 'Artifacts');
  });
});
