(function exposeApiLimitsPage(root, factory) {
  const apiLimitsPage = factory();
  if (typeof module === 'object' && module.exports) module.exports = apiLimitsPage;
  else root.MasterListApiLimitsPage = apiLimitsPage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createApiLimitsPageModule() {
  function formatApiTime(value) {
    if (!value) return 'No requests today';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function providerMarkup(provider, escapeHtml) {
    const hasLimit = provider.limit !== null;
    const percent = hasLimit ? Math.min(100, (provider.units / provider.limit) * 100) : 0;
    const status = provider.configured ? 'Configured' : 'Not configured';
    const usage = hasLimit ? `${provider.units.toLocaleString()} / ${provider.limit.toLocaleString()} ${provider.unit}` : `${provider.requests.toLocaleString()} ${provider.unit}`;
    const remaining = hasLimit ? `<strong>${provider.remaining.toLocaleString()}</strong> ${provider.unit} estimated remaining` : `${provider.errors ? `${provider.errors} error${provider.errors === 1 ? '' : 's'} today` : 'No error responses today'}`;
    return `<article class="api-limit-card"><div class="api-limit-card-heading"><div><p class="eyebrow">${escapeHtml(status)}</p><h2>${escapeHtml(provider.name)}</h2></div><span class="api-limit-status">${escapeHtml(provider.reset)}</span></div><div class="api-limit-usage"><strong>${escapeHtml(usage)}</strong><span>${escapeHtml(remaining)}</span></div>${hasLimit ? `<div class="api-limit-bar" aria-label="${Math.round(percent)} percent used"><i style="width:${percent}%"></i></div>` : ''}<p>${escapeHtml(provider.note)}</p><small>Last request: ${escapeHtml(formatApiTime(provider.lastRequest))}</small></article>`;
  }

  function usageMarkup(data, escapeHtml) {
    const trackedOperations = data.operations.filter((entry) => entry.requests > 0);
    const operations = trackedOperations.length ? `<div><p class="eyebrow">Today by operation</p><div class="api-usage-list">${trackedOperations.map((entry) => `<span><b>${escapeHtml(entry.provider)}</b> · ${escapeHtml(entry.operation)} <em>${Number(entry.units).toLocaleString()} units · ${entry.requests} call${entry.requests === 1 ? '' : 's'}</em></span>`).join('')}</div></div>` : '';
    const recent = data.recent.length ? `<div><p class="eyebrow">Recent tracked calls</p><div class="api-usage-list">${data.recent.map((entry) => `<span><b>${escapeHtml(entry.provider)}</b> · ${escapeHtml(entry.operation)} <em>${entry.units ? `${entry.units} units` : 'auth'} · ${formatApiTime(entry.requestedAt)}${entry.status ? ` · HTTP ${entry.status}` : ''}</em></span>`).join('')}</div></div>` : '';
    return operations + recent;
  }

  function createController({ page, fetchJson, getAccount, escapeHtml, elements }) {
    const { grid, note, detail } = elements;
    return {
      async render() {
        if (page !== 'api-limits' || !grid) return;
        try {
          const data = await fetchJson('/api/limits');
          note.classList.remove('error');
          note.textContent = `Tracking window: ${data.day} (YouTube quota resets at midnight Pacific Time). These figures are local estimates, not provider billing data.`;
          grid.innerHTML = data.providers.map((provider) => providerMarkup(provider, escapeHtml)).join('');
          detail.innerHTML = usageMarkup(data, escapeHtml);
        } catch (error) {
          note.textContent = getAccount() ? error.message : 'Sign in to view tracked API usage.';
          note.classList.add('error');
          grid.innerHTML = '';
          detail.innerHTML = '';
        }
      }
    };
  }

  return { formatApiTime, providerMarkup, usageMarkup, createController };
}));
