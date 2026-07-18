(function exposeFormatters(root, factory) {
  const formatters = factory();
  if (typeof module === 'object' && module.exports) module.exports = formatters;
  if (root) root.MasterListFormatters = formatters;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createFormatters() {
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  const formatGigDate = (date, options = { month: 'short', day: 'numeric', year: 'numeric' }) => date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options)
    : 'Date unknown';

  const formatBytes = (bytes) => {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
  };

  const providerName = (provider) => ({ spotify: 'Spotify', youtube: 'YouTube', 'apple-music': 'Apple Music' })[provider];

  return { escapeHtml, formatGigDate, formatBytes, providerName };
}));
