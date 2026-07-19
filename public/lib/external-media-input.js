(function initExternalMediaInput(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListExternalMediaInput = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function externalMediaInputFactory() {
  function createController({ fetchJson }) {
    async function add(gigId, input, caption = 'YouTube video') {
      const externalUrl = input?.value.trim();
      if (!externalUrl) return null;
      const media = await fetchJson(`/api/gigs/${gigId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalUrl, caption })
      });
      input.value = '';
      return media;
    }

    return { add };
  }

  return { createController };
}));
