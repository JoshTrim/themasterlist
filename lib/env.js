'use strict';

const fs = require('node:fs');

function parseEnv(contents) {
  const values = {};
  for (const line of String(contents || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function loadEnvFile(filename, target = process.env) {
  try {
    const values = parseEnv(fs.readFileSync(filename, 'utf8'));
    for (const [key, value] of Object.entries(values)) if (!target[key]) target[key] = value;
    return values;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

module.exports = { parseEnv, loadEnvFile };
