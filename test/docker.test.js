const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('Docker builds native SQLite for its pinned runtime', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(dockerfile, /^FROM node:24\.16\.0-bookworm-slim$/m);
  assert.equal(packageJson.devDependencies['node-gyp'], '13.0.1');
  assert.match(dockerfile, /npm ci --include=dev/);
  assert.match(dockerfile, /node-gyp rebuild --release --force_build=1 --directory node_modules\/better-sqlite3/);
  assert.match(dockerfile, /find node_modules\/better-sqlite3\/prebuilds -type f -delete/);
  assert.match(dockerfile, /npm prune --omit=dev/);
  assert.match(dockerfile, /new Database\(':memory:'\)/);
  assert.match(dockerignore, /^node_modules$/m);
});
