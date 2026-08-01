'use strict';

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

function containedPath(path, root, requested) {
  const filePath = path.resolve(root, requested);
  return filePath === root || filePath.startsWith(`${root}${path.sep}`) ? filePath : null;
}

function byteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (!match[1] && !match[2])) return false;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return false;
  return { start, end: Math.min(end, size - 1) };
}

function createFileServing({ fs, legacyFs, path, publicDir, mediaDir, database, profileImages, sendError }) {
  async function serveStatic(_request, response, pathname) {
    const requested = pathname === '/' ? 'index.html' : `.${pathname}`;
    const filePath = containedPath(path, publicDir, requested);
    if (!filePath) return sendError(response, 403, 'Forbidden');
    try {
      const file = await fs.readFile(filePath);
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      return response.end(file);
    } catch (error) {
      if (error.code === 'ENOENT' && !path.extname(pathname)) {
        const app = await fs.readFile(path.join(publicDir, 'index.html'));
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        return response.end(app);
      }
      if (error.code === 'ENOENT' || error.code === 'EISDIR') return sendError(response, 404, 'Not found');
      throw error;
    }
  }

  async function stream(response, filePath, mimeType, rangeHeader, cacheControl, extraHeaders = {}) {
    const stat = await fs.stat(filePath);
    const range = byteRange(rangeHeader, stat.size);
    if (range === false) {
      response.writeHead(416, { ...extraHeaders, 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' });
      return response.end();
    }
    if (range) {
      response.writeHead(206, { ...extraHeaders, 'Content-Type': mimeType, 'Content-Length': range.end - range.start + 1, 'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': cacheControl });
      return legacyFs.createReadStream(filePath, range).pipe(response);
    }
    response.writeHead(200, { ...extraHeaders, 'Content-Type': mimeType, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cacheControl });
    return legacyFs.createReadStream(filePath).pipe(response);
  }

  async function serveMedia(request, response, url, mediaId) {
    const media = database.prepare('SELECT * FROM gig_media WHERE id = ?').get(mediaId);
    if (!media) return sendError(response, 404, 'Media not found.');
    const useCutout = url.searchParams.get('variant') === 'cutout' && media.background_filename;
    const filename = useCutout ? media.background_filename : (media.playback_filename || media.filename);
    const filePath = containedPath(path, mediaDir, filename);
    if (!filePath) return sendError(response, 404, 'Media file not found.');
    try { return await stream(response, filePath, useCutout ? 'image/png' : (media.playback_mime || media.mime_type), request.headers.range, 'private, max-age=3600'); }
    catch (error) { if (error.code === 'ENOENT') return sendError(response, 404, 'Media file not found.'); throw error; }
  }

  async function serveProfileImage(request, response, profileImage) {
    // Profile image filenames contain a UUID and are replaced rather than
    // overwritten, so a URL can safely remain cached for its entire lifetime.
    try { return await stream(response, profileImage.filePath, profileImage.mimeType, request.headers.range, 'private, max-age=31536000, immutable'); }
    catch (error) { if (error.code === 'ENOENT') return sendError(response, 404, 'Profile image not found.'); throw error; }
  }

  async function handleStoredFile(request, response, url) {
    if (request.method !== 'GET') return false;
    const mediaMatch = url.pathname.match(/^\/api\/media\/([\w-]+)$/);
    if (mediaMatch) { await serveMedia(request, response, url, mediaMatch[1]); return true; }
    const profileImage = profileImages.resolve(url.pathname);
    if (profileImage) { await serveProfileImage(request, response, profileImage); return true; }
    return false;
  }

  return { serveStatic, handleStoredFile, serveMedia, serveProfileImage, stream };
}

module.exports = { CONTENT_TYPES, byteRange, containedPath, createFileServing };
