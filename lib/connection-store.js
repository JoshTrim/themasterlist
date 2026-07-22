'use strict';

const crypto = require('node:crypto');

const FORMAT = 'master-list-connections-v1';
const AAD = Buffer.from(FORMAT, 'utf8');

function decodeKey(value, label = 'CONNECTIONS_ENCRYPTION_KEY') {
  const encoded = String(value || '').trim();
  if (!encoded) return null;
  let key;
  if (/^[a-f0-9]{64}$/i.test(encoded)) key = Buffer.from(encoded, 'hex');
  else {
    try { key = Buffer.from(encoded, 'base64'); } catch { key = null; }
  }
  if (!key || key.length !== 32) throw new Error(`${label} must be a base64 or hexadecimal 32-byte key.`);
  return key;
}

function encrypt(connections, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(connections), 'utf8'), cipher.final()]);
  return {
    format: FORMAT,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decrypt(envelope, key) {
  if (!key) throw new Error('OAuth connections are encrypted but CONNECTIONS_ENCRYPTION_KEY is not configured.');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    throw new Error('OAuth connections could not be decrypted. Check CONNECTIONS_ENCRYPTION_KEY and its previous-key setting.');
  }
}

function isEnvelope(value) {
  return value?.format === FORMAT && value?.algorithm === 'aes-256-gcm';
}

function validateConnections(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('OAuth connection storage must contain a JSON object.');
  return value;
}

function createConnectionStore({ fs, path, filePath, key: keyValue = '', previousKey: previousKeyValue = '' }) {
  const key = decodeKey(keyValue);
  const previousKey = decodeKey(previousKeyValue, 'CONNECTIONS_ENCRYPTION_KEY_PREVIOUS');

  async function persist(connections) {
    validateConnections(connections);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const value = key ? encrypt(connections, key) : connections;
    const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temporaryPath, filePath);
    } finally { await fs.rm(temporaryPath, { force: true }); }
    await fs.chmod(filePath, 0o600);
  }

  async function read() {
    let parsed;
    try { parsed = JSON.parse(await fs.readFile(filePath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
    if (!isEnvelope(parsed)) {
      if (key) await persist(parsed);
      return validateConnections(parsed);
    }
    try { return validateConnections(decrypt(parsed, key)); }
    catch (error) {
      if (!previousKey || !key) throw error;
      const connections = validateConnections(decrypt(parsed, previousKey));
      await persist(connections);
      return connections;
    }
  }

  return { read, write: persist, encrypted: Boolean(key) };
}

module.exports = { FORMAT, decodeKey, encrypt, decrypt, isEnvelope, validateConnections, createConnectionStore };
