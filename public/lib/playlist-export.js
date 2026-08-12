(function exposePlaylistExport(root, factory) {
  const playlistExport = factory();
  if (typeof module === 'object' && module.exports) module.exports = playlistExport;
  else root.MasterListPlaylistExport = playlistExport;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPlaylistExportModule() {
  function integrationFor(integrations, provider) {
    return provider === 'apple-music' ? integrations.appleMusic : integrations[provider];
  }

  function createAppleAuthorizer({ window, document }) {
    let configured = false;
    return async function authorizeAppleMusic(developerToken) {
      if (!developerToken) throw new Error('Apple Music is not configured yet.');
      if (!window.MusicKit) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://js-cdn.music.apple.com/musickit/v1/musickit.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Could not load MusicKit.'));
          document.head.append(script);
        });
      }
      if (!configured) {
        window.MusicKit.configure({ developerToken, app: { name: 'The Master List', build: '0.1.0' } });
        configured = true;
      }
      return window.MusicKit.getInstance().authorize();
    };
  }

  function createExporter({ getIntegrations, providerName, fetchJson, navigate, document, authorizeAppleMusic, updateJob = () => {}, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) }) {
    async function waitForExport(started, provider, gig, status) {
      const label = providerName(provider);
      updateJob(started.id, { id: started.id, type: 'Export playlist', name: `${label} · ${gig.artist}`, status: started.status, progress: started.progress || 0 });
      for (;;) {
        const job = await fetchJson(`/api/jobs/${started.id}`);
        updateJob(started.id, job);
        status.textContent = job.status === 'queued' ? `Queued ${label} playlist export…` : `${job.name} · ${Math.round(job.progress || 0)}%`;
        if (!['queued', 'running'].includes(job.status)) break;
        await sleep(1000);
      }
      return fetchJson(`/api/playlist-exports/${started.id}`);
    }

    function renderResult(result, provider, status) {
      status.replaceChildren();
      const link = document.createElement('a');
      link.href = result.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = `Open ${providerName(provider)} playlist ↗`;
      status.append(`Created with ${result.matched} matched song${result.matched === 1 ? '' : 's'}. `, link);
      if (result.unmatched?.length) status.append(` ${result.unmatched.length} song${result.unmatched.length === 1 ? '' : 's'} could not be matched.`);
    }

    function setupButtons(exports, gig) {
      const status = exports.querySelector('.export-result');
      exports.querySelectorAll('.export-button').forEach((button) => {
        const provider = button.dataset.provider;
        const integration = integrationFor(getIntegrations(), provider);
        const label = providerName(provider);
        button.textContent = label;
        if (!integration?.configured) {
          button.disabled = true;
          button.title = `Add ${label} credentials to .env, then restart the server.`;
          return;
        }
        button.addEventListener('click', () => run(provider, gig, exports, status));
      });
    }

    async function run(provider, gig, exports, status) {
      const integration = integrationFor(getIntegrations(), provider);
      if (provider !== 'apple-music' && !integration.connected) {
        navigate(`/auth/${provider}`);
        return;
      }
      const buttons = [...exports.querySelectorAll('button')];
      buttons.forEach((button) => { button.disabled = true; });
      status.textContent = `Matching ${gig.songs.length} songs and creating your ${providerName(provider)} playlist…`;
      status.classList.remove('error');
      try {
        const body = provider === 'apple-music' ? { musicUserToken: await authorizeAppleMusic(integration.developerToken) } : {};
        const started = await fetchJson(`/api/gigs/${gig.id}/export/${provider}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await waitForExport(started, provider, gig, status);
        if (result.status === 'complete') renderResult(result, provider, status);
        else {
          const failure = Object.assign(new Error(result.error || 'Playlist export failed.'), { status: result.errorCode === 'reconnect-required' ? 401 : 500, payload: { code: result.errorCode } });
          throw failure;
        }
      } catch (error) {
        if (provider !== 'apple-music' && error.status === 401 && error.payload?.code === 'reconnect-required') {
          status.textContent = `Your ${providerName(provider)} connection expired. Reconnecting…`;
          navigate(`/auth/${provider}`);
          return;
        }
        status.textContent = error.message;
        status.classList.add('error');
      } finally {
        buttons.forEach((button) => { button.disabled = false; });
      }
    }

    return { setupButtons, run, waitForExport, renderResult };
  }

  return { integrationFor, createAppleAuthorizer, createExporter };
}));
