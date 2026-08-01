'use strict';

const DEFAULT_REPOSITORY = 'JoshTrim/themasterlist';
const DEFAULT_CACHE_MS = 6 * 60 * 60 * 1000;

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return { normalized: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}`, numbers: match.slice(1, 4).map(Number), prerelease: match[4] || '' };
}

function compareVersions(left, right) {
  const a = parseVersion(left); const b = parseVersion(right);
  if (!a || !b) throw new Error('Release version is not valid semantic versioning.');
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] > b.numbers[index] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true }) > 0 ? 1 : -1;
}

function createUpdateChecker({ request, currentVersion, repository = DEFAULT_REPOSITORY, cacheMs = DEFAULT_CACHE_MS, now = () => Date.now(), timeoutMs = 8000 }) {
  let cached = null;

  return async function checkForUpdates({ refresh = false } = {}) {
    const timestamp = now();
    if (!refresh && cached && timestamp - cached.cachedAt < cacheMs) return { ...cached.value, cached: true };
    let response;
    try {
      response = await request(`https://api.github.com/repos/${repository}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `the-master-list/${currentVersion}` },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw new Error('Could not contact GitHub to check for updates.');
    }
    if (!response.ok) throw new Error(response.status === 404 ? 'No published release is available yet.' : 'GitHub could not complete the update check.');
    let release;
    try { release = await response.json(); }
    catch { throw new Error('GitHub returned an invalid release response.'); }
    const installed = parseVersion(currentVersion);
    const latest = parseVersion(release.tag_name);
    if (!installed || !latest) throw new Error('GitHub returned an invalid release version.');
    const comparison = compareVersions(latest.normalized, installed.normalized);
    const value = {
      installedVersion: installed.normalized,
      latestVersion: latest.normalized,
      updateAvailable: comparison > 0,
      aheadOfLatest: comparison < 0,
      releaseUrl: `https://github.com/${repository}/releases/latest`,
      publishedAt: release.published_at || null,
      checkedAt: new Date(timestamp).toISOString(),
      cached: false
    };
    cached = { cachedAt: timestamp, value };
    return value;
  };
}

module.exports = { DEFAULT_REPOSITORY, compareVersions, createUpdateChecker, parseVersion };
