const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const profiles = require('../public/lib/entity-profile-page');

const gigs = [
  { artist: 'Poppy', venue: 'The Tivoli', city: 'Brisbane', favorite: true, songs: [{ title: 'One' }, { title: 'Two' }] },
  { artist: 'poppy', venue: 'Riverstage', city: 'Brisbane', favorite: false, songs: [{ title: 'Three' }] },
  { artist: 'NIN', venue: 'Riverstage', city: 'Brisbane', favorite: true, songs: [] },
  { artist: 'NIN', venue: 'Riverstage', city: 'Gold Coast', favorite: false, songs: [{}] }
];

function element() {
  return { textContent: '', innerHTML: '', hidden: false, href: '', src: '', alt: '', style: {} };
}

describe('artist and venue profile pages', () => {
  test('presents persisted venue metadata consistently after edits', () => {
    const elements = { heading: element(), description: element(), bio: element(), closedBadge: element(), image: element(), source: element() };
    profiles.presentVenueMetadata(elements, {
      title: 'The Tivoli', description: 'Historic venue', bio: 'Venue bio', isClosed: true,
      image: '/venue.jpg', imagePosition: 'top', source: 'https://example.com'
    });
    assert.equal(elements.heading.textContent, 'The Tivoli');
    assert.equal(elements.closedBadge.hidden, false);
    assert.equal(elements.image.alt, 'The Tivoli photo');
    assert.equal(elements.image.style.objectPosition, 'top');
    assert.equal(elements.source.href, 'https://example.com');
  });

  test('selects profiles case-insensitively and calculates their archive statistics', () => {
    const artistRecords = profiles.artistShows(gigs, 'POPPY');
    const venueRecords = profiles.venueShows(gigs, 'RIVERSTAGE', 'brisbane');
    assert.equal(artistRecords.length, 2);
    assert.deepEqual(profiles.artistStats(artistRecords), { shows: 2, venues: 2, songs: 3, favourites: 1 });
    assert.equal(venueRecords.length, 2);
    assert.deepEqual(profiles.venueStats(venueRecords), { shows: 2, artists: 2, cities: 1, songs: 1, favourites: 1 });
  });

  test('renders an artist profile and its local show summary', async () => {
    const elements = { heading: element(), description: element(), bio: element(), image: element(), source: element(), editLink: element(), empty: element(), stats: element() };
    let rendered = [];
    const controller = profiles.createArtistController({
      page: 'artist', name: 'Poppy', getGigs: () => gigs,
      fetchJson: async () => ({ title: 'Poppy', description: 'Metal artist', bio: 'Biography', image: '/poppy.jpg', imagePosition: 'top', source: 'https://example.com' }),
      renderShows: (records) => { rendered = records; }, elements
    });
    await controller.render();
    assert.equal(rendered.length, 2);
    assert.match(elements.stats.innerHTML, /3 songs performed/);
    assert.equal(elements.empty.hidden, true);
    assert.equal(elements.image.src, '/poppy.jpg');
    assert.equal(elements.image.style.objectPosition, 'top');
    assert.equal(elements.source.href, 'https://example.com');
    assert.equal(elements.editLink.href, '/artist/edit?name=Poppy');
  });

  test('keeps artist shows visible when profile metadata cannot load', async () => {
    const elements = { heading: element(), description: element(), bio: element(), image: element(), source: element(), editLink: element(), empty: element(), stats: element() };
    const controller = profiles.createArtistController({
      page: 'artist', name: 'Poppy', getGigs: () => gigs,
      fetchJson: async () => { throw new Error('offline'); }, renderShows: () => {}, elements
    });
    await controller.render();
    assert.match(elements.stats.innerHTML, /2 shows/);
    assert.equal(elements.description.textContent, 'Artist information could not be loaded right now.');
    assert.equal(elements.bio.textContent, 'offline');
  });

  test('renders a venue profile with closure and edit state', async () => {
    const elements = { heading: element(), cityLabel: element(), closedBadge: element(), stats: element(), empty: element(), description: element(), bio: element(), image: element(), source: element(), editLink: element() };
    let rendered = [];
    const controller = profiles.createVenueController({
      page: 'venue', name: 'Riverstage', city: 'Brisbane', getGigs: () => gigs,
      fetchJson: async () => ({ title: 'Brisbane Riverstage', description: 'Outdoor venue', bio: 'Venue bio', isClosed: true, image: '/venue.jpg' }),
      renderShows: (records) => { rendered = records; }, elements
    });
    await controller.render();
    assert.equal(rendered.length, 2);
    assert.match(elements.stats.innerHTML, /2 artists/);
    assert.equal(elements.closedBadge.hidden, false);
    assert.equal(elements.empty.hidden, true);
    assert.equal(elements.editLink.href, '/venue/edit?name=Riverstage&city=Brisbane');
    assert.equal(elements.image.alt, 'Brisbane Riverstage photo');
  });
});
