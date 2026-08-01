const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const guideFiles = fs.readdirSync(path.join(root, 'docs'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => `docs/${entry.name}`);
const trackedDocs = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'ARCHITECTURE.md', ...guideFiles];

test('relative Markdown links point to files that exist', () => {
  for (const filename of trackedDocs) {
    const contents = fs.readFileSync(path.join(root, filename), 'utf8');
    for (const match of contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const destination = match[1].split('#')[0];
      if (!destination || /^[a-z]+:/i.test(destination)) continue;
      const resolved = path.resolve(path.dirname(path.join(root, filename)), decodeURIComponent(destination));
      assert.equal(fs.existsSync(resolved), true, `${filename} links to missing ${destination}`);
    }
  }
});

test('local HTML documentation assets point to files that exist', () => {
  for (const filename of trackedDocs) {
    const contents = fs.readFileSync(path.join(root, filename), 'utf8');
    for (const match of contents.matchAll(/<(?:img|a)\b[^>]+(?:src|href)="([^"]+)"/gi)) {
      const destination = match[1].split('#')[0];
      if (!destination || /^[a-z]+:/i.test(destination)) continue;
      const resolved = path.resolve(path.dirname(path.join(root, filename)), decodeURIComponent(destination));
      assert.equal(fs.existsSync(resolved), true, `${filename} embeds missing ${destination}`);
    }
  }
});

test('the environment template covers every operator-facing runtime setting', () => {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const expected = [
    'PORT', 'HOST', 'APP_ORIGIN', 'BIND_ADDRESS', 'SESSION_COOKIE_SECURE', 'OWNER_SETUP_TOKEN',
    'CONNECTIONS_ENCRYPTION_KEY', 'CONNECTIONS_ENCRYPTION_KEY_PREVIOUS', 'INSTANCE_NAME',
    'SETLIST_FM_API_KEY', 'AUDD_API_TOKEN', 'GOOGLE_CUSTOM_SEARCH_API_KEY', 'GOOGLE_CUSTOM_SEARCH_ENGINE_ID',
    'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'APPLE_MUSIC_DEVELOPER_TOKEN', 'APPLE_MUSIC_STOREFRONT', 'YOUTUBE_DAILY_QUOTA_UNITS', 'YOUTUBE_REGION_CODE',
    'MAX_MEDIA_SIZE_GB', 'MAX_MEDIA_STORAGE_GB', 'MEDIA_STORAGE_WARNING_PERCENT', 'REMBG_COMMAND', 'REMBG_MODEL',
    'BACKUP_ENABLED', 'BACKUP_INTERVAL_HOURS', 'BACKUP_RETENTION_COUNT'
  ];
  for (const name of expected) assert.match(example, new RegExp(`^#?\\s*${name}=`, 'm'), `${name} is missing from .env.example`);
});

test('onboarding documents current account and encrypted-token behavior', () => {
  const documentation = trackedDocs.map((filename) => fs.readFileSync(path.join(root, filename), 'utf8')).join('\n');
  assert.match(documentation, /one owner|single owner/i);
  assert.match(documentation, /CONNECTIONS_ENCRYPTION_KEY/);
  assert.doesNotMatch(documentation, /OAuth connections are local to this prototype|stored unencrypted/i);
  assert.equal(fs.existsSync(path.join(root, '.env.playlists.example')), false);
});
