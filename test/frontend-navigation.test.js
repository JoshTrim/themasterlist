const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { initNavigation } = require('../public/lib/navigation');

function eventTarget(properties = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    ...properties,
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type) { return listeners.get(type)?.(); },
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); }
  };
}

describe('frontend navigation', () => {
  test('marks the current route and keeps mobile-menu state accessible', () => {
    const classes = new Set();
    const links = [eventTarget({ pathname: '/shows' }), eventTarget({ pathname: '/map' })];
    const nav = eventTarget({
      classList: {
        toggle(name) { if (classes.has(name)) classes.delete(name); else classes.add(name); return classes.has(name); },
        remove(name) { classes.delete(name); }
      },
      querySelectorAll() { return links; }
    });
    const toggle = eventTarget();
    const document = { querySelector(selector) { return selector === '#site-nav' ? nav : toggle; } };

    initNavigation({ document, location: { pathname: '/shows' } });
    assert.equal(links[0].getAttribute('aria-current'), 'page');
    toggle.dispatch('click');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(toggle.getAttribute('aria-label'), 'Close navigation');
    links[1].dispatch('click');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-label'), 'Open navigation');
  });
});
