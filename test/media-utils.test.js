const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { mediaExtension, mediaCategory, safeMediaName, validMediaSignature, hashFile } = require('../lib/media-utils');

describe('media utilities', () => {
  test('chooses known, filename-derived and safe fallback extensions', () => {
    assert.equal(mediaExtension('video/mp4', 'wrong.mov'), 'mp4');
    assert.equal(mediaExtension('application/octet-stream', 'clip.MKV'), 'MKV');
    assert.equal(mediaExtension('application/octet-stream', 'no-extension'), 'bin');
    assert.equal(mediaExtension('application/octet-stream', 'unsafe.verylongextension'), 'verylo');
  });

  test('only accepts the artifact category explicitly', () => {
    assert.equal(mediaCategory('ARTIFACT'), 'artifact');
    assert.equal(mediaCategory('other'), 'show');
    assert.equal(mediaCategory(), 'show');
  });

  test('creates bounded filesystem-safe descriptive names', () => {
    assert.equal(safeMediaName(' Poppy @ Fortitude Music Hall! '), 'poppy-fortitude-music-hall');
    assert.equal(safeMediaName('***'), 'unknown');
    assert.ok(safeMediaName('a'.repeat(100)).length <= 60);
  });

  test('checks image and video container signatures instead of trusting MIME declarations', () => {
    assert.equal(validMediaSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'), true);
    assert.equal(validMediaSignature(Buffer.from('not a jpeg'), 'image/jpeg'), false);
    assert.equal(validMediaSignature(Buffer.from([0, 0, 0, 20, ...Buffer.from('ftypisom')]), 'video/mp4'), true);
    assert.equal(validMediaSignature(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'video/webm'), true);
  });

  test('hashes streamed file content for duplicate detection', async () => {
    const stream = () => Readable.from([Buffer.from('same'), Buffer.from(' content')]);
    assert.equal(await hashFile('unused', stream), 'a636bd7cd42060a4d07fa1bfbcc010eb7794c2ba721e1e3e4c20335a15b66eaf');
  });
});
