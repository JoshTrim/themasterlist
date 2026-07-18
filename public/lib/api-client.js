(function exposeApiClient(root, factory) {
  const apiClient = factory();
  if (typeof module === 'object' && module.exports) module.exports = apiClient;
  else root.MasterListApiClient = apiClient;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createApiClientModule() {
  function createApiError(response, payload) {
    const message = payload?.error || payload?.message || `Request failed (${response.status || 'network error'}).`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    return error;
  }

  function createApiClient({ fetch: request }) {
    if (typeof request !== 'function') throw new TypeError('An HTTP request function is required.');

    async function json(url, options) {
      const response = await request(url, options);
      const contentType = response.headers?.get?.('content-type') || '';
      let payload = null;
      if (response.status !== 204) {
        if (contentType.includes('application/json')) payload = await response.json();
        else {
          const body = await response.text();
          payload = body ? { error: body } : null;
        }
      }
      if (!response.ok) throw createApiError(response, payload);
      return payload;
    }

    return { json };
  }

  return { createApiClient, createApiError };
}));
