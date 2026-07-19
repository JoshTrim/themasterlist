const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { filename, decodeUpload, createProfileImages } = require('../lib/profile-images');

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('profile image storage', () => {
  test('only resolves generated profile-image URLs', () => {
    assert.equal(filename('/api/profile-images/profile-123e4567-e89b-12d3-a456-426614174000.png'), 'profile-123e4567-e89b-12d3-a456-426614174000.png');
    for (const unsafe of ['../../secret.png', '/api/profile-images/../secret.png', '/api/profile-images/avatar.png', '/api/profile-images/profile-safe.svg']) {
      assert.equal(filename(unsafe), '', unsafe);
    }
  });

  test('validates declared type, decoded size and file signatures', () => {
    assert.deepEqual(decodeUpload({ mimeType: 'image/png', data: `data:image/png;base64,${png.toString('base64')}` }, 20), {
      file: png, mimeType: 'image/png', extension: 'png'
    });
    assert.throws(() => decodeUpload({ mimeType: 'image/svg+xml', data: 'PHN2Zz4=' }), /JPEG, PNG, WebP or GIF/);
    assert.throws(() => decodeUpload({ mimeType: 'image/png', data: '' }), /empty/);
    assert.throws(() => decodeUpload({ mimeType: 'image/png', data: Buffer.from('not png').toString('base64') }), /valid image/);
    assert.throws(() => decodeUpload({ mimeType: 'image/png', data: png.toString('base64') }, 4), /8 MB or smaller/);
  });

  test('accepts the signatures for every advertised profile-image format', () => {
    const signatures = [
      ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x01])],
      ['image/png', png],
      ['image/gif', Buffer.from('GIF89a-data')],
      ['image/webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPdata')])]
    ];
    signatures.forEach(([mimeType, file]) => assert.deepEqual(decodeUpload({ mimeType, data: file.toString('base64') }).file, file));
  });

  test('writes, resolves and removes only replaced local images', async (context) => {
    const mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'master-list-profile-images-'));
    context.after(() => fs.rm(mediaDir, { recursive: true, force: true }));
    const store = createProfileImages({
      fs, path, mediaDir, randomUUID: () => '123e4567-e89b-12d3-a456-426614174000'
    });
    const url = await store.save({ mimeType: 'image/png', data: png.toString('base64') });
    const resolved = store.resolve(url);
    assert.equal(resolved.mimeType, 'image/png');
    assert.deepEqual(await fs.readFile(resolved.filePath), png);
    assert.equal(store.resolve('/api/profile-images/../../secret.png'), null);
    await store.removeReplaced(url, url);
    assert.deepEqual(await fs.readFile(resolved.filePath), png);
    await store.removeReplaced('https://example.com/remote.png', null);
    await store.removeReplaced(url, null);
    await assert.rejects(fs.stat(resolved.filePath), { code: 'ENOENT' });
  });
});
