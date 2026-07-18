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

async function hashFile(filePath, createReadStream = fs.createReadStream) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

module.exports = { mediaExtension, mediaCategory, safeMediaName, hashFile };
