const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const profileShows = require('../public/lib/profile-show-list');

function cardFixture() {
  const fields = {
    '.edit-gig': {}, '.show-detail-link': {}, '.play-gig': { setAttribute(name, value) { this[name] = value; } },
    '.gig-date': {}, '.gig-place': {}, '.gig-notes': {}, '.gig-summary': {}, '.gig-summary h3': {},
    '.venue-notes': {}, '.gig-ratings': {}, '.setlist': {}
  };
  let removed = 0;
  return {
    fields,
    get removed() { return removed; },
    querySelector: (selector) => fields[selector],
    querySelectorAll: () => [{ remove: () => { removed += 1; } }, { remove: () => { removed += 1; } }]
  };
}

function fixture() {
  const cards = [];
  const mediaCalls = [];
  const attendeeCalls = [];
  const renderer = profileShows.createRenderer({
    template: { content: { cloneNode: () => { const card = cardFixture(); cards.push(card); return card; } } },
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    formatGigDate: (date) => `date:${date}`,
    renderAttendeeSummary: (...args) => attendeeCalls.push(args),
    setupMedia: (...args) => mediaCalls.push(args)
  });
  const container = { children: [], replaceChildren() { this.children = []; }, append(card) { this.children.push(card); } };
  return { renderer, container, cards, mediaCalls, attendeeCalls };
}

describe('profile show list renderer', () => {
  test('only appends attendee summaries for shared shows', () => {
    const children = [];
    const container = { append: (child) => children.push(child) };
    const document = { createElement: () => ({}) };
    const attendeeNames = (gig) => gig.names;
    assert.equal(profileShows.appendAttendeeSummary({ document, container, gig: { names: ['Archive Owner'] }, attendeeNames }), null);
    const summary = profileShows.appendAttendeeSummary({
      document, container, gig: { names: ['Archive Owner', 'Sam'] }, attendeeNames, prefix: 'Attended by'
    });
    assert.equal(summary.className, 'gig-attendees-summary');
    assert.equal(summary.textContent, 'Attended by Archive Owner, Sam');
    assert.deepEqual(children, [summary]);
  });

  test('escapes track titles while retaining encore labels', () => {
    const markup = profileShows.setlistMarkup([{ title: 'One & <Two>', encore: true }], (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'));
    assert.equal(markup, '<ol><li>One &amp; &lt;Two> <b>Encore</b></li></ol>');
  });

  test('renders artist-page details with stable show links and ordinary media', () => {
    const view = fixture();
    const gig = {
      id: 'gig one', artist: 'Artist', venue: 'Venue', city: 'City', date: '2026-01-02',
      notes: 'Memory', venueNotes: 'Great room', performanceRating: 5, venueRating: 4,
      songs: [{ title: 'Opening' }], media: [{ id: 'video' }, { id: 'shirt', category: 'artifact' }]
    };
    view.renderer.renderArtist(view.container, [gig]);
    const card = view.cards[0];
    assert.equal(card.fields['.edit-gig'].href, '/edit?id=gig%20one');
    assert.equal(card.fields['.show-detail-link'].href, '/show?id=gig%20one');
    assert.equal(card.fields['.play-gig'].href, '/playback?id=gig%20one');
    assert.equal(card.fields['.play-gig']['aria-label'], 'Play set');
    assert.equal(card.fields['.gig-summary h3'].textContent, 'Artist');
    assert.match(card.fields['.gig-ratings'].innerHTML, /Performance 5/);
    assert.match(card.fields['.setlist'].innerHTML, /Opening/);
    assert.deepEqual(view.mediaCalls[0][1], [{ id: 'video' }]);
    assert.equal(card.removed, 2);
    assert.equal(view.container.children.length, 1);
  });

  test('links artists from venue-page cards and clears stale cards', () => {
    const view = fixture();
    view.container.children.push({ stale: true });
    view.renderer.renderVenue(view.container, [{ id: 'g1', artist: 'A & B', venue: 'Hall', city: 'Brisbane', songs: [], media: [] }]);
    assert.equal(view.container.children.length, 1);
    assert.match(view.cards[0].fields['.gig-summary h3'].innerHTML, /\/artist\?name=A%20%26%20B/);
    assert.match(view.cards[0].fields['.gig-summary h3'].innerHTML, /A &amp; B/);
  });
});
