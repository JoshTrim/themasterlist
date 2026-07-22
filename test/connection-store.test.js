const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const legacyFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConnectionStore, decodeKey, isEnvelope } = require('../lib/connection-store');

const directories = [];
async function fixture(key, previousKey = '') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'master-list-connections-'));
  directories.push(directory);
  const filePath = path.join(directory, 'connections.json');
  return { filePath, store: createConnectionStore({ fs, path, filePath, key, previousKey }) };
}

afterEach(async () => Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))));

test('validates encryption keys and encrypts OAuth tokens with AES-GCM', async () => {
  assert.throws(() => decodeKey('short'), /32-byte key/);
  const key = Buffer.alloc(32, 1).toString('base64');
  const { filePath, store } = await fixture(key);
  const connections = { spotify: { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: 123 } };
  await store.write(connections);
  const disk = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(isEnvelope(disk), true);
  assert.doesNotMatch(await fs.readFile(filePath, 'utf8'), /refresh-secret/);
  assert.deepEqual(await store.read(), connections);
  assert.equal(legacyFs.statSync(filePath).mode & 0o777, 0o600);
});

test('automatically migrates a plaintext connection file when a key is configured', async () => {
  const key = Buffer.alloc(32, 2).toString('base64');
  const { filePath, store } = await fixture(key);
  await fs.writeFile(filePath, JSON.stringify({ youtube: { refreshToken: 'legacy-secret' } }));
  assert.equal((await store.read()).youtube.refreshToken, 'legacy-secret');
  assert.equal(isEnvelope(JSON.parse(await fs.readFile(filePath, 'utf8'))), true);
});

test('uses a previous key once and rewrites the store with the current key', async () => {
  const oldKey = Buffer.alloc(32, 3).toString('base64');
  const newKey = Buffer.alloc(32, 4).toString('base64');
  const initial = await fixture(oldKey);
  await initial.store.write({ youtube: { refreshToken: 'rotated-secret' } });
  const rotated = createConnectionStore({ fs, path, filePath: initial.filePath, key: newKey, previousKey: oldKey });
  assert.equal((await rotated.read()).youtube.refreshToken, 'rotated-secret');
  const currentOnly = createConnectionStore({ fs, path, filePath: initial.filePath, key: newKey });
  assert.equal((await currentOnly.read()).youtube.refreshToken, 'rotated-secret');
});

test('fails safely when an encrypted file is opened without the correct key', async () => {
  const key = Buffer.alloc(32, 5).toString('base64');
  const { filePath, store } = await fixture(key);
  await store.write({ spotify: { refreshToken: 'secret' } });
  await assert.rejects(createConnectionStore({ fs, path, filePath }).read(), /not configured/);
  await assert.rejects(createConnectionStore({ fs, path, filePath, key: Buffer.alloc(32, 6).toString('base64') }).read(), /could not be decrypted/);
});
