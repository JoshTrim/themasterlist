const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const shared = require('../public/lib/shared-shows-page');

describe('shared shows page model', () => {
  test('collects valid attendee names only', () => {
    assert.deepEqual(shared.attendeeNames({ attendees: [{ name: 'Archive Owner' }, null, {}, { name: 'Sam' }] }), ['Archive Owner', 'Sam']);
    assert.deepEqual(shared.attendeeNames({}), []);
  });

  test('partitions local, remote and legacy shows without duplicating synced local records', () => {
    const gigs = [
      { id: 'solo', attendees: [{ name: 'Archive Owner' }] },
      { id: 'local', sharedId: 'shared-local', attendees: [{ name: 'Archive Owner' }, { name: 'Sam' }] }
    ];
    const sharedShows = [
      { id: 'shared-local', contributions: [{}] },
      { id: 'remote', contributions: [{}] },
      { id: 'legacy', contributions: [] }
    ];
    const result = shared.partitionShows(gigs, sharedShows);
    assert.deepEqual(result.local.map((show) => show.id), ['local']);
    assert.deepEqual(result.remote.map((show) => show.id), ['remote']);
    assert.deepEqual(result.legacy.map((show) => show.id), ['legacy']);
    assert.equal(result.total, 3);
  });

  test('describes local, synced and pending peer contributions', () => {
    const gig = { performanceRating: 4, venueRating: 3, favorite: true };
    assert.match(shared.contributionDetail({ gig, isLocal: true }), /Performance 4\/5.*Favourite/);
    assert.equal(shared.contributionDetail({ gig, isLocal: false }), 'Peer contribution will appear after sync');
    assert.match(shared.contributionDetail({ gig, isLocal: false, contribution: { performanceRating: 5, venueRating: null, media: [{}, {}] } }), /Performance 5\/5.*Venue unrated.*2 media/);
  });

  test('summarizes average ratings and media across contributions', () => {
    const contributions = [
      { performanceRating: 5, venueRating: 3, media: [{}] },
      { performanceRating: 4, venueRating: 5, media: [{}, {}] }
    ];
    assert.equal(shared.averageLabel(contributions, 'performanceRating', 'Performance'), 'Performance average 4.5 / 5');
    assert.equal(shared.localSummary(contributions, {}), 'Performance average 4.5 / 5 · Venue average 4.0 / 5 · 3 media items across attendees');
    assert.match(shared.localSummary([], { media: [{}] }), /Performance unrated.*1 media item/);
  });

  test('renders five selectable review stars and its numeric label', () => {
    const handlers = [];
    const label = { textContent: '' };
    const stars = {
      dataset: { value: '3' }, innerHTML: '',
      closest: () => ({ querySelector: () => label }),
      querySelectorAll: () => [1, 2, 3, 4, 5].map((value) => ({ value: String(value), addEventListener: (_type, handler) => handlers.push(handler) }))
    };
    shared.renderStars(stars);
    assert.equal((stars.innerHTML.match(/<button/g) || []).length, 5);
    assert.equal((stars.innerHTML.match(/selected/g) || []).length, 3);
    assert.equal(label.textContent, '3 / 5');
    assert.equal(handlers.length, 5);
  });

  test('renders profile state and an empty collaboration archive', () => {
    let activeProfileId = 'missing';
    const state = { gigs: [], sharedShows: [], profiles: [{ id: 'owner', name: 'Archive Owner' }], activeProfileId, account: { id: 'owner' } };
    const options = [];
    class OptionStub { constructor(label, value) { this.label = label; this.value = value; } }
    const profileSelect = { value: '', replaceChildren(option) { options.splice(0, options.length, option); }, add(option) { options.push(option); } };
    const message = { textContent: '', classList: { toggle() {} } };
    const list = { children: [], replaceChildren() { this.children = []; }, append(value) { this.children.push(value); } };
    const controller = shared.createController({
      document: {}, OptionClass: OptionStub, navigator: {}, fetchJson: async () => [], escapeHtml: String, formatDate: String,
      getState: () => ({ ...state, activeProfileId }), onActiveProfile: (value) => { activeProfileId = value; },
      elements: { profileSelect, message, list, template: {}, inviteButton: null }
    });
    assert.equal(controller.renderProfiles(), 'owner');
    assert.equal(profileSelect.value, 'owner');
    assert.equal(options[1].label, 'Archive Owner');
    assert.equal(controller.render().total, 0);
    assert.match(message.textContent, /Add attendees/);
  });

  test('refreshes collaboration data before rendering and copies account invites', async () => {
    let state = { gigs: [], sharedShows: [], profiles: [], activeProfileId: 'owner', account: { id: 'owner' } };
    const requests = [];
    let copied = '';
    class OptionStub { constructor(label, value) { this.label = label; this.value = value; } }
    const profileSelect = { value: '', replaceChildren() {}, add() {} };
    const message = { textContent: '', classList: { toggle() {} } };
    const list = { replaceChildren() {}, append() {} };
    const controller = shared.createController({
      document: {}, OptionClass: OptionStub, navigator: { clipboard: { writeText: async (value) => { copied = value; } } },
      escapeHtml: String, formatDate: String, getState: () => state,
      onData: (data) => { state = { ...state, ...data }; }, onActiveProfile: (value) => { state.activeProfileId = value; },
      elements: { profileSelect, message, list, template: {}, inviteButton: null },
      fetchJson: async (url) => {
        requests.push(url);
        if (url === '/api/profiles') return [{ id: 'owner', name: 'Archive Owner' }];
        if (url === '/api/shared/shows') return [];
        return { inviteUrl: 'https://archive.test/login?invite=secret' };
      }
    });
    await controller.refresh();
    assert.deepEqual(requests.slice(0, 2).sort(), ['/api/profiles', '/api/shared/shows']);
    assert.equal(state.profiles[0].name, 'Archive Owner');
    await controller.createAccountInvite();
    assert.equal(copied, 'https://archive.test/login?invite=secret');
    assert.match(message.textContent, /copied/);
  });
});
