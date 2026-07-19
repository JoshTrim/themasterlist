'use strict';

const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
});
const EXTENSION_MIMES = Object.freeze({
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'
});
const PROFILE_IMAGE_URL = /^\/api\/profile-images\/(profile-[a-f0-9-]+\.(?:jpe?g|png|webp|gif))$/i;

function filename(value) {
  return String(value || '').match(PROFILE_IMAGE_URL)?.[1] || '';
}

function validSignature(file, mimeType) {
  if (mimeType === 'image/jpeg') return file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
  if (mimeType === 'image/png') return file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(file.subarray(0, 6).toString('ascii'));
  if (mimeType === 'image/webp') return file.subarray(0, 4).toString('ascii') === 'RIFF' && file.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function decodeUpload(upload, maxSize = 8 * 1024 * 1024) {
  if (!upload) return null;
  const mimeType = String(upload.mimeType || '').toLowerCase();
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error('Profile photos must be JPEG, PNG, WebP or GIF images.');
  const encoded = String(upload.data || '').replace(/^data:[^,]+,/, '');
  const file = Buffer.from(encoded, 'base64');
  if (!file.length) throw new Error('The selected profile photo is empty.');
  if (file.length > maxSize) throw new Error('Profile photos must be 8 MB or smaller.');
  if (!validSignature(file, mimeType)) throw new Error('The selected file does not appear to be a valid image.');
  return { file, mimeType, extension };
}

function createProfileImages({ fs, path, mediaDir, randomUUID, maxSize = 8 * 1024 * 1024 }) {
  function resolve(value) {
    const name = filename(value);
    if (!name) return null;
    return { filename: name, filePath: path.join(mediaDir, name), mimeType: EXTENSION_MIMES[path.extname(name).toLowerCase()] };
  }

  async function save(upload) {
    const decoded = decodeUpload(upload, maxSize);
    if (!decoded) return null;
    const name = `profile-${randomUUID()}.${decoded.extension}`;
    await fs.mkdir(mediaDir, { recursive: true });
    await fs.writeFile(path.join(mediaDir, name), decoded.file);
    return `/api/profile-images/${name}`;
  }

  async function removeReplaced(previousImage, nextImage) {
    const previous = resolve(previousImage);
    if (previous && previousImage !== nextImage) await fs.rm(previous.filePath, { force: true });
  }

  return { filename, resolve, save, removeReplaced };
}

module.exports = { MIME_EXTENSIONS, EXTENSION_MIMES, filename, validSignature, decodeUpload, createProfileImages };
