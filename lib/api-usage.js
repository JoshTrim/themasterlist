function usageDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function usageProvider(provider, url) {
  const hint = String(provider || '').toLowerCase();
  let hostname = '';
  try { hostname = new URL(url).hostname.toLowerCase(); } catch { /* keep the provider hint */ }
  if (hint.includes('youtube') || (hostname.includes('googleapis.com') && String(url).includes('/youtube/v3/'))) return 'youtube';
  if (hint.includes('spotify') || hostname.includes('spotify.com')) return 'spotify';
  if (hint.includes('setlist') || hostname.includes('setlist.fm')) return 'setlist.fm';
  if (hint.includes('apple') || hostname.includes('apple.com')) return 'apple-music';
  if (hint.includes('audd') || hostname.includes('audd.io')) return 'audd';
  if (hint.includes('musicbrainz') || hostname.includes('musicbrainz.org')) return 'musicbrainz';
  if (hint.includes('wikipedia') || hostname.includes('wikipedia.org')) return 'wikipedia';
  if (hint.includes('google') || hostname.includes('googleapis.com')) return 'google';
  return hint || 'other';
}

function usageMeta(url, options = {}, provider = '') {
  const service = usageProvider(provider, url);
  let parsed;
  try { parsed = new URL(url); } catch { parsed = { pathname: url }; }
  const method = String(options.method || 'GET').toUpperCase();
  const segments = String(parsed.pathname || '').split('/').filter(Boolean);
  const operation = service === 'youtube'
    ? `youtube.${segments.at(-1) || 'request'}`
    : segments.slice(-2).join('/') || service;
  let quotaUnits = 1;
  if (service === 'youtube') {
    if (!String(parsed.pathname).startsWith('/youtube/v3/')) quotaUnits = 0;
    else if (segments.at(-1) === 'search') quotaUnits = 100;
    else if (segments.at(-1) === 'playlists' && method === 'POST') quotaUnits = 50;
    else if (segments.at(-1) === 'playlistItems' && method === 'POST') quotaUnits = 50;
  }
  return { service, operation, quotaUnits };
}

function createApiUsage({ database, request = globalThis.fetch, now = () => new Date(), logger = console }) {
  function day() { return usageDay(now()); }

  function record(provider, operation, quotaUnits = 1, status = null, requestedAt = now().toISOString()) {
    try {
      database.prepare('INSERT INTO api_usage (provider, operation, quota_units, status, requested_at, usage_day) VALUES (?, ?, ?, ?, ?, ?)')
        .run(provider, operation, Math.max(0, Number(quotaUnits) || 0), status, requestedAt, day());
    } catch (error) {
      logger.warn('[api-usage] could not record request:', error.message);
    }
  }

  async function requestJson(url, options, provider) {
    const meta = usageMeta(url, options, provider);
    let result;
    try {
      result = await request(url, options);
    } catch (error) {
      record(meta.service, meta.operation, meta.quotaUnits, null);
      throw error;
    }
    record(meta.service, meta.operation, meta.quotaUnits, result.status);
    if (result.ok) return result.json();
    const body = await result.json().catch(() => ({}));
    const detail = body.error?.message || body.error_description || body.message || body.error || `HTTP ${result.status}`;
    throw new Error(`${provider}: ${detail}`);
  }

  return { day, record, requestJson };
}

module.exports = { usageDay, usageProvider, usageMeta, createApiUsage };
