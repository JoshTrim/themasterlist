'use strict';

const { once } = require('node:events');

const FORMAT = 'the-master-list-instance-v1';
const MAGIC = Buffer.from('THE-MASTER-LIST-INSTANCE-V1\n', 'utf8');
const MAX_HEADER_BYTES = 8 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const JSON_FILE_LIMIT = 50 * 1024 * 1024;
const MAX_IMPORT_CHUNK_BYTES = 8 * 1024 * 1024;
const IMPORT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function transferError(message, status = 400) {
  const error = new Error(message); error.status = status; return error;
}

function safeBundlePath(value) {
  const name = String(value || '').replaceAll('\\', '/');
  if (!name || name.startsWith('/') || name.includes('\0') || name.split('/').some((part) => !part || part === '.' || part === '..')) return false;
  return ['manifest.json', 'master-list.sqlite', 'connections.json', 'geocodes.json'].includes(name) || name.startsWith('media/');
}

async function pathExists(fs, filename) {
  try { await fs.access(filename); return true; } catch { return false; }
}

async function writeChunk(output, chunk) {
  if (!output.write(chunk)) await once(output, 'drain');
}

function headerBuffer(entryPath, size) {
  const header = Buffer.from(JSON.stringify({ path: entryPath, size }), 'utf8');
  if (header.length > MAX_HEADER_BYTES) throw transferError(`Bundle path is too long: ${entryPath}`);
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  return [length, header];
}

async function writeEntry(output, crypto, entry) {
  const [length, header] = headerBuffer(entry.path, entry.size);
  await writeChunk(output, length); await writeChunk(output, header);
  const hash = crypto.createHash('sha256'); let written = 0;
  if (entry.buffer) {
    hash.update(entry.buffer); written = entry.buffer.length; await writeChunk(output, entry.buffer);
  } else {
    for await (const chunk of entry.stream()) {
      const remaining = entry.size - written;
      if (remaining <= 0) break;
      const part = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      hash.update(part); written += part.length; await writeChunk(output, part);
    }
  }
  if (written !== entry.size) throw transferError(`File changed while the bundle was being created: ${entry.path}`, 409);
  await writeChunk(output, hash.digest());
}

class StreamReader {
  constructor(input) { this.iterator = input[Symbol.asyncIterator](); this.buffer = Buffer.alloc(0); this.ended = false; this.bytes = 0; }

  async fill() {
    if (this.buffer.length || this.ended) return;
    const next = await this.iterator.next();
    if (next.done) { this.ended = true; return; }
    this.buffer = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
  }

  async consume(size, visitor) {
    let remaining = size;
    while (remaining > 0) {
      await this.fill();
      if (!this.buffer.length) throw transferError('Instance bundle ended unexpectedly.');
      const count = Math.min(remaining, this.buffer.length);
      const part = this.buffer.subarray(0, count);
      this.buffer = this.buffer.subarray(count); remaining -= count; this.bytes += count;
      if (visitor) await visitor(part);
    }
  }

  async exact(size) {
    const chunks = []; let length = 0;
    await this.consume(size, (chunk) => { chunks.push(chunk); length += chunk.length; });
    return Buffer.concat(chunks, length);
  }

  async ensureEnd() {
    await this.fill();
    if (this.buffer.length || !this.ended) throw transferError('Instance bundle contains unexpected trailing data.');
  }
}

async function listMediaEntries({ fs, legacyFs, path, mediaDir }) {
  const entries = [];
  async function walk(directory, relative = '') {
    let children = [];
    try { children = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.isSymbolicLink()) continue;
      if (child.isFile() && /(?:\.uploading|\.processing\.png|\.rotating\.mp4|\.trimming\.mp4)$/i.test(child.name)) continue;
      const relativeName = relative ? `${relative}/${child.name}` : child.name;
      const filename = path.join(directory, child.name);
      if (child.isDirectory()) await walk(filename, relativeName);
      else if (child.isFile()) {
        const stat = await fs.stat(filename);
        entries.push(stat.size === 0
          ? { path: `media/${relativeName.replaceAll('\\', '/')}`, size: 0, buffer: Buffer.alloc(0) }
          : { path: `media/${relativeName.replaceAll('\\', '/')}`, size: stat.size, stream: () => legacyFs.createReadStream(filename, { start: 0, end: stat.size - 1 }) });
      }
    }
  }
  await walk(mediaDir);
  return entries;
}

function validateDatabase(filename, Database) {
  const candidate = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const tables = new Set(candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    for (const required of ['gigs', 'gig_media', 'profiles', 'instance_identity']) if (!tables.has(required)) throw transferError(`Instance database is missing the ${required} table.`);
    const check = candidate.prepare('PRAGMA quick_check').all().map((row) => Object.values(row)[0]);
    if (check.some((value) => value !== 'ok')) throw transferError(`Instance database failed its integrity check: ${check.join('; ')}`);
  } finally { candidate.close(); }
}

function createInstanceTransfer({
  database, Database, fs, legacyFs, path, crypto, dataDir, databaseFile, mediaDir, backupDir,
  connectionsFile, geocodesFile, pendingDir, maxBundleSize, randomUUID, appVersion = '0.0.0', now = () => new Date()
}) {
  const importSessions = new Map();

  async function exportInstance(response) {
    await fs.mkdir(dataDir, { recursive: true });
    const snapshot = path.join(dataDir, `.instance-export-${randomUUID()}.sqlite`);
    try {
      await database.backup(snapshot);
      const databaseStat = await fs.stat(snapshot);
      const entries = [{ path: 'master-list.sqlite', size: databaseStat.size, stream: () => legacyFs.createReadStream(snapshot) }];
      for (const [entryPath, filename] of [['connections.json', connectionsFile], ['geocodes.json', geocodesFile]]) {
        try {
          const buffer = await fs.readFile(filename);
          entries.push({ path: entryPath, size: buffer.length, buffer });
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      entries.push(...await listMediaEntries({ fs, legacyFs, path, mediaDir }));
      const payloadBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
      const manifest = Buffer.from(`${JSON.stringify({
        format: FORMAT, createdAt: now().toISOString(), appVersion,
        fileCount: entries.length, payloadBytes,
        includes: ['database', 'media', 'encrypted OAuth connections when present', 'geocodes'],
        excludes: ['.env and encryption keys', 'scheduled backups', 'temporary processing files and downloaded model caches']
      }, null, 2)}\n`, 'utf8');
      response.writeHead(200, {
        'Content-Type': 'application/vnd.the-master-list.instance',
        'Content-Disposition': `attachment; filename="the-master-list-instance-${now().toISOString().slice(0, 10)}.tml-instance"`,
        'Cache-Control': 'no-store'
      });
      await writeChunk(response, MAGIC);
      await writeEntry(response, crypto, { path: 'manifest.json', size: manifest.length, buffer: manifest });
      for (const entry of entries) await writeEntry(response, crypto, entry);
      const terminator = Buffer.alloc(4); await writeChunk(response, terminator);
      response.end();
    } finally { await fs.rm(snapshot, { force: true }).catch(() => {}); }
  }

  async function stageImport(request) {
    if (await pathExists(fs, pendingDir)) throw transferError('A full instance import is already staged. Restart the server or remove the staged import first.', 409);
    const stagingDir = path.join(dataDir, `.instance-import-upload-${randomUUID()}`);
    const payloadDir = path.join(stagingDir, 'payload');
    await fs.mkdir(path.join(payloadDir, 'media'), { recursive: true, mode: 0o700 });
    const reader = new StreamReader(request); const seen = new Set(); let manifest = null; let declaredBytes = 0; let payloadBytes = 0; let payloadFiles = 0;
    try {
      const magic = await reader.exact(MAGIC.length);
      if (!magic.equals(MAGIC)) throw transferError('Choose a valid The Master List instance bundle.');
      while (true) {
        const headerSize = (await reader.exact(4)).readUInt32BE(0);
        if (headerSize === 0) break;
        if (headerSize > MAX_HEADER_BYTES) throw transferError('Instance bundle contains an invalid entry header.');
        let header;
        try { header = JSON.parse((await reader.exact(headerSize)).toString('utf8')); } catch { throw transferError('Instance bundle contains an invalid entry header.'); }
        const entryPath = String(header.path || ''); const size = Number(header.size);
        if (!safeBundlePath(entryPath) || !Number.isSafeInteger(size) || size < 0) throw transferError('Instance bundle contains an unsafe file entry.');
        if (seen.has(entryPath)) throw transferError(`Instance bundle contains duplicate file entries: ${entryPath}`);
        if (!seen.size && entryPath !== 'manifest.json') throw transferError('Instance bundle manifest must be the first entry.');
        if (entryPath === 'manifest.json' && size > MAX_MANIFEST_BYTES) throw transferError('Instance bundle manifest is too large.');
        if (['connections.json', 'geocodes.json'].includes(entryPath) && size > JSON_FILE_LIMIT) throw transferError(`${entryPath} is unexpectedly large.`);
        declaredBytes += size;
        if (declaredBytes > maxBundleSize) throw transferError('Instance bundle exceeds the configured archive storage limit.', 413);
        seen.add(entryPath);
        const hash = crypto.createHash('sha256');
        if (entryPath === 'manifest.json') {
          const buffer = await reader.exact(size); hash.update(buffer);
          try { manifest = JSON.parse(buffer.toString('utf8')); } catch { throw transferError('Instance bundle manifest is invalid.'); }
        } else {
          const destination = path.join(payloadDir, ...entryPath.split('/'));
          await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
          const output = await fs.open(destination, 'wx', 0o600);
          try { await reader.consume(size, async (chunk) => { hash.update(chunk); await output.write(chunk); }); }
          finally { await output.close(); }
          payloadFiles += 1; payloadBytes += size;
        }
        const expected = await reader.exact(32); const actual = hash.digest();
        if (!crypto.timingSafeEqual(expected, actual)) throw transferError(`Instance bundle checksum failed for ${entryPath}.`);
      }
      await reader.ensureEnd();
      if (manifest?.format !== FORMAT) throw transferError('Instance bundle format is not supported.');
      if (!seen.has('master-list.sqlite')) throw transferError('Instance bundle does not contain a database.');
      if (manifest.fileCount !== payloadFiles) throw transferError('Instance bundle file count does not match its manifest.');
      if (manifest.payloadBytes !== payloadBytes) throw transferError('Instance bundle size does not match its manifest.');
      validateDatabase(path.join(payloadDir, 'master-list.sqlite'), Database);
      for (const filename of ['connections.json', 'geocodes.json']) {
        const target = path.join(payloadDir, filename);
        if (await pathExists(fs, target)) { try { JSON.parse(await fs.readFile(target, 'utf8')); } catch { throw transferError(`${filename} is not valid JSON.`); } }
      }
      const marker = { format: FORMAT, stagedAt: now().toISOString(), createdAt: manifest.createdAt, appVersion: manifest.appVersion, files: payloadFiles, bytes: declaredBytes };
      await fs.writeFile(path.join(stagingDir, 'ready.json'), `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(stagingDir, pendingDir);
      return { staged: true, restartRequired: true, files: payloadFiles, bytes: declaredBytes, createdAt: manifest.createdAt };
    } catch (error) {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  async function receiveImportChunk(request) {
    const uploadId = String(request.headers['x-upload-id'] || '');
    const total = Number(request.headers['x-upload-total'] || 0);
    const offset = Number(request.headers['x-upload-offset'] || 0);
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(uploadId) || !Number.isSafeInteger(total) || total <= 0 || total > maxBundleSize || !Number.isSafeInteger(offset) || offset < 0 || offset > total) {
      throw transferError('Invalid instance upload session. Choose the bundle again and retry.', 400);
    }
    if (await pathExists(fs, pendingDir)) throw transferError('A full instance import is already staged. Restart the server or remove the staged import first.', 409);

    const uploadDir = path.join(dataDir, '.instance-import-chunks');
    await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
    const uploadPath = path.join(uploadDir, `${uploadId}.uploading`);
    const cutoff = Date.now() - IMPORT_SESSION_TTL_MS;
    for (const [id, entry] of importSessions) {
      if (entry.updatedAt < cutoff) {
        importSessions.delete(id);
        await fs.rm(entry.uploadPath, { force: true }).catch(() => {});
      }
    }

    let session = importSessions.get(uploadId);
    if (!session) {
      let storedOffset = 0;
      try { storedOffset = (await fs.stat(uploadPath)).size; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (storedOffset > total) {
        await fs.rm(uploadPath, { force: true });
        storedOffset = 0;
      }
      session = { total, offset: storedOffset, uploadPath, updatedAt: Date.now(), receiving: false, processing: false };
      importSessions.set(uploadId, session);
    }
    if (session.total !== total) throw transferError('Instance upload session details do not match.', 409);
    if (session.processing) throw transferError('This instance bundle is already being validated.', 409);
    if (session.receiving) throw transferError('The previous instance upload chunk is still being received.', 503);
    if (offset !== session.offset) return { conflict: true, complete: false, offset: session.offset };

    session.receiving = true;
    let output;
    try { output = await fs.open(uploadPath, offset ? 'a' : 'w', 0o600); }
    catch (error) { session.receiving = false; throw error; }
    let received = 0;
    try {
      for await (const chunk of request) {
        received += chunk.length;
        if (received > MAX_IMPORT_CHUNK_BYTES || session.offset + chunk.length > session.total) {
          throw transferError('Instance upload chunk exceeded its declared size.', 413);
        }
        await output.write(chunk);
        session.offset += chunk.length;
        session.updatedAt = Date.now();
      }
    } finally { await output.close(); session.receiving = false; }
    if (!received) throw transferError('Instance upload chunk was empty. Please retry.', 400);
    if (session.offset < session.total) return { complete: false, offset: session.offset };

    session.processing = true;
    try {
      const result = await stageImport(legacyFs.createReadStream(uploadPath));
      return { ...result, complete: true, offset: session.offset };
    } finally {
      importSessions.delete(uploadId);
      await fs.rm(uploadPath, { force: true }).catch(() => {});
    }
  }

  async function status() {
    let pending = null; let lastImport = null;
    try { pending = JSON.parse(await fs.readFile(path.join(pendingDir, 'ready.json'), 'utf8')); } catch { /* no staged import */ }
    try { lastImport = JSON.parse(await fs.readFile(path.join(dataDir, 'last-instance-import.json'), 'utf8')); } catch { /* no completed import */ }
    return { pending, lastImport };
  }

  return { exportInstance, stageImport, receiveImportChunk, status };
}

function applyPendingInstanceImportSync({ fs, path, dataDir, databaseFile, mediaDir, backupDir, connectionsFile, geocodesFile, pendingDir, now = () => new Date(), logger = console }) {
  const markerFile = path.join(pendingDir, 'ready.json');
  if (!fs.existsSync(markerFile)) return null;
  const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  if (marker.format !== FORMAT) throw new Error('Staged instance import has an unsupported format.');
  const payload = path.join(pendingDir, 'payload');
  const incomingDatabase = path.join(payload, 'master-list.sqlite');
  const incomingMedia = path.join(payload, 'media');
  if (!fs.existsSync(incomingDatabase) || !fs.existsSync(incomingMedia)) throw new Error('Staged instance import is incomplete.');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const timestamp = now().toISOString().replace(/[:.]/g, '-');
  const rollbackDir = path.join(backupDir, `pre-instance-import-${timestamp}`);
  fs.mkdirSync(rollbackDir, { recursive: true, mode: 0o700 });
  const targets = [
    [databaseFile, 'master-list.sqlite'], [`${databaseFile}-wal`, 'master-list.sqlite-wal'], [`${databaseFile}-shm`, 'master-list.sqlite-shm'],
    [connectionsFile, 'connections.json'], [geocodesFile, 'geocodes.json'], [path.join(dataDir, 'gigs.json'), 'gigs.json'],
    [path.join(dataDir, 'restore-pending.sqlite'), 'restore-pending.sqlite'], [mediaDir, 'media']
  ];
  const installed = [];
  try {
    for (const [target, name] of targets) if (fs.existsSync(target)) fs.renameSync(target, path.join(rollbackDir, name));
    for (const [name, target] of [['master-list.sqlite', databaseFile], ['media', mediaDir], ['connections.json', connectionsFile], ['geocodes.json', geocodesFile]]) {
      const source = path.join(payload, name);
      if (fs.existsSync(source)) { fs.renameSync(source, target); installed.push(target); }
    }
    fs.rmSync(pendingDir, { recursive: true, force: true });
    const result = { format: FORMAT, appliedAt: now().toISOString(), sourceCreatedAt: marker.createdAt || null, rollbackDirectory: path.relative(dataDir, rollbackDir) };
    fs.writeFileSync(path.join(dataDir, 'last-instance-import.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    logger.log?.(`[maintenance] applied full instance import; previous data retained at ${rollbackDir}`);
    return result;
  } catch (error) {
    for (const target of installed.reverse()) fs.rmSync(target, { recursive: true, force: true });
    for (const [, name] of targets) {
      const source = path.join(rollbackDir, name); const target = targets.find((entry) => entry[1] === name)[0];
      if (fs.existsSync(source) && !fs.existsSync(target)) fs.renameSync(source, target);
    }
    throw error;
  }
}

module.exports = { FORMAT, MAGIC, safeBundlePath, validateDatabase, createInstanceTransfer, applyPendingInstanceImportSync };
