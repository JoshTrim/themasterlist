const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, formatGigDate, formatBytes, providerName } = require('../public/lib/formatters');

describe('frontend formatters', () => {
  test('escapes all HTML-significant characters used by templates', () => {
    assert.equal(escapeHtml(`<a title="x">Tom & 'friend'</a>`), '&lt;a title=&quot;x&quot;&gt;Tom &amp; &#39;friend&#39;&lt;/a&gt;');
  });

  test('formats missing and calendar dates without UTC day drift', () => {
    assert.equal(formatGigDate(''), 'Date unknown');
    assert.match(formatGigDate('2026-07-18'), /2026/);
  });

  test('formats storage sizes across units', () => {
    assert.equal(formatBytes(12), '12 B');
    assert.equal(formatBytes(1024), '1.00 KB');
    assert.equal(formatBytes(10 * 1024 * 1024), '10.0 MB');
  });

  test('maps integration identifiers to display names', () => {
    assert.equal(providerName('apple-music'), 'Apple Music');
    assert.equal(providerName('unknown'), undefined);
  });
});
