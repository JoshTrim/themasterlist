(function initPeerSettings(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListPeerSettings = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function peerSettingsFactory() {
  function extractInviteToken(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    try { return new URL(input).searchParams.get('peerInvite') || input; }
    catch { return input; }
  }

  function peerCardMarkup(peer, escapeHtml) {
    const status = peer.status || 'paired';
    const formatTime = (value) => {
      if (!value || !Number.isFinite(Date.parse(value))) return '';
      return new Date(value).toLocaleString();
    };
    const lastSync = formatTime(peer.lastSyncAt);
    const lastSeen = formatTime(peer.lastSeenAt);
    const nextRetry = formatTime(peer.nextRetryAt);
    const failures = Number(peer.consecutiveFailures || 0);
    const health = [lastSync ? `Last sync ${lastSync}` : lastSeen ? `Last contact ${lastSeen}` : 'Not contacted yet'];
    if (failures) health.push(`${failures} failed attempt${failures === 1 ? '' : 's'}`);
    if (nextRetry) health.push(`retry ${nextRetry}`);
    const error = peer.lastError ? `<span class="peer-error" title="${escapeHtml(peer.lastError)}">${escapeHtml(peer.lastError)}</span>` : '';
    return `<article class="peer-card" data-peer-id="${escapeHtml(peer.id)}"><div class="peer-card-copy"><strong>${escapeHtml(peer.name)}</strong><small>${escapeHtml(peer.baseUrl || 'Direct relay/VPN connection not configured')}</small><span class="peer-status peer-status-${escapeHtml(status)}">${escapeHtml(status)}</span><span class="peer-sync-health">${escapeHtml(health.join(' · '))}</span>${error}</div><div class="peer-actions"><button type="button" class="peer-test" ${peer.baseUrl ? '' : 'disabled'}>Test</button><button type="button" class="peer-sync" ${peer.baseUrl ? '' : 'disabled'}>Sync now</button><button type="button" class="peer-remove">Remove</button></div></article>`;
  }

  function createPostSyncRefresh({ fetchJson, onGigs, populateYears, renderArchive, refreshCollaboration, loadNotifications }) {
    return async function refreshAfterSync() {
      const gigs = await fetchJson('/api/gigs');
      onGigs(gigs);
      populateYears();
      renderArchive();
      await refreshCollaboration();
      await loadNotifications();
      return gigs;
    };
  }

  function createController({
    window, navigator, fetchJson, escapeHtml, FormDataClass = FormData,
    confirmAction = (message) => window.confirm(message), elements,
    onPeers = () => {}, onSynced = async () => {}
  }) {
    const { instanceId, publicKey, form, message, list, createInviteButton, inviteMessage, inviteToken, importInviteButton } = elements;

    function setMessage(target, text, error = false) {
      if (!target) return;
      target.textContent = text;
      target.classList.toggle('error', error);
    }

    function bindPeerActions() {
      list.querySelectorAll('.peer-test, .peer-sync').forEach((button) => button.addEventListener('click', async () => {
        const card = button.closest('.peer-card');
        const action = button.classList.contains('peer-sync') ? 'sync' : 'test';
        const original = button.textContent;
        button.disabled = true;
        button.textContent = action === 'sync' ? 'Syncing…' : 'Testing…';
        try {
          const result = await fetchJson(`/api/peers/${encodeURIComponent(card.dataset.peerId)}/${action}`, { method: 'POST' });
          setMessage(message, action === 'sync' ? `Sync complete · sent ${result.sent}, received ${result.received}, applied ${result.applied}.` : `Connected to ${result.name}.`);
          if (action === 'sync') await onSynced(result);
          await render();
        } catch (error) {
          setMessage(message, error.message, true);
          await render();
        } finally {
          button.disabled = false;
          button.textContent = original;
        }
      }));
      list.querySelectorAll('.peer-remove').forEach((button) => button.addEventListener('click', async () => {
        const card = button.closest('.peer-card');
        const name = card.querySelector('strong').textContent;
        if (!confirmAction(`Remove ${name} as a paired instance?`)) return;
        await fetchJson(`/api/peers/${encodeURIComponent(card.dataset.peerId)}`, { method: 'DELETE' });
        await render();
      }));
    }

    async function render() {
      if (!instanceId || !list) return [];
      try {
        const instance = await fetchJson('/api/instance');
        instanceId.textContent = instance.instanceId;
        publicKey.textContent = instance.publicKey;
        const inviteFromUrl = new URLSearchParams(window.location.search).get('peerInvite');
        if (inviteFromUrl && inviteToken && !inviteToken.value) {
          inviteToken.value = inviteFromUrl;
          setMessage(inviteMessage, 'Pairing invite loaded. Accept it to add this peer.');
        }
        const peers = instance.peers || [];
        onPeers(peers);
        list.innerHTML = peers.length ? peers.map((peer) => peerCardMarkup(peer, escapeHtml)).join('') : '<p class="shared-message">No paired instances yet.</p>';
        bindPeerActions();
        return peers;
      } catch (error) {
        setMessage(message, error.message, true);
        return [];
      }
    }

    async function addManual() {
      setMessage(message, 'Pairing…');
      try {
        const body = Object.fromEntries(new FormDataClass(form).entries());
        await fetchJson('/api/peers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        form.reset();
        setMessage(message, 'Paired instance saved.');
        await render();
      } catch (error) { setMessage(message, error.message, true); }
    }

    async function createInvite() {
      createInviteButton.disabled = true;
      try {
        const invite = await fetchJson('/api/peers/invite', { method: 'POST' });
        let copied = false;
        try { await navigator.clipboard.writeText(invite.inviteUrl); copied = true; } catch {}
        setMessage(inviteMessage, copied ? 'Pairing invite copied. It expires in seven days.' : `Copy this invite URL: ${invite.inviteUrl}`);
      } catch (error) { setMessage(inviteMessage, error.message, true); }
      finally { createInviteButton.disabled = false; }
    }

    async function importInvite() {
      const token = extractInviteToken(inviteToken.value);
      if (!token) return;
      importInviteButton.disabled = true;
      try {
        const result = await fetchJson('/api/peers/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        inviteToken.value = '';
        setMessage(inviteMessage, result.message || 'Peer paired successfully.');
        await render();
      } catch (error) { setMessage(inviteMessage, error.message, true); }
      finally { importInviteButton.disabled = false; }
    }

    function bind() {
      form?.addEventListener('submit', (event) => { event.preventDefault(); addManual(); });
      createInviteButton?.addEventListener('click', createInvite);
      importInviteButton?.addEventListener('click', importInvite);
    }

    return { render, addManual, createInvite, importInvite, bind };
  }

  return { extractInviteToken, peerCardMarkup, createPostSyncRefresh, createController };
}));
