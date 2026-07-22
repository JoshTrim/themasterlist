'use strict';

const path = require('node:path');
const { createHash } = require('node:crypto');
const fs = require('node:fs');

function mediaExtension(mimeType, filename) {
  const known = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
  return known[mimeType] || path.extname(filename || '').slice(1).replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'bin';
}

function mediaCategory(value) {
  return String(value || '').toLowerCase() === 'artifact' ? 'artifact' : 'show';
}

function safeMediaName(value) {
  return String(value || 'undated').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'unknown';
}

function validMediaSignature(buffer, mimeType) {
  const file = Buffer.from(buffer || []);
  if (mimeType === 'image/jpeg') return file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
  if (mimeType === 'image/png') return file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(file.subarray(0, 6).toString('ascii'));
  if (mimeType === 'image/webp') return file.length >= 12 && file.subarray(0, 4).toString('ascii') === 'RIFF' && file.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') return file.length >= 12 && file.subarray(4, 8).toString('ascii') === 'ftyp';
  if (mimeType === 'video/webm') return file.length >= 4 && file.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return false;
}

async function hashFile(filePath, createReadStream = fs.createReadStream) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

module.exports = { mediaExtension, mediaCategory, safeMediaName, validMediaSignature, hashFile };
