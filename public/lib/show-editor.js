(function exposeShowEditor(root, factory) {
  const showEditor = factory();
  if (typeof module === 'object' && module.exports) module.exports = showEditor;
  else root.MasterListShowEditor = showEditor;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createShowEditor() {
  const normalize = (value) => String(value || '').trim().toLocaleLowerCase();

  function findDuplicates(values, { gigs = [], sharedShows = [], excludeId = '' } = {}) {
    const artist = normalize(values.artist);
    const venue = normalize(values.venue);
    const city = normalize(values.city);
    const date = String(values.date || '').trim();
    if (!artist || !venue) return [];
    const localReferences = new Set(gigs.flatMap((gig) => [gig.id, gig.sharedId].filter(Boolean)));
    const candidates = [
      ...gigs.filter((gig) => gig.id !== excludeId).map((gig) => ({ ...gig, duplicateSource: 'Your archive' })),
      ...sharedShows.filter((show) => !localReferences.has(show.id) && !localReferences.has(show.sourceGigId)).map((show) => ({ ...show, duplicateSource: 'Shared by a peer' }))
    ];
    return candidates.filter((gig) => normalize(gig.artist) === artist
      && normalize(gig.venue) === venue
      && (!city || !gig.city || normalize(gig.city) === city)
      && String(gig.date || '').trim() === date);
  }

  function attendeeOptions(account, peers = [], selected = []) {
    const owner = account ? { id: account.id, type: 'owner', name: account.name, isOwner: true } : null;
    const selectedIds = new Set((Array.isArray(selected) ? selected : []).map((entry) => entry.id));
    if (owner) selectedIds.add(owner.id);
    return [owner, ...peers.map((peer) => ({ id: peer.peerId, type: 'peer', name: peer.name, isOwner: false }))]
      .filter(Boolean)
      .map((entry) => ({ ...entry, selected: selectedIds.has(entry.id) }));
  }

  function attendeeMarkup(options, escapeHtml = String) {
    if (!options.length) return '<small>Pair an instance from the Account page to add other attendees.</small>';
    return options.map((entry) => `<label class="attendee-option"><input type="checkbox" value="${escapeHtml(entry.id)}" data-attendee-type="${entry.type}" ${entry.selected ? 'checked' : ''} ${entry.isOwner ? 'disabled' : ''} /><span>${escapeHtml(entry.name)}${entry.isOwner ? ' (you)' : ''}</span></label>`).join('');
  }

  function selectedAttendees(inputs = []) {
    return [...inputs].filter((input) => input.checked).map((input) => ({ id: input.value, type: input.dataset.attendeeType }));
  }

  function createAddPayload(entries, { attendees = [], setlist = null, acts = [] } = {}) {
    const payload = { ...entries, attendees, acts, songs: setlist?.songs || [], setlistFmId: setlist?.id || null, setlistFmUrl: setlist?.url || null };
    for (const field of ['media', 'artifacts', 'mediaFiles', 'artifactFiles']) delete payload[field];
    return payload;
  }

  function createEditPayload(entries, { attendees = [], songs = [], acts = [] } = {}) {
    const payload = { ...entries, attendees, songs, acts };
    for (const field of ['media', 'artifacts', 'mediaFiles', 'artifactFiles']) delete payload[field];
    return payload;
  }

  function syncTracks(tracks, rows) {
    return rows.map((row, index) => ({
      ...(tracks[index] || {}),
      title: row.title,
      artist: row.artist,
      album: row.album
    }));
  }

  function moveTrack(tracks, sourceIndex, targetIndex, placeAfter = false) {
    const next = [...tracks];
    if (sourceIndex < 0 || sourceIndex >= next.length || targetIndex < 0 || targetIndex >= next.length) return { tracks: next, index: sourceIndex };
    let insertionIndex = targetIndex + (placeAfter ? 1 : 0);
    const [moved] = next.splice(sourceIndex, 1);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    insertionIndex = Math.max(0, Math.min(next.length, insertionIndex));
    next.splice(insertionIndex, 0, moved);
    return { tracks: next, index: insertionIndex };
  }

  function removeTrack(tracks, index) { return tracks.filter((track, trackIndex) => trackIndex !== index); }
  function addTrack(tracks, artist = '') { return [...tracks, { title: '', artist, album: '' }]; }

  return { normalize, findDuplicates, attendeeOptions, attendeeMarkup, selectedAttendees, createAddPayload, createEditPayload, syncTracks, moveTrack, removeTrack, addTrack };
}));
