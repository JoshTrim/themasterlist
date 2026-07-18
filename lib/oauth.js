class OAuthError extends Error {
  constructor(message, code = 'oauth-error') {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
  }
}

function createOAuthService({ providers, requestJson, readConnections, writeConnections, randomUUID, now = Date.now, stateTtlMs = 10 * 60_000 }) {
  if (typeof requestJson !== 'function') throw new TypeError('A token request function is required.');
  if (typeof readConnections !== 'function' || typeof writeConnections !== 'function') throw new TypeError('A connection store is required.');
  const pending = new Map();

  function settings(provider) {
    const value = providers[provider];
    if (!value) throw new OAuthError(`Unknown OAuth provider: ${provider}`, 'unknown-provider');
    return value;
  }

  function configured(provider) {
    const config = providers[provider];
    return Boolean(config?.clientId && config?.clientSecret);
  }

  function cleanupStates() {
    for (const [state, value] of pending) if (now() - value.createdAt > stateTtlMs) pending.delete(state);
  }

  function begin(provider, callbackUrl) {
    const config = settings(provider);
    if (!configured(provider)) throw new OAuthError(`${config.name} is not configured.`, 'missing-config');
    cleanupStates();
    const state = randomUUID();
    pending.set(state, { provider, callbackUrl, createdAt: now() });
    const authorizationUrl = new URL(config.authorizationUrl);
    authorizationUrl.searchParams.set('client_id', config.clientId);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('scope', config.scope);
    for (const [key, value] of Object.entries(config.authorizationParams || {})) authorizationUrl.searchParams.set(key, value);
    return authorizationUrl;
  }

  function tokenRequest(provider, values) {
    const config = settings(provider);
    const payload = new URLSearchParams({ ...values, client_id: config.clientId });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (config.basicAuth) headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
    else payload.set('client_secret', config.clientSecret);
    return requestJson(config.tokenUrl, { method: 'POST', headers, body: payload }, provider);
  }

  async function complete(provider, { state, code, error }) {
    const pendingAuthorization = pending.get(state);
    pending.delete(state);
    if (!pendingAuthorization || pendingAuthorization.provider !== provider || now() - pendingAuthorization.createdAt > stateTtlMs) return { error: 'invalid-state' };
    if (error) return { error: 'authorization-denied' };
    if (!code) return { error: 'missing-code' };
    const token = await tokenRequest(provider, { grant_type: 'authorization_code', code, redirect_uri: pendingAuthorization.callbackUrl });
    const connections = await readConnections();
    connections[provider] = { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: now() + token.expires_in * 1000 };
    await writeConnections(connections);
    return { connected: provider };
  }

  async function accessToken(provider) {
    const config = settings(provider);
    const connections = await readConnections();
    const connection = connections[provider];
    if (!connection?.accessToken) throw new OAuthError(`Connect ${config.name} before exporting.`, 'not-connected');
    if (connection.expiresAt > now() + 60_000) return connection.accessToken;
    if (!connection.refreshToken) throw new OAuthError(`Reconnect ${config.name} to continue.`, 'refresh-token-missing');
    const refreshed = await tokenRequest(provider, { grant_type: 'refresh_token', refresh_token: connection.refreshToken });
    connections[provider] = { ...connection, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || connection.refreshToken, expiresAt: now() + refreshed.expires_in * 1000 };
    await writeConnections(connections);
    return connections[provider].accessToken;
  }

  async function connectionStatus() {
    const connections = await readConnections();
    return Object.fromEntries(Object.keys(providers).map((provider) => [provider, { configured: configured(provider), connected: Boolean(connections[provider]?.accessToken) }]));
  }

  return { configured, begin, complete, accessToken, connectionStatus, pendingCount: () => pending.size };
}

module.exports = { OAuthError, createOAuthService };
