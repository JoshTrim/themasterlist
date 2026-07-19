const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const setlists = require('../public/lib/setlist-presentation');

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

describe('setlist presentation', () => {
  test('detects missing and placeholder album metadata', () => {
    assert.equal(setlists.hasMissingAlbums([{ album: 'Album' }]), false);
    assert.equal(setlists.hasMissingAlbums([{ album: '' }]), true);
    assert.equal(setlists.hasMissingAlbums([{ album: 'Unknown album' }]), true);
  });

  test('renders a compact album distribution with escaped labels', () => {
    const markup = setlists.albumStatsMarkup([
      { album: 'Album <One>' }, { album: 'Album <One>' }, { album: 'Other' }, { album: 'Other' }
    ], escapeHtml);
    assert.match(markup, /Album &lt;One>/);
    assert.equal((markup.match(/50%/g) || []).length, 6);
    assert.match(markup, /album-segment-0/);
    assert.match(markup, /album-segment-1/);
  });

  test('renders track titles, album tooltips and encore markers safely', () => {
    const markup = setlists.trackListMarkup([{ title: '<Song>', album: 'Record & EP', encore: true }, { title: 'Unknown' }], escapeHtml, 'Loading album…');
    assert.match(markup, /&lt;Song>/);
    assert.match(markup, /Record &amp; EP/);
    assert.match(markup, /<b>Encore<\/b>/);
    assert.match(markup, /Loading album…/);
    assert.equal((markup.match(/tabindex="0"/g) || []).length, 2);
  });

  test('hydrates missing albums only after the archive accordion opens', async () => {
    const content = { innerHTML: '' };
    const details = {
      open: false, dataset: {}, handler: null,
      addEventListener(_type, handler) { this.handler = handler; },
      querySelector: () => content, querySelectorAll: () => []
    };
    const setlist = { innerHTML: '', querySelector: () => details };
    const gig = { id: 'g1', songs: [{ title: 'Song', album: '' }], setlistFmUrl: 'https://setlist.fm/show' };
    let requests = 0;
    const controller = setlists.createController({ document: { addEventListener() {} }, escapeHtml, fetchJson: async () => { requests += 1; return { songs: [{ title: 'Song', album: 'Album' }] }; } });
    controller.setupArchive(setlist, gig);
    assert.equal(requests, 0);
    assert.match(setlist.innerHTML, /View source on setlist.fm/);
    details.open = true;
    await details.handler();
    assert.equal(requests, 1);
    assert.equal(gig.songs[0].album, 'Album');
    assert.equal(details.dataset.albumLoad, 'complete');
    assert.match(content.innerHTML, /Album/);
  });

  test('binds click and keyboard tooltip interactions once requested', () => {
    const events = [];
    const controller = setlists.createController({ document: { addEventListener: (type) => events.push(type) }, fetchJson: async () => ({}), escapeHtml });
    controller.bindTooltips();
    assert.deepEqual(events, ['click', 'keydown']);
  });
});
