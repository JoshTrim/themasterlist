const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const externalMediaInput = require('../public/lib/external-media-input');

describe('external media input controller', () => {
  test('ignores missing and whitespace-only URLs', async () => {
    let requests = 0;
    const controller = externalMediaInput.createController({ fetchJson: async () => { requests += 1; } });
    assert.equal(await controller.add('g1', null), null);
    assert.equal(await controller.add('g1', { value: '   ' }), null);
    assert.equal(requests, 0);
  });

  test('posts trimmed external URLs and clears the input after success', async () => {
    const input = { value: '  https://youtu.be/abc  ' };
    const media = { id: 'm1', mimeType: 'video/youtube' };
    const controller = externalMediaInput.createController({ fetchJson: async (url, options) => {
      assert.equal(url, '/api/gigs/g1/media');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { externalUrl: 'https://youtu.be/abc', caption: 'YouTube video' });
      return media;
    } });
    assert.equal(await controller.add('g1', input), media);
    assert.equal(input.value, '');
  });

  test('preserves the entered URL when persistence fails', async () => {
    const input = { value: 'https://youtu.be/retry' };
    const controller = externalMediaInput.createController({ fetchJson: async () => { throw new Error('Offline'); } });
    await assert.rejects(controller.add('g1', input), /Offline/);
    assert.equal(input.value, 'https://youtu.be/retry');
  });

  test('accepts a caller-supplied caption', async () => {
    const input = { value: 'https://example.com/video' };
    let payload;
    const controller = externalMediaInput.createController({ fetchJson: async (_url, options) => { payload = JSON.parse(options.body); return {}; } });
    await controller.add('g1', input, 'Fan recording');
    assert.equal(payload.caption, 'Fan recording');
  });
});
