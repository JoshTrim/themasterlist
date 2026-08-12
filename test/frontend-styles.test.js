const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const publicRoot = path.resolve(__dirname, '..', 'public');

test('stylesheet entrypoint loads structural bundles in stable cascade order', () => {
  const entry = fs.readFileSync(path.join(publicRoot, 'styles.css'), 'utf8');
  const bundles = ['shell-and-forms', 'components', 'playback', 'pages'];
  let previous = -1;
  bundles.forEach((name) => {
    const position = entry.indexOf(`/styles/${name}.css`);
    assert.ok(position > previous, `${name} is loaded in order`); previous = position;
    const css = fs.readFileSync(path.join(publicRoot, 'styles', `${name}.css`), 'utf8');
    assert.ok(css.length > 500, `${name} contains extracted rules`);
    assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, `${name} has balanced rule blocks`);
  });
  assert.match(fs.readFileSync(path.join(publicRoot, 'styles', 'playback.css'), 'utf8'), /\.set-player/);
  assert.match(fs.readFileSync(path.join(publicRoot, 'styles', 'pages.css'), 'utf8'), /entity-card/);
});

test('mobile show cards keep controls and performance rating in bounded rows', () => {
  const css = fs.readFileSync(path.join(publicRoot, 'styles', 'pages.css'), 'utf8');
  assert.match(css, /body\[data-page="shows"\] \.gig-card > \* \{ min-width: 0; \}/);
  assert.match(css, /\.quick-rating \{ width: 100%; grid-template-columns: minmax\(72px, 1fr\) repeat\(5, minmax\(0, 32px\)\)/);
  assert.match(css, /\.quick-rating \.rating-label \{ min-width: 0; min-height: 32px; margin: 0; align-content: center;/);
  assert.match(css, /\.quick-rating \.quick-star \{ display: grid; width: 100%; max-width: 32px; height: 32px;/);
  assert.match(css, /\.gig-meta \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) 36px;/);
  assert.match(css, /body\[data-page="shows"\] main \{ padding-right: 16px; padding-left: 16px; \}/);
});

test('narrow layouts contain playback metadata and long maintenance commands', () => {
  const pages = fs.readFileSync(path.join(publicRoot, 'styles', 'pages.css'), 'utf8');
  const playback = fs.readFileSync(path.join(publicRoot, 'styles', 'playback.css'), 'utf8');
  assert.match(pages, /body\[data-page="playback"\] \.show-detail-header h1 \{ max-width: 100%; overflow-wrap: anywhere;/);
  assert.match(pages, /body\[data-page="playback"\] \.show-detail-header > \.show-memory-hero-copy \{ display: flex;/);
  assert.doesNotMatch(pages, /body\[data-page="playback"\] \.show-detail-header > div \{ display:/);
  assert.match(pages, /\.update-commands pre \{ max-width: 100%; box-sizing: border-box; white-space: pre-wrap;/);
  assert.match(pages, /\.site-nav \.site-nav-group a \{ display: flex; min-height: 40px;/);
  assert.match(playback, /\.set-player-heading \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(playback, /\.set-player-source \{ width: 100%; min-width: 0; justify-items: start;/);
});
