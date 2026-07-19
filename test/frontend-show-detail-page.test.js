const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const showDetail = require('../public/lib/show-detail-page');

function classList() {
  const values = new Set();
  return { add: (name) => values.add(name), remove: (name) => values.delete(name), contains: (name) => values.has(name) };
}

function fixture() {
  const text = () => ({ textContent: '' });
  const heroImage = { hidden: true, src: '', alt: '', addEventListener() {}, removeAttribute(name) { if (name === 'src') this.src = ''; } };
  return {
    heading: text(), place: { innerHTML: '' }, date: text(), notes: text(), venueNotes: text(), attendees: text(),
    ratings: { innerHTML: '' }, setlist: { innerHTML: '' }, editLink: { href: '' }, noMedia: { hidden: false }, noArtifacts: { hidden: false },
    navTrackCount: text(), navMediaCount: text(), navArtifactCount: text(), facts: { innerHTML: '' }, gallery: {}, artifactGallery: {},
    findAlbums: { hidden: false, disabled: false, textContent: '', addEventListener() {} }, albumMessage: { textContent: '', classList: classList() },
    heroImage, heroFallback: { hidden: false }, favouriteBadge: { hidden: true }, heroPlayLink: { href: '' }, memoryTicket: { innerHTML: '' },
    shareButton: { textContent: 'Share memory', addEventListener() {} }, downloadButton: { addEventListener() {} }
  };
}

function gigFixture() {
  return {
    id: 'g1', artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', date: '2026-01-20', performanceRating: 5,
    performanceNotes: 'Excellent', favorite: true, songs: [{ title: 'Song', album: '' }], attendees: [{ name: 'Archive Owner' }, { name: 'Sam' }],
    media: [{ id: 'photo', mimeType: 'image/jpeg', url: '/photo.jpg', isCover: true }, { id: 'video', mimeType: 'video/mp4' }, { id: 'shirt', category: 'artifact' }]
  };
}

function controllerFor(elements, gig, overrides = {}) {
  const galleries = [];
  let playbackStarted = false;
  const controller = showDetail.createController({
    page: 'show', window: { location: { search: '' } }, URLSearchParamsClass: URLSearchParams, setTimeoutFn: (fn) => fn(),
    showId: 'g1', getGigs: () => [gig], fetchJson: async () => ({ songs: gig.songs }),
    escapeHtml: String, formatDate: (value) => `date:${value}`, attendeeNames: (record) => record.attendees.map((person) => person.name),
    hasMissingAlbums: (songs) => songs.some((song) => !song.album),
    renderTrackList: (songs) => songs.map((song) => `<li>${song.title}</li>`).join(''), renderAlbumStats: () => '<div>albums</div>',
    renderMediaGallery: (target, media, options) => galleries.push([target, media, options]), startPlayback: () => { playbackStarted = true; }, elements,
    ...overrides
  });
  return { controller, galleries, playbackStarted: () => playbackStarted };
}

describe('show detail page controller', () => {
  test('partitions artifacts from ordinary show media', () => {
    const result = showDetail.partitionMedia([{ id: 'video' }, { id: 'shirt', category: 'artifact' }]);
    assert.deepEqual(result.general.map((item) => item.id), ['video']);
    assert.deepEqual(result.artifacts.map((item) => item.id), ['shirt']);
  });

  test('selects a chosen cover photo before the first ordinary image', () => {
    assert.equal(showDetail.heroMedia([{ id: 'first', mimeType: 'image/jpeg', url: '/first' }, { id: 'cover', mimeType: 'image/png', url: '/cover', isCover: true }]).id, 'cover');
    assert.equal(showDetail.heroMedia([{ mimeType: 'video/mp4', url: '/video' }]), null);
  });

  test('builds an escaped downloadable memory-card SVG', () => {
    const svg = showDetail.memoryCardSvg({ ...gigFixture(), artist: 'Poppy & Friends', venue: '<Hall>' }, { formatDate: () => '20 Jan 2026', attendeeNames: () => ['Archive Owner', 'Sam'] });
    assert.match(svg, /Poppy &amp; Friends/);
    assert.match(svg, /&lt;Hall&gt;/);
    assert.match(svg, /5 \/ 5/);
    assert.match(svg, /2<\/text>/);
  });

  test('renders show identity, facts, setlist and separate media galleries', () => {
    const elements = fixture();
    const gig = gigFixture();
    const { controller, galleries } = controllerFor(elements, gig);
    assert.equal(controller.render(), gig);
    assert.equal(elements.heading.textContent, 'Poppy');
    assert.match(elements.place.innerHTML, /The Tivoli/);
    assert.equal(elements.attendees.textContent, 'Attended with Sam');
    assert.match(elements.ratings.innerHTML, /<b>5<\/b> \/ 5 stars/);
    assert.match(elements.setlist.innerHTML, /Song/);
    assert.equal(elements.navTrackCount.textContent, '1');
    assert.equal(elements.navMediaCount.textContent, '2');
    assert.equal(elements.navArtifactCount.textContent, '1');
    assert.equal(elements.heroImage.src, '/photo.jpg');
    assert.equal(elements.heroFallback.hidden, true);
    assert.equal(elements.favouriteBadge.hidden, false);
    assert.equal(elements.heroPlayLink.href, '/playback?id=g1');
    assert.match(elements.memoryTicket.innerHTML, /Favourite show/);
    assert.equal(galleries.length, 2);
    assert.equal(galleries[0][1][0].id, 'photo');
    assert.equal(galleries[1][1][0].id, 'shirt');
  });

  test('shares the memory with the native share sheet or clipboard fallback', async () => {
    const elements = fixture();
    const shared = [];
    const { controller } = controllerFor(elements, gigFixture(), { window: { location: { search: '', href: 'http://archive/show?id=g1' } }, navigatorApi: { share: async (payload) => shared.push(payload) } });
    controller.render();
    assert.equal(await controller.shareMemory(), true);
    assert.equal(shared[0].url, 'http://archive/show?id=g1');
    assert.match(shared[0].title, /Poppy/);
  });

  test('downloads a filesystem-safe SVG memory card', () => {
    const elements = fixture();
    const clicked = []; const revoked = [];
    const document = { createElement: () => ({ click() { clicked.push(this); } }) };
    class Blob {}
    const window = { location: { search: '' }, Blob, URL: { createObjectURL: () => 'blob:card', revokeObjectURL: (url) => revoked.push(url) } };
    const { controller } = controllerFor(elements, { ...gigFixture(), artist: 'Poppy & Co.' }, { window, document, setTimeoutFn: (fn) => fn() });
    controller.render();
    assert.equal(controller.downloadMemoryCard(), true);
    assert.equal(clicked[0].href, 'blob:card');
    assert.equal(clicked[0].download, 'poppy-co-2026-01-20.svg');
    assert.deepEqual(revoked, ['blob:card']);
  });

  test('renders a stable not-found state', () => {
    const elements = fixture();
    const { controller } = controllerFor(elements, gigFixture(), { getGigs: () => [] });
    assert.equal(controller.render(), null);
    assert.equal(elements.heading.textContent, 'Show not found');
  });

  test('starts whole-set playback automatically on the playback route', () => {
    const elements = fixture();
    const setup = controllerFor(elements, gigFixture(), { page: 'playback' });
    setup.controller.render();
    assert.equal(setup.playbackStarted(), true);
  });

  test('refreshes album metadata and reports remaining unmatched tracks', async () => {
    const elements = fixture();
    const gig = gigFixture();
    const { controller } = controllerFor(elements, gig, {
      fetchJson: async (url) => url.includes('refresh=1') ? { songs: [{ title: 'Song', album: 'Album' }] } : { songs: gig.songs }
    });
    controller.render();
    const result = await controller.refreshAlbums();
    assert.equal(result.songs[0].album, 'Album');
    assert.equal(elements.findAlbums.hidden, true);
    assert.equal(elements.findAlbums.disabled, false);
    assert.equal(elements.findAlbums.textContent, 'Find album info');
    assert.equal(elements.albumMessage.textContent, 'Album information updated.');
  });
});
