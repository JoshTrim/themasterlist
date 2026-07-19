const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const shellRouter = require('../public/lib/shell-router');

function documentFixture(page = 'home') {
  const sections = Object.fromEntries(shellRouter.sectionIds.map((id) => [id, { hidden: false }]));
  return {
    body: { dataset: { page } }, sections,
    querySelector: (selector) => sections[selector.slice(1)] || null
  };
}

describe('application shell router', () => {
  test('maps every supported route to a rendered section', () => {
    for (const [route, sections] of Object.entries(shellRouter.routeSections)) {
      assert.ok(sections.length > 0, route);
      sections.forEach((id) => assert.ok(shellRouter.sectionIds.includes(id), `${route}:${id}`));
    }
  });

  test('shows only the section selected for a playback route', () => {
    const document = documentFixture('playback');
    assert.equal(shellRouter.apply(document), 'playback');
    assert.equal(document.sections['show-page'].hidden, false);
    assert.equal(document.sections['shows-archive'].hidden, true);
    assert.equal(Object.values(document.sections).filter((section) => !section.hidden).length, 1);
  });

  test('falls back unknown routes to the home section', () => {
    const document = documentFixture('unexpected');
    assert.equal(shellRouter.pageFor(document), 'unexpected');
    assert.equal(shellRouter.apply(document), 'home');
    assert.equal(document.sections['home-page'].hidden, false);
  });

  test('binds the home chest to the archive', () => {
    let handler;
    const destinations = [];
    shellRouter.bindChest({ location: { assign: (href) => destinations.push(href) } }, { addEventListener: (_type, callback) => { handler = callback; } });
    handler();
    assert.deepEqual(destinations, ['/shows']);
    assert.doesNotThrow(() => shellRouter.bindChest({ location: {} }, null));
  });
});
