const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const pageControllers = require('../public/lib/page-controllers');

const actionNames = [
  'renderDashboard', 'renderDirectories', 'renderTimeline', 'renderSearch', 'renderHealth', 'renderApiLimits',
  'renderMaintenance', 'renderActivity', 'renderConflicts', 'renderAddAttendees', 'populateAutofill',
  'populateYears', 'renderGigs', 'renderArtist', 'renderArtistEdit', 'renderShow', 'renderCity',
  'renderVenue', 'renderVenueEdit', 'renderEdit', 'renderMap', 'renderProfiles', 'renderSharedShows', 'renderInstanceSettings'
];

function fixture(search = '') {
  const calls = [];
  const messages = [];
  const actions = Object.fromEntries(actionNames.map((name) => [name, async () => { calls.push(name); return name; }]));
  const registry = pageControllers.createRegistry({
    window: { location: { search } },
    providerName: (provider) => provider === 'spotify' ? 'Spotify' : provider,
    setMessage: (...args) => messages.push(args),
    actions
  });
  return { registry, calls, messages };
}

describe('page controller registry', () => {
  test('maps shared renderers to their expected routes', async () => {
    const view = fixture();
    await view.registry.overview();
    await view.registry.artists();
    await view.registry.venues();
    await view.registry.show();
    await view.registry.playback();
    assert.deepEqual(view.calls, ['renderDashboard', 'renderDirectories', 'renderDirectories', 'renderShow', 'renderShow']);
  });

  test('initializes add, edit and account pages in dependency order', async () => {
    const add = fixture();
    await add.registry.add();
    assert.deepEqual(add.calls, ['renderAddAttendees', 'populateAutofill']);

    const edit = fixture();
    await edit.registry.edit();
    assert.deepEqual(edit.calls, ['populateAutofill', 'renderEdit']);

    const account = fixture();
    await account.registry.account();
    assert.deepEqual(account.calls, ['renderProfiles', 'renderSharedShows', 'renderInstanceSettings']);
  });

  test('presents successful integration callbacks before rendering shows', async () => {
    const view = fixture('?connected=spotify');
    await view.registry.shows();
    assert.deepEqual(view.messages, [['Spotify connected. Choose a show to export.']]);
    assert.deepEqual(view.calls, ['populateYears', 'renderGigs']);
  });

  test('presents integration failures with error styling', async () => {
    const view = fixture('?integrationError=access_denied');
    await view.registry.shows();
    assert.deepEqual(view.messages, [['Could not connect that music service. Check its configuration and try again.', true]]);
  });

  test('keeps shell routes as no-op controllers', async () => {
    const view = fixture();
    assert.equal(await view.registry.home(), undefined);
    assert.equal(await view.registry.login(), undefined);
    assert.deepEqual(view.calls, []);
  });
});
