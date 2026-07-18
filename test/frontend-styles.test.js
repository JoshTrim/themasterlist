const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('stylesheet entrypoint loads structural bundles in stable cascade order', () => {
  const root = path.resolve(__dirname, '..', 'public');
  const entry = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const bundles = ['shell-and-forms', 'components', 'playback', 'pages'];
  let previous = -1;
  bundles.forEach((name) => {
    const position = entry.indexOf(`/styles/${name}.css`);
    assert.ok(position > previous, `${name} is loaded in order`); previous = position;
    const css = fs.readFileSync(path.join(root, 'styles', `${name}.css`), 'utf8');
    assert.ok(css.length > 500, `${name} contains extracted rules`);
    assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, `${name} has balanced rule blocks`);
  });
  assert.match(fs.readFileSync(path.join(root, 'styles', 'playback.css'), 'utf8'), /\.set-player/);
  assert.match(fs.readFileSync(path.join(root, 'styles', 'pages.css'), 'utf8'), /entity-card/);
});
