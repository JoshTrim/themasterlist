'use strict';

function secureTree(fs, path, root) {
  let stat;
  try { stat = fs.lstatSync(root); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink()) return;
  if (!stat.isDirectory()) { fs.chmodSync(root, 0o600); return; }
  fs.chmodSync(root, 0o700);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) secureTree(fs, path, target);
    else fs.chmodSync(target, 0o600);
  }
}

function secureStorage({ fs, path, dataDir, mediaDir, backupDir }) {
  for (const directory of [dataDir, mediaDir, backupDir]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  secureTree(fs, path, dataDir);
}

module.exports = { secureTree, secureStorage };
