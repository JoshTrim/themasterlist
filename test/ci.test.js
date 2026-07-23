'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (filename) => fs.readFileSync(path.join(root, filename), 'utf8');
const ci = read('.github/workflows/ci.yml');
const release = read('.github/workflows/release.yml');
const hook = read('.githooks/pre-commit');
const compose = read('compose.yml');

test('CI owns full regressions, dependency auditing and a real container health check', () => {
  assert.match(ci, /workflow_call:/);
  assert.match(ci, /run: npm test/);
  assert.match(ci, /npm audit --omit=dev/);
  assert.match(ci, /docker\/build-push-action@[a-f0-9]{40}/);
  assert.match(ci, /curl .*\/api\/healthz/);
  assert.match(ci, /--read-only/);
});

test('release tags publish pinned multi-architecture GHCR images only after CI', () => {
  assert.match(release, /tags:\s*\n\s*- 'v\*\.\*\.\*'/);
  assert.match(release, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(release, /needs: verify/);
  assert.match(release, /packages: write/);
  assert.match(release, /linux\/amd64,linux\/arm64/);
  assert.match(release, /gh release create/);
  assert.doesNotMatch(release, /uses: [^\n]+@v\d/);
});

test('local commits stay listener-free and Compose knows the published image', () => {
  assert.match(hook, /npm run test:unit/);
  assert.doesNotMatch(hook, /^npm test$/m);
  assert.match(compose, /image: ghcr\.io\/joshtrim\/themasterlist:\$\{MASTER_LIST_VERSION:-latest\}/);
});
