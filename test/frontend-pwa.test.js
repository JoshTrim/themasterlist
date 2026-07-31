const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { secureContext, registerServiceWorker } = require('../public/lib/pwa');

const publicRoot = path.resolve(__dirname, '..', 'public');

function pngSize(filename) {
  const image = fs.readFileSync(filename);
  assert.equal(image.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

describe('installable web app', () => {
  test('declares standalone identity, launch colours and complete icon purposes', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
    assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'));
    assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'));
    assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));
    manifest.icons.forEach((icon) => {
      const filename = path.join(publicRoot, icon.src);
      assert.ok(fs.existsSync(filename), icon.src);
      const expected = Number(icon.sizes.split('x')[0]);
      assert.deepEqual(pngSize(filename), { width: expected, height: expected });
    });
    assert.deepEqual(pngSize(path.join(publicRoot, 'assets/icons/apple-touch-icon.png')), { width: 180, height: 180 });
  });

  test('publishes manifest, theme and Apple installation metadata before page content', () => {
    const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, /name="theme-color" content="#16051f"/);
    assert.match(html, /name="viewport" content="[^"]*viewport-fit=cover/);
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /rel="apple-touch-icon"[^>]+180x180/);
    assert.ok(html.indexOf('/lib/pwa.js') < html.indexOf('/app.js'));
    const css = fs.readFileSync(path.join(publicRoot, 'styles/pages.css'), 'utf8');
    assert.match(css, /env\(safe-area-inset-top\)/);
    assert.match(css, /env\(safe-area-inset-bottom\)/);
  });

  test('registers only in browser-secure contexts and absorbs unsupported failures', async () => {
    assert.equal(secureContext({ protocol: 'https:', hostname: 'music.example' }), true);
    assert.equal(secureContext({ protocol: 'http:', hostname: '127.0.0.1' }), true);
    assert.equal(secureContext({ protocol: 'http:', hostname: '192.168.1.9' }), false);
    const calls = [];
    const registration = {};
    const navigator = { serviceWorker: { register: async (...args) => { calls.push(args); return registration; } } };
    assert.equal(await registerServiceWorker({ navigator, location: { protocol: 'https:', hostname: 'music.example' } }), registration);
    assert.deepEqual(calls, [['/service-worker.js', { scope: '/' }]]);
    assert.equal(await registerServiceWorker({ navigator, location: { protocol: 'http:', hostname: '192.168.1.9' } }), null);
    assert.equal(await registerServiceWorker({ navigator: {}, location: { protocol: 'https:', hostname: 'music.example' } }), null);
    assert.equal(await registerServiceWorker({
      navigator: { serviceWorker: { register: async () => { throw new Error('blocked'); } } },
      location: { protocol: 'https:', hostname: 'music.example' }
    }), null);
  });

  test('keeps private API and media traffic out of implicit worker caches', () => {
    const worker = fs.readFileSync(path.join(publicRoot, 'service-worker.js'), 'utf8');
    assert.doesNotMatch(worker, /caches\.open|cache\.put|respondWith/);
    assert.match(worker, /self\.skipWaiting/);
    assert.match(worker, /self\.clients\.claim/);
  });
});
