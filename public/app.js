const form = document.querySelector('#gig-form');
const mobileMenuToggle = document.querySelector('#mobile-menu-toggle');
const siteNav = document.querySelector('#site-nav');
mobileMenuToggle?.addEventListener('click', () => { const open = siteNav.classList.toggle('is-open'); mobileMenuToggle.setAttribute('aria-expanded', String(open)); });
const jobQueue = new Map();
const jobPanel = document.createElement('aside'); jobPanel.className = 'job-queue'; jobPanel.hidden = true; jobPanel.innerHTML = '<p class="eyebrow">Background jobs</p><div class="job-queue-list"></div>'; document.body.append(jobPanel);
function updateJob(id, patch) {
  jobQueue.set(id, { ...jobQueue.get(id), ...patch });
  // Mobile uploads have their own queue directly beneath the file picker. Keep
  // them out of the floating background panel so the same upload is not shown twice.
  const visibleJobs = [...jobQueue.values()].filter((job) => !isMobileUpload || job.type !== 'Uploading');
  const list = jobPanel.querySelector('.job-queue-list');
  if (!visibleJobs.length) {
    jobPanel.hidden = true;
    if (list.childElementCount) list.replaceChildren();
    return;
  }
  list.innerHTML = visibleJobs.map((job) => `<div class="job-entry" data-job-id="${job.id}"><div><strong>${escapeHtml(job.type)}</strong><span>${escapeHtml(job.name)}</span><button class="job-dismiss" type="button" aria-label="Cancel or dismiss job">×</button></div><div class="job-bar"><i style="width:${job.progress || 0}%"></i></div><small>${job.status === 'complete' ? 'Complete' : job.status === 'error' ? 'Failed' : job.status === 'cancelled' ? 'Cancelled' : `${Math.round(job.progress || 0)}%`}</small></div>`).join('');
  list.querySelectorAll('.job-dismiss').forEach((button) => button.addEventListener('click', () => {
    const job = jobQueue.get(button.closest('.job-entry').dataset.jobId);
    if (!job) return;
    if (job.status === 'running' && job.cancel) job.cancel();
    else jobQueue.delete(job.id);
    updateJob(job.id, { status: 'cancelled', progress: 0 });
    if (job.status !== 'running') jobQueue.delete(job.id);
  }));
  jobPanel.hidden = !visibleJobs.length;
}
window.addEventListener('beforeunload', (event) => { if ([...jobQueue.values()].some((job) => job.type === 'Uploading' && job.status === 'running')) { event.preventDefault(); event.returnValue = ''; } });
async function loadPersistentJobs() { try { const jobs = await fetchJson('/api/jobs'); jobs.forEach((job) => updateJob(job.id, job)); } catch {} }
const message = document.querySelector('#form-message');
const results = document.querySelector('#search-results');
const gigList = document.querySelector('#gig-list');
const emptyState = document.querySelector('#empty-state');
const count = document.querySelector('#record-count');
const copyPlaylist = document.querySelector('#copy-playlist');
const showFilter = document.querySelector('#show-filter');
const yearFilter = document.querySelector('#year-filter');
const sortFilter = document.querySelector('#sort-filter');
const favouriteFilter = document.querySelector('#favourite-filter');
const archiveStats = document.querySelector('#archive-stats');
const dashboardStats = document.querySelector('#dashboard-stats');
const apiLimitsGrid = document.querySelector('#api-limits-grid');
const apiLimitsNote = document.querySelector('#api-limits-note');
const apiUsageDetail = document.querySelector('#api-usage-detail');
const loadMapButton = document.querySelector('#load-map');
const mapMessage = document.querySelector('#map-message');
const mapElement = document.querySelector('#gig-map');
const favoriteChoice = document.querySelector('#favorite-choice');
const mediaInput = document.querySelector('#media-input');
const youtubeMediaInput = document.querySelector('#youtube-media-input');
const editYoutubeMediaInput = document.querySelector('#edit-youtube-media-input');
const profileSelect = document.querySelector('#profile-select');
const sharedMessage = document.querySelector('#shared-message');
const sharedList = document.querySelector('#shared-list');
const authPanel = document.querySelector('#auth-panel');
const authMessage = document.querySelector('#auth-message');
const setupForm = document.querySelector('#setup-form');
const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const accountForm = document.querySelector('#account-form');
const accountMessage = document.querySelector('#account-message');
const instanceId = document.querySelector('#instance-id');
const instancePublicKey = document.querySelector('#instance-public-key');
const peerForm = document.querySelector('#peer-form');
const peerMessage = document.querySelector('#peer-message');
const peerList = document.querySelector('#peer-list');
const createPeerInvite = document.querySelector('#create-peer-invite');
const peerInviteMessage = document.querySelector('#peer-invite-message');
const peerInviteToken = document.querySelector('#peer-invite-token');
const importPeerInvite = document.querySelector('#import-peer-invite');
const profileBar = document.querySelector('#profile-bar');
const inviteButton = document.querySelector('#create-invite');
const downloadBackupButton = document.querySelector('#download-backup');
const exportArchiveButton = document.querySelector('#export-archive');
const importArchiveInput = document.querySelector('#import-archive');
const cleanupMediaButton = document.querySelector('#cleanup-media');
const logoutButton = document.querySelector('#logout');
let selectedSetlist = null;
let gigs = [];
let integrations = {};
let profiles = [];
let peers = [];
let sharedShows = [];
let activeProfileId = '';
let account = null;
let musicKitConfigured = false;
let venueMap;
let venueLayer;

const page = ({ '/': 'home', '/overview': 'overview', '/api-limits': 'api-limits', '/shows': 'shows', '/shared': 'shared', '/login': 'login', '/artist': 'artist', '/show': 'show', '/playback': 'playback', '/city': 'city', '/edit': 'edit', '/venue': 'venue', '/venue/edit': 'venue-edit', '/add': 'add', '/map': 'map', '/account': 'account' })[window.location.pathname] || 'home';
document.body.dataset.page = page;
const routeSections = {
  home: ['home-page'],
  overview: ['overview-page'],
  'api-limits': ['api-limits-page'],
  add: ['add-page'],
  shows: ['shows-archive'],
  shared: ['shows-shared'],
  login: ['shows-shared'],
  artist: ['artist-page'],
  show: ['show-page'],
  playback: ['show-page'],
  city: ['city-page'],
  venue: ['venue-page'],
  'venue-edit': ['venue-edit-page'],
  edit: ['edit-page'],
  map: ['map-page'],
  account: ['account-page']
};
for (const id of ['home-page', 'overview-page', 'api-limits-page', 'add-page', 'shows-archive', 'artist-page', 'show-page', 'venue-page', 'venue-edit-page', 'edit-page', 'shows-shared', 'map-page', 'city-page', 'account-page']) {
  document.querySelector(`#${id}`).hidden = !routeSections[page].includes(id);
}
const chestButton = document.querySelector('#open-chest');
if (chestButton) chestButton.addEventListener('click', () => window.location.assign('/shows'));

const artistNameFromUrl = new URLSearchParams(window.location.search).get('name')?.trim() || '';
const artistHeading = document.querySelector('#artist-heading');
const artistDescription = document.querySelector('#artist-description');
const artistBio = document.querySelector('#artist-bio');
const artistImage = document.querySelector('#artist-image');
const artistSource = document.querySelector('#artist-source');
const artistShows = document.querySelector('#artist-shows');
const artistEmpty = document.querySelector('#artist-empty');
const artistStats = document.querySelector('#artist-stats');
const editForm = document.querySelector('#edit-form');
const editMessage = document.querySelector('#edit-message');
const editMediaInput = document.querySelector('#edit-media-input');
const addAttendeePicker = document.querySelector('#add-attendee-picker');
let editAttendeePicker = document.querySelector('#edit-attendee-picker');
const pendingMedia = new WeakMap();
const selectedMediaIds = new Set();
const mobileUploadStates = new WeakMap();
const mobileUploadRenderTimers = new WeakMap();
const isMobileUpload = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
let uploadWakeLock = null;
let activeWakeLockUsers = 0;
async function retainUploadWakeLock() { if (!isMobileUpload || !navigator.wakeLock) return; activeWakeLockUsers += 1; if (uploadWakeLock) return; try { uploadWakeLock = await navigator.wakeLock.request('screen'); uploadWakeLock.addEventListener?.('release', () => { uploadWakeLock = null; }); } catch { uploadWakeLock = null; } }
function releaseUploadWakeLock() { if (!isMobileUpload) return; activeWakeLockUsers = Math.max(0, activeWakeLockUsers - 1); if (!activeWakeLockUsers && uploadWakeLock) { uploadWakeLock.release().catch(() => {}); uploadWakeLock = null; } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && activeWakeLockUsers && !uploadWakeLock) retainUploadWakeLock(); });
function mobileUploadStateFor(input, gigId = '') {
  let state = mobileUploadStates.get(input);
  if (!state) { state = { gigId: '', items: [], processing: false, startTimer: null, onUploaded: null, onDrained: null, completedSinceDrain: 0, releaseAfterDrain: false }; mobileUploadStates.set(input, state); }
  if (gigId) state.gigId = gigId;
  return state;
}
function uploadStatusContainer(input) { return input?.closest('.media-upload')?.querySelector('.media-upload-status'); }
function formatUploadSize(bytes) { if (!bytes) return '0 B'; const units = ['B', 'KB', 'MB', 'GB']; const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))); return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`; }
function scheduleMobileUploadStateRender(input, state = mobileUploadStates.get(input), immediate = false) {
  const timer = mobileUploadRenderTimers.get(input);
  if (immediate && timer) { clearTimeout(timer); mobileUploadRenderTimers.delete(input); }
  if (immediate) { renderMobileUploadState(input, state); return; }
  if (timer) return;
  mobileUploadRenderTimers.set(input, setTimeout(() => {
    mobileUploadRenderTimers.delete(input);
    renderMobileUploadState(input, state);
  }, 180));
}
function renderMobileUploadState(input, state = mobileUploadStates.get(input)) {
  const container = uploadStatusContainer(input);
  if (!container) return;
  const items = state?.items?.slice(-6) || [];
  container.hidden = !items.length;
  if (!items.length) { container.replaceChildren(); return; }
  container.innerHTML = items.map((item) => {
    const label = item.status === 'waiting' ? 'Waiting for show' : item.status === 'queued' ? 'Queued' : item.status === 'uploading' ? `Uploading ${Math.round(item.progress || 0)}%` : item.status === 'complete' ? 'Uploaded' : `Failed · ${item.error || 'Try again'}`;
    const retry = item.status === 'error' ? `<button type="button" class="mobile-upload-retry" data-upload-item="${item.id}">Retry</button>` : '';
    return `<div class="mobile-upload-item"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(label)} · ${escapeHtml(formatUploadSize(item.size))}</span>${retry}</div><div class="mobile-upload-bar"><i style="width:${item.progress || (item.status === 'complete' ? 100 : 0)}%"></i></div></div>`;
  }).join('');
  container.querySelectorAll('.mobile-upload-retry').forEach((button) => button.addEventListener('click', () => {
    const item = state.items.find((entry) => entry.id === button.dataset.uploadItem);
    if (!item) return;
    item.status = 'queued'; item.error = ''; item.progress = 0;
    renderMobileUploadState(input, state);
    processMobileUploadQueue(input, state);
  }));
}
function queueMobileFiles(input, files) {
  const state = mobileUploadStateFor(input);
  const selectedFiles = files.filter((file) => file && file.size > 0);
  if (!selectedFiles.length) return;
  const items = selectedFiles.map((file) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, name: file.name, size: file.size, status: state.gigId ? 'queued' : 'waiting', progress: 0, error: '' }));
  state.items.push(...items);
  if (!state.gigId) pendingMedia.set(input, [...(pendingMedia.get(input) || []), ...selectedFiles]);
  renderMobileUploadState(input, state);
  if (state.gigId && !state.startTimer) {
    state.startTimer = setTimeout(() => {
      state.startTimer = null;
      processMobileUploadQueue(input, state);
    }, 200);
  }
}
async function processMobileUploadQueue(input, state = mobileUploadStates.get(input)) {
  if (!state?.gigId || state.processing) return state?.runningPromise;
  state.processing = true;
  await retainUploadWakeLock();
  state.runningPromise = (async () => {
    while (true) {
      const item = state.items.find((entry) => entry.status === 'queued');
      if (!item) break;
      item.status = 'uploading'; item.progress = 0; renderMobileUploadState(input, state);
      try {
        await uploadGigMedia(state.gigId, [item.file], (file, fraction) => { item.progress = fraction * 100; scheduleMobileUploadStateRender(input, state); });
        item.status = 'complete'; item.progress = 100; item.file = null; renderMobileUploadState(input, state);
        state.completedSinceDrain += 1;
        if (state.onUploaded) { try { await state.onUploaded(item); } catch { /* keep the upload marked successful if a gallery refresh fails */ } }
      } catch (error) {
        item.status = 'error'; item.error = error.message; renderMobileUploadState(input, state);
      }
    }
  })().finally(() => {
    state.processing = false; state.runningPromise = null;
    const hasQueued = state.items.some((item) => item.status === 'queued' || item.status === 'waiting' || item.status === 'uploading');
    const needsRetry = state.items.some((item) => item.status === 'queued' || item.status === 'error');
    if (!hasQueued && state.completedSinceDrain && state.onDrained) {
      const completedCount = state.completedSinceDrain;
      state.completedSinceDrain = 0;
      Promise.resolve(state.onDrained(completedCount)).catch(() => {});
    }
    if (state.releaseAfterDrain && !needsRetry) { state.gigId = ''; state.releaseAfterDrain = false; }
    releaseUploadWakeLock(); renderMobileUploadState(input, state);
  });
  return state.runningPromise;
}
function startMobileUploadQueue(input, gigId, onUploaded, onDrained) {
  const state = mobileUploadStateFor(input, gigId);
  state.onUploaded = onUploaded || state.onUploaded;
  state.onDrained = onDrained || state.onDrained;
  state.items.filter((item) => item.status === 'waiting').forEach((item) => { item.status = 'queued'; });
  pendingMedia.set(input, []);
  renderMobileUploadState(input, state);
  return processMobileUploadQueue(input, state);
}
function setupMobileFileQueue(input) {
  if (!input || !isMobileUpload) return;
  pendingMedia.set(input, []);
  mobileUploadStateFor(input);
  input.addEventListener('change', () => {
    const files = [...(input.files || [])];
    input.value = '';
    queueMobileFiles(input, files);
  });
}
setupMobileFileQueue(mediaInput);
setupMobileFileQueue(editMediaInput);
function addFileClearButton(input) { if (!input) return; const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-secondary file-clear'; button.textContent = 'Clear queued files'; button.addEventListener('click', () => { input.value = ''; if (pendingMedia.has(input)) pendingMedia.set(input, []); const state = mobileUploadStates.get(input); if (state) { if (state.startTimer) { clearTimeout(state.startTimer); state.startTimer = null; } state.items = state.items.filter((item) => item.status === 'uploading' || item.status === 'complete'); if (!state.items.some((item) => item.status === 'uploading')) { state.gigId = ''; state.releaseAfterDrain = false; } renderMobileUploadState(input, state); } }); input.insertAdjacentElement('afterend', button); }
addFileClearButton(mediaInput);
addFileClearButton(editMediaInput);
const editGallery = document.querySelector('#edit-gallery');
const editSetlistTracks = document.querySelector('#edit-setlist-tracks');
const addEditTrack = document.querySelector('#add-edit-track');
const editGigId = new URLSearchParams(window.location.search).get('id') || '';
const mediaLightbox = document.querySelector('#media-lightbox');
const mediaLightboxImage = document.querySelector('#media-lightbox-image');
const mediaLightboxVideo = document.querySelector('#media-lightbox-video');
const mediaLightboxCaption = document.querySelector('#media-lightbox-caption');
const mediaLightboxClose = document.querySelector('#media-lightbox-close');
const showDetailId = new URLSearchParams(window.location.search).get('id') || '';
const showDetailHeading = document.querySelector('#show-heading');
const showDetailPlace = document.querySelector('#show-detail-place');
const showDetailDate = document.querySelector('#show-detail-date');
const showDetailNotes = document.querySelector('#show-detail-notes');
const showDetailVenueNotes = document.querySelector('#show-detail-venue-notes');
const showDetailRatings = document.querySelector('#show-detail-ratings');
const showDetailGallery = document.querySelector('#show-detail-gallery');
const showDetailNoMedia = document.querySelector('#show-detail-no-media');
const showDetailSetlist = document.querySelector('#show-detail-setlist');
const findYouTubeSet = document.querySelector('#find-youtube-set');
const youtubeResults = document.querySelector('#youtube-results');
const youtubeSearchMessage = document.querySelector('#youtube-search-message');
const playWholeSet = document.querySelector('#play-whole-set');
const setPlayer = document.querySelector('#set-player');
const setPlayerTitle = document.querySelector('#set-player-title');
const setPlayerStage = document.querySelector('#set-player-stage');
const setPlayerNext = document.querySelector('#set-player-next');
const setPlayerFullscreen = document.querySelector('#set-player-fullscreen');
const setPlayerPrev = document.createElement('button');
setPlayerPrev.type = 'button'; setPlayerPrev.className = 'button button-secondary'; setPlayerPrev.textContent = '← Previous';
const setPlayerControls = document.createElement('div'); setPlayerControls.className = 'set-player-controls';
if (setPlayerNext?.parentNode) { setPlayerNext.parentNode.insertBefore(setPlayerControls, setPlayerNext); setPlayerControls.append(setPlayerPrev); if (setPlayerFullscreen) setPlayerControls.append(setPlayerFullscreen); setPlayerControls.append(setPlayerNext); }
const setPlayerStatus = document.querySelector('#set-player-status');
const setPlayerProgress = document.querySelector('#set-player-progress');
const setPlayerMarkers = document.querySelector('#set-player-markers');
const setPlayerTimeline = document.querySelector('.set-player-timeline');
const setPlayerElapsed = document.querySelector('#set-player-elapsed');
const setPlayerTotal = document.querySelector('#set-player-total');
let setQueue = [];
let setQueueIndex = 0;
let youtubeApiPromise;
let activeYoutubePlayer;
let activeYoutubeVideoId = '';
const formatPlaybackTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function renderSetTimeline(gig) {
  const positions = playbackPositions(gig);
  setPlayerMarkers.innerHTML = setQueue.map((entry, index) => `<span class="set-marker${index === 0 ? ' marker-first' : ''}${index === setQueue.length - 1 ? ' marker-last' : ''}" style="left:${positions[index] * 100}%" title="${escapeHtml(gig.songs[entry.songIndex].title)}">${index + 1} · ${escapeHtml(gig.songs[entry.songIndex].title)}</span>`).join('');
  setPlayerMarkers.querySelectorAll('.set-marker').forEach((marker, index) => marker.addEventListener('click', () => { setQueueIndex = index; playSetTrack(); }));
  setPlayerProgress.style.width = `${positions[setQueueIndex] * 100}%`;
  setPlayerElapsed.textContent = formatPlaybackTime((gig.songs[setQueue[setQueueIndex].songIndex].startSeconds || 0));
  const total = Math.max(...gig.songs.map((song) => Number(song.endSeconds || song.startSeconds || 0)), setQueue.length * 240);
  setPlayerTotal.textContent = `~${formatPlaybackTime(total)}`;
}
function playbackPositions(gig) { const hasTimes = setQueue.some((entry) => Number.isFinite(Number(gig.songs[entry.songIndex].startSeconds))); const total = hasTimes ? Math.max(...gig.songs.map((song) => Number(song.endSeconds || song.startSeconds || 0)), 1) : Math.max(1, setQueue.length - 1); return setQueue.map((entry, index) => hasTimes ? Math.min(1, Number(gig.songs[entry.songIndex].startSeconds || 0) / total) : index / total); }
setPlayerTimeline?.addEventListener('click', (event) => {
  if (event.target.closest('.set-marker')) return;
  if (!setQueue.length) return;
  const rect = setPlayerTimeline.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const gig = gigs.find((entry) => entry.id === showDetailId); const positions = gig ? playbackPositions(gig) : [];
  let index = positions.findIndex((position, markerIndex) => ratio < position && markerIndex > 0) - 1; if (index < 0) index = positions.length - 1;
  index = Math.max(0, Math.min(setQueue.length - 1, index));
  const start = positions[index] || 0; const end = positions[index + 1] ?? 1; const withinTrack = end > start ? (ratio - start) / (end - start) : 0;
  setPlayerProgress.style.width = `${ratio * 100}%`;
  if (index !== setQueueIndex) { setQueueIndex = index; playSetTrack(); }
  requestAnimationFrame(() => {
    setPlayerProgress.style.width = `${ratio * 100}%`;
    const video = setPlayerStage.querySelector('video');
    if (video?.duration) video.currentTime = withinTrack * video.duration;
    else if (activeYoutubePlayer?.seekTo && activeYoutubePlayer.getDuration) activeYoutubePlayer.seekTo(withinTrack * activeYoutubePlayer.getDuration(), true);
  });
});
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApiPromise) youtubeApiPromise = new Promise((resolve) => { const previous = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); }; const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(script); });
  return youtubeApiPromise;
}
const showEditLink = document.querySelector('#show-edit-link');
const venueNameFromUrl = new URLSearchParams(window.location.search).get('name')?.trim() || '';
const venueCityFromUrl = new URLSearchParams(window.location.search).get('city')?.trim() || '';
const venueHeading = document.querySelector('#venue-heading');
const venuePageCity = document.querySelector('#venue-page-city');
const venueStats = document.querySelector('#venue-stats');
const venueShows = document.querySelector('#venue-shows');
const venueEmpty = document.querySelector('#venue-empty');
const venueDescription = document.querySelector('#venue-description');
const venueBio = document.querySelector('#venue-bio');
const venueImage = document.querySelector('#venue-image');
const venueSource = document.querySelector('#venue-source');
const venueEditLink = document.querySelector('#venue-edit-link');
const venueEditForm = document.querySelector('#venue-edit-form');
const venueEditMessage = document.querySelector('#venue-edit-message');

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const formatGigDate = (date, options = { month: 'short', day: 'numeric', year: 'numeric' }) => date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options) : 'Date unknown';

function populateShowAutofill() {
  const values = {
    'artist-options': [...new Set(gigs.map((gig) => gig.artist).filter(Boolean))].sort(),
    'venue-options': [...new Set(gigs.map((gig) => gig.venue).filter(Boolean))].sort(),
    'city-options': [...new Set(gigs.map((gig) => gig.city).filter(Boolean))].sort()
  };
  Object.entries(values).forEach(([id, options]) => { const list = document.querySelector(`#${id}`); if (list) list.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}"></option>`).join(''); });
}

function setRatingPicker(picker, value = '') {
  const rating = Number(value) || 0;
  const choice = picker.closest('.rating-choice');
  choice.querySelector('input').value = rating || '';
  picker.querySelectorAll('button').forEach((button) => {
    const selected = Number(button.value) <= rating;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function resetReviewForm() {
  document.querySelectorAll('.star-picker').forEach((picker) => setRatingPicker(picker));
  setFavoriteChoice(false);
}

function setFavoriteChoice(favorite) {
  favoriteChoice.setAttribute('aria-pressed', String(favorite));
  favoriteChoice.querySelector('span').textContent = favorite ? '♥' : '♡';
  form.elements.favorite.value = String(favorite);
}

document.querySelectorAll('.star-picker').forEach((picker) => {
  picker.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => setRatingPicker(picker, button.value)));
});

favoriteChoice.addEventListener('click', () => setFavoriteChoice(favoriteChoice.getAttribute('aria-pressed') !== 'true'));

function formValues() {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function renderAttendeePicker(container, selected = []) {
  if (!container) return;
  const owner = account ? { id: account.id, type: 'owner', name: account.name } : null;
  const selectedIds = new Set((Array.isArray(selected) ? selected : []).map((entry) => entry.id));
  if (owner) selectedIds.add(owner.id);
  const options = [owner, ...peers.map((peer) => ({ id: peer.peerId, type: 'peer', name: peer.name }))].filter(Boolean);
  container.querySelector('.attendee-options').innerHTML = options.length ? options.map((entry) => `<label class="attendee-option"><input type="checkbox" value="${escapeHtml(entry.id)}" data-attendee-type="${entry.type}" ${selectedIds.has(entry.id) ? 'checked' : ''} ${entry.type === 'owner' ? 'disabled' : ''} /><span>${escapeHtml(entry.name)}${entry.type === 'owner' ? ' (you)' : ''}</span></label>`).join('') : '<small>Pair an instance from the Account page to add other attendees.</small>';
}

function readAttendees(container) {
  if (!container) return [];
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((input) => ({ id: input.value, type: input.dataset.attendeeType }));
}

function ensureEditAttendeePicker() {
  if (editAttendeePicker || !editForm) return editAttendeePicker;
  const picker = document.createElement('fieldset');
  picker.className = 'attendee-picker';
  picker.id = 'edit-attendee-picker';
  picker.innerHTML = '<legend>Who was there?</legend><div class="attendee-options"></div><small>You are included automatically. Select any paired peers who attended with you.</small>';
  editForm.querySelector('.edit-setlist')?.before(picker);
  editAttendeePicker = picker;
  return picker;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Something went wrong.');
  return payload;
}

async function renderInstanceSettings() {
  if (!account || !instanceId || !peerList) return;
  try {
    const instance = await fetchJson('/api/instance');
    instanceId.textContent = instance.instanceId;
    instancePublicKey.textContent = instance.publicKey;
    const inviteFromUrl = new URLSearchParams(window.location.search).get('peerInvite');
    if (inviteFromUrl && peerInviteToken && !peerInviteToken.value) {
      peerInviteToken.value = inviteFromUrl;
      if (peerInviteMessage) peerInviteMessage.textContent = 'Pairing invite loaded. Accept it to add this peer.';
    }
    peerList.innerHTML = instance.peers?.length ? instance.peers.map((peer) => `<article class="peer-card" data-peer-id="${escapeHtml(peer.id)}"><div><strong>${escapeHtml(peer.name)}</strong><small>${escapeHtml(peer.baseUrl || 'Direct relay/VPN connection not configured')}</small></div><button type="button" class="peer-remove">Remove</button></article>`).join('') : '<p class="shared-message">No paired instances yet.</p>';
    peerList.querySelectorAll('.peer-remove').forEach((button) => button.addEventListener('click', async () => {
      const card = button.closest('.peer-card');
      if (!confirm(`Remove ${card.querySelector('strong').textContent} as a paired instance?`)) return;
      await fetchJson(`/api/peers/${encodeURIComponent(card.dataset.peerId)}`, { method: 'DELETE' });
      renderInstanceSettings();
    }));
  } catch (error) { if (peerMessage) { peerMessage.textContent = error.message; peerMessage.classList.add('error'); } }
}

async function pollMediaRecognition(gigId, onMedia) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const refreshed = await fetchJson(`/api/gigs/${gigId}/media`);
    onMedia(refreshed);
    if (!refreshed.some((item) => ['queued', 'running'].includes(item.recognitionStatus))) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function fileAsBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

const mobileUploadChains = new Map();
async function uploadGigMediaNow(gigId, files, onProgress = () => {}) {
  if (!crypto.randomUUID) Object.defineProperty(crypto, 'randomUUID', { value: () => `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  const queue = [...files];
  const uploadChunked = async (file, jobId) => {
    const chunkSize = 4 * 1024 * 1024;
    const uploadId = crypto.randomUUID();
    const controller = new AbortController();
    updateJob(jobId, { cancel: () => controller.abort() });
    let offset = 0;
    while (offset < file.size) {
      const chunk = file.slice(offset, offset + chunkSize);
      let attempt = 0;
      while (true) {
        try {
          const response = await fetch(`/api/gigs/${gigId}/media/chunk`, { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': file.type, 'X-Upload-Id': uploadId, 'X-Upload-Offset': String(offset), 'X-Upload-Total': String(file.size), 'X-Media-Filename': encodeURIComponent(file.name) }, body: chunk });
          const body = await response.json().catch(() => ({}));
          if (response.status === 409 && Number.isFinite(Number(body.offset))) { offset = Math.max(0, Math.min(file.size, Number(body.offset))); continue; }
          if (!response.ok) throw new Error(body.error || `Chunk failed (HTTP ${response.status})`);
          offset = body.complete ? file.size : Math.max(offset, Number(body.offset) || 0);
          updateJob(jobId, { progress: offset / file.size * 100 });
          onProgress(file, offset / file.size);
          break;
        } catch (error) {
          if (controller.signal.aborted) throw new Error('Upload cancelled.');
          if (++attempt >= 6) throw new Error(`${error.message || 'Network error'} after ${attempt} attempts.`);
          await new Promise((resolve) => setTimeout(resolve, Math.min(10000, 800 * (2 ** (attempt - 1)))));
        }
      }
    }
  };
  const worker = async () => {
    while (queue.length) {
      const file = queue.shift();
      const jobId = `${Date.now()}-${Math.random()}`;
      updateJob(jobId, { id: jobId, type: 'Uploading', name: file.name, status: 'running', progress: 0 });
      try {
        if (isMobileUpload) await uploadChunked(file, jobId);
        else await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          updateJob(jobId, { cancel: () => xhr.abort() });
          xhr.open('POST', `/api/gigs/${gigId}/media`);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.setRequestHeader('X-Media-Filename', encodeURIComponent(file.name));
          xhr.setRequestHeader('X-Media-Caption', encodeURIComponent(file.name));
          xhr.upload.onprogress = (event) => { if (event.lengthComputable) { updateJob(jobId, { progress: (event.loaded / event.total) * 100 }); onProgress(file, event.loaded / event.total); } };
          xhr.onload = () => { let body = {}; try { body = JSON.parse(xhr.responseText); } catch {} if (xhr.status >= 200 && xhr.status < 300) { updateJob(jobId, { status: 'complete', progress: 100 }); resolve(body); } else reject(new Error(body.error || 'Media upload failed.')); };
          xhr.onerror = () => reject(new Error('Media upload failed.'));
          xhr.onabort = () => reject(new Error('Upload cancelled.'));
          xhr.send(file);
        });
        updateJob(jobId, { status: 'complete', progress: 100 });
      } catch (error) { updateJob(jobId, { status: 'error', error: error.message }); throw error; }
    }
  };
  const concurrency = isMobileUpload ? 1 : 2;
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
function uploadGigMedia(gigId, files, onProgress = () => {}) {
  if (!isMobileUpload) return uploadGigMediaNow(gigId, files, onProgress);
  const previous = mobileUploadChains.get(gigId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => uploadGigMediaNow(gigId, files, onProgress));
  mobileUploadChains.set(gigId, next);
  next.finally(() => { if (mobileUploadChains.get(gigId) === next) mobileUploadChains.delete(gigId); }).catch(() => {});
  return next;
}

async function addYouTubeMedia(gigId, input) {
  const externalUrl = input?.value.trim();
  if (!externalUrl) return;
  await fetchJson(`/api/gigs/${gigId}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ externalUrl, caption: 'YouTube video' }) });
  input.value = '';
}

function youtubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const id = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&autoplay=1&origin=${encodeURIComponent(window.location.origin)}` : url;
  } catch { return url; }
}

function openMediaLightbox(item) {
  mediaLightbox.hidden = false;
  mediaLightboxImage.hidden = !item.mimeType.startsWith('image/');
  mediaLightboxVideo.hidden = !item.mimeType.startsWith('video/');
  if (mediaLightboxImage.hidden) mediaLightboxVideo.src = item.url; else mediaLightboxImage.src = item.url;
  mediaLightboxImage.style.transform = `rotate(${item.rotation || 0}deg)`;
  mediaLightboxVideo.style.transform = 'none';
  mediaLightboxCaption.textContent = item.caption || item.filename || '';
}

mediaLightboxClose.addEventListener('click', () => { mediaLightbox.hidden = true; mediaLightboxVideo.pause(); });
mediaLightbox.addEventListener('click', (event) => { if (event.target === mediaLightbox) mediaLightboxClose.click(); });

function mediaRecognitionMarkup(item, songs = []) {
  if (item.recognitionOverride) {
    const manualTitle = item.songIndex !== null && item.songIndex !== undefined && songs[item.songIndex] ? songs[item.songIndex].title : 'Unassigned';
    return `<small class="media-detection media-detection-manual">Manual override: ${escapeHtml(manualTitle)}</small>`;
  }
  if (item.recognitionStatus === 'queued') return '<small class="media-detection">Queued for track detection…</small>';
  if (item.recognitionStatus === 'running') return '<small class="media-detection">Detecting track…</small>';
  if (item.recognitionStatus === 'error') return '<small class="media-detection media-detection-error">Track detection failed</small>';
  if (!item.recognitionTitle) return '';
  const details = [item.recognitionTitle, item.recognitionArtist].filter(Boolean).join(' — ');
  const status = item.recognitionStatus === 'matched' ? ' · matched to setlist' : '';
  return `<small class="media-detection">Detected: ${escapeHtml(details)}${status}</small>`;
}

function renderMediaGallery(container, media = [], { editable = false, songs = [] } = {}) {
  container.replaceChildren();
  if (!media.length) return;
      for (const id of [...selectedMediaIds]) if (!media.some((item) => item.id === id)) selectedMediaIds.delete(id);
      const selectedCount = media.filter((item) => selectedMediaIds.has(item.id)).length;
      container.innerHTML = `${editable && selectedCount ? `<div class="media-bulk-actions"><span>${selectedCount} selected</span><button type="button" class="media-bulk-delete">Remove selected</button><button type="button" class="media-bulk-clear">Clear</button></div>` : ''}${media.map((item, index) => `<figure class="media-item${item.isCover ? ' is-cover' : ''}${selectedMediaIds.has(item.id) ? ' is-selected' : ''}" data-media-id="${item.id}">${editable ? `<button type="button" class="media-delete-corner" aria-label="${selectedMediaIds.has(item.id) ? 'Deselect media' : 'Select media for removal'}" title="${selectedMediaIds.has(item.id) ? 'Deselect media' : 'Select media for removal'}" aria-pressed="${selectedMediaIds.has(item.id)}">×</button>` : ''}${item.mimeType === 'video/youtube' ? `<iframe src="${youtubeEmbedUrl(item.url)}" title="${escapeHtml(item.caption || 'YouTube video')}" loading="lazy" allowfullscreen></iframe>` : item.mimeType.startsWith('video/') ? `<video src="${item.url}" controls preload="${isMobileUpload ? 'none' : 'metadata'}"></video>` : `<button class="media-open" type="button"><img src="${item.url}" alt="${escapeHtml(item.caption || 'Photo from the show')}" loading="lazy" style="transform:rotate(${item.rotation || 0}deg)" /></button>`}<figcaption>${escapeHtml(item.caption || item.filename || '')}</figcaption>${mediaRecognitionMarkup(item, songs)}${editable ? `<div class="media-actions"><button type="button" class="media-menu-toggle" aria-expanded="false">⋮ Options</button><div class="media-action-menu" hidden>${songs.length ? `<label class="media-song-label">Setlist track${item.recognitionOverride ? ' · manual override' : ''}<select class="media-song-select"><option value="">Unassigned</option>${songs.map((song, songIndex) => `<option value="${songIndex}" ${item.songIndex === songIndex ? 'selected' : ''}>${songIndex + 1}. ${escapeHtml(song.title)}</option>`).join('')}</select></label>` : ''}<button class="media-caption" type="button">Caption</button><button type="button" class="media-cover">${item.isCover ? 'Cover photo' : 'Make cover'}</button>${item.mimeType.startsWith('video/') && item.mimeType !== 'video/youtube' ? '<button type="button" class="media-trim">Trim video</button><button type="button" class="media-rotate media-rotate-cw">↻ Clockwise</button><button type="button" class="media-rotate media-rotate-ccw">↺ Counter-clockwise</button>' : ''}<button type="button" class="media-up" ${index === 0 ? 'disabled' : ''}>↑ Move earlier</button><button type="button" class="media-down" ${index === media.length - 1 ? 'disabled' : ''}>↓ Move later</button></div></div>` : ''}</figure>`).join('')}`;
  container.querySelectorAll('.media-open').forEach((button, index) => button.addEventListener('click', () => openMediaLightbox(media[index])));
  if (editable) {
    container.querySelectorAll('.media-delete-corner').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      if (!item) return;
      if (selectedMediaIds.has(item.id)) selectedMediaIds.delete(item.id); else selectedMediaIds.add(item.id);
      renderMediaGallery(container, media, { editable: true, songs });
    }));
    container.querySelector('.media-bulk-clear')?.addEventListener('click', () => { selectedMediaIds.clear(); renderMediaGallery(container, media, { editable: true, songs }); });
    container.querySelector('.media-bulk-delete')?.addEventListener('click', async (event) => {
      const selected = media.filter((item) => selectedMediaIds.has(item.id));
      if (!selected.length || !confirm(`Remove ${selected.length} selected media item${selected.length === 1 ? '' : 's'}?`)) return;
      event.currentTarget.disabled = true;
      try {
        await Promise.all(selected.map((item) => fetchJson(`/api/media/${item.id}`, { method: 'DELETE' })));
        selected.forEach((item) => { selectedMediaIds.delete(item.id); media.splice(media.indexOf(item), 1); });
        renderMediaGallery(container, media, { editable: true, songs });
      } catch (error) { event.currentTarget.disabled = false; event.currentTarget.textContent = error.message; }
    });
    container.querySelectorAll('.media-song-select').forEach((select) => select.addEventListener('change', async () => {
      const item = media.find((entry) => entry.id === select.closest('.media-item').dataset.mediaId);
      const value = select.value === '' ? null : Number(select.value);
      await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songIndex: value, recognitionOverride: true }) });
      item.songIndex = value;
      item.recognitionOverride = true;
      renderMediaGallery(container, media, { editable: true, songs });
    }));
    container.querySelectorAll('.media-menu-toggle').forEach((button) => button.addEventListener('click', () => {
      const menu = button.nextElementSibling;
      const open = menu.hidden;
      container.querySelectorAll('.media-action-menu').forEach((entry) => { entry.hidden = true; });
      container.querySelectorAll('.media-menu-toggle').forEach((entry) => entry.setAttribute('aria-expanded', 'false'));
      menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }));
    container.querySelectorAll('.media-caption').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      const caption = prompt('Caption this memory', item.caption || item.filename || '');
      if (caption === null) return;
      await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caption }) });
      item.caption = caption; renderMediaGallery(container, media, { editable: true, songs });
    }));
    container.querySelectorAll('.media-cover').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isCover: true }) });
      media.forEach((entry) => { entry.isCover = entry.id === item.id; }); renderMediaGallery(container, media, { editable: true, songs });
    }));
    container.querySelectorAll('.media-trim').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      const start = prompt('Trim start time in seconds', '0'); if (start === null) return;
      const end = prompt('Trim end time in seconds', ''); if (end === null || end === '' || Number(end) <= Number(start)) return;
      button.disabled = true; button.textContent = 'Trimming…';
      try { const job = await fetchJson(`/api/media/${item.id}/trim?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { method: 'POST' }); let status; do { await new Promise((resolve) => setTimeout(resolve, 1000)); status = await fetchJson(`/api/media/rotate/${job.jobId}`); button.textContent = `Trimming ${status.progress}%`; } while (status.status === 'running'); if (status.status === 'error') throw new Error(status.error || 'Video trim failed.'); renderMediaGallery(container, media, { editable: true, songs }); } catch (error) { button.textContent = error.message; } finally { button.disabled = false; }
    }));
    container.querySelectorAll('.media-rotate').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      if (item.mimeType.startsWith('video/')) {
        button.disabled = true; button.textContent = 'Rotating…';
        const direction = button.classList.contains('media-rotate-ccw') ? 'counterclockwise' : 'clockwise';
        const job = await fetchJson(`/api/media/${item.id}/rotate?direction=${direction}`, { method: 'POST' });
        let status; do { await new Promise((resolve) => setTimeout(resolve, 1000)); status = await fetchJson(`/api/media/rotate/${job.jobId}`); button.textContent = `Rotating ${status.progress}%`; } while (status.status === 'running');
        if (status.status === 'error') throw new Error(status.error || 'Video rotation failed.');
      } else {
        item.rotation = ((item.rotation || 0) + 90) % 360;
        await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotation: item.rotation }) });
      }
      renderMediaGallery(container, media, { editable: true, songs });
    }));
    container.querySelectorAll('.media-up, .media-down').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      const index = media.indexOf(item); const nextIndex = button.classList.contains('media-up') ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= media.length) return;
      [media[index], media[nextIndex]] = [media[nextIndex], media[index]];
      await Promise.all(media.map((entry, order) => fetchJson(`/api/media/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: order }) })));
      renderMediaGallery(container, media, { editable: true, songs });
    }));
  }
}

function setSharedMessage(text, isError = false) {
  sharedMessage.textContent = text;
  sharedMessage.classList.toggle('error', isError);
}

function activeProfile() {
  return profiles.find((profile) => profile.id === activeProfileId);
}

function renderArtistShows(records) {
  artistShows.replaceChildren();
  artistEmpty.hidden = records.length > 0;
  for (const gig of records) {
    const card = document.querySelector('#gig-template').content.cloneNode(true);
    card.querySelector('.edit-gig').href = `/edit?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.show-detail-link').href = `/show?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.play-gig').href = `/playback?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.play-gig').textContent = '▶';
    card.querySelector('.edit-gig').href = `/edit?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.show-detail-link').href = `/show?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.play-gig').href = `/playback?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.play-gig').textContent = '▶';
    card.querySelector('.play-gig').setAttribute('aria-label', 'Play set');
    card.querySelector('.gig-date').textContent = formatGigDate(gig.date, { day: '2-digit', month: 'short', year: 'numeric' });
    card.querySelector('.gig-summary h3').textContent = gig.artist;
    card.querySelector('.gig-place').textContent = `${gig.venue} · ${gig.city}`;
    card.querySelector('.gig-notes').textContent = gig.performanceNotes || gig.notes || '';
    card.querySelector('.venue-notes').textContent = gig.venueNotes || '';
    card.querySelector('.song-total').textContent = gig.songs?.length ? `${gig.songs.length} songs` : 'No setlist';
    const ratings = card.querySelector('.gig-ratings');
    ratings.innerHTML = `${gig.performanceRating ? `<span>Performance ${gig.performanceRating} / 5</span>` : ''}${gig.venueRating ? `<span>Venue ${gig.venueRating} / 5</span>` : ''}`;
    const setlist = card.querySelector('.setlist');
    if (gig.songs?.length) setlist.innerHTML = `<ol>${gig.songs.map((song) => `<li>${escapeHtml(song.title)}${song.encore ? ' <b>Encore</b>' : ''}</li>`).join('')}</ol>`;
    renderMediaGallery(card.querySelector('.media-gallery'), gig.media, { songs: gig.songs || [] });
    artistShows.append(card);
  }
}

async function renderArtistPage() {
  if (page !== 'artist') return;
  if (!artistNameFromUrl) {
    artistHeading.textContent = 'Artist not found';
    artistDescription.textContent = 'Choose an artist from your shows archive.';
    return;
  }
  artistHeading.textContent = artistNameFromUrl;
  const artistRecords = gigs.filter((gig) => gig.artist.toLowerCase() === artistNameFromUrl.toLowerCase());
  renderArtistShows(artistRecords);
  artistStats.innerHTML = `<span>${artistRecords.length} show${artistRecords.length === 1 ? '' : 's'}</span><span>${new Set(artistRecords.map((gig) => `${gig.venue}|${gig.city}`)).size} venues</span><span>${artistRecords.reduce((sum, gig) => sum + (gig.songs?.length || 0), 0)} songs performed</span><span>${artistRecords.filter((gig) => gig.favorite).length} favourites</span>`;
  try {
    const info = await fetchJson(`/api/artists?name=${encodeURIComponent(artistNameFromUrl)}`);
    artistHeading.textContent = info.title || artistNameFromUrl;
    artistDescription.textContent = info.description || '';
    artistBio.textContent = info.bio || 'No biography was found for this artist yet.';
    artistImage.hidden = !info.image;
    if (info.image) { artistImage.src = info.image; artistImage.alt = `${info.title || artistNameFromUrl} portrait`; }
    artistSource.hidden = !info.source;
    if (info.source) artistSource.href = info.source;
  } catch (error) {
    artistDescription.textContent = 'Artist information could not be loaded right now.';
    artistBio.textContent = error.message;
  }
}

async function renderDashboardStats() {
  if (page !== 'overview' || !dashboardStats) return;
  const countBy = (values) => Object.entries(values.reduce((result, value) => { result[value] = (result[value] || 0) + 1; return result; }, {})).sort((a, b) => b[1] - a[1]);
  const localStats = { shows: gigs.length, artists: new Set(gigs.map((gig) => gig.artist.toLowerCase())).size, venues: new Set(gigs.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size, cities: new Set(gigs.map((gig) => gig.city.toLowerCase())).size, songs: gigs.reduce((sum, gig) => sum + (gig.songs?.length || 0), 0), favourites: gigs.filter((gig) => gig.favorite).length, topArtists: countBy(gigs.map((gig) => gig.artist)).slice(0, 5), topVenues: countBy(gigs.map((gig) => gig.venue)).slice(0, 5) };
  const render = (stats) => { dashboardStats.innerHTML = `<p class="eyebrow">Archive snapshot</p><div class="dashboard-stat-grid"><span><strong>${stats.shows}</strong> shows</span><span><strong>${stats.artists}</strong> artists</span><span><strong>${stats.venues}</strong> venues</span><span><strong>${stats.cities}</strong> cities</span><span><strong>${stats.songs}</strong> songs</span><span><strong>${stats.favourites}</strong> favourites</span></div><div class="dashboard-stat-columns"><div><b>Most seen artists</b>${stats.topArtists.map(([name, count]) => `<span>${escapeHtml(name)} · ${count}</span>`).join('') || '<span>None yet</span>'}</div><div><b>Most visited venues</b>${stats.topVenues.map(([name, count]) => `<span>${escapeHtml(name)} · ${count}</span>`).join('') || '<span>None yet</span>'}</div></div>`; };
  render(localStats);
  try { render(await fetchJson('/api/stats')); } catch { /* local snapshot remains visible */ }
}

function formatApiTime(value) {
  if (!value) return 'No requests today';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function renderApiLimits() {
  if (page !== 'api-limits' || !apiLimitsGrid) return;
  try {
    const data = await fetchJson('/api/limits');
    apiLimitsNote.textContent = `Tracking window: ${data.day} (YouTube quota resets at midnight Pacific Time). These figures are local estimates, not provider billing data.`;
    apiLimitsGrid.innerHTML = data.providers.map((provider) => {
      const hasLimit = provider.limit !== null;
      const percent = hasLimit ? Math.min(100, (provider.units / provider.limit) * 100) : 0;
      const status = provider.configured ? 'Configured' : 'Not configured';
      const usage = hasLimit ? `${provider.units.toLocaleString()} / ${provider.limit.toLocaleString()} ${provider.unit}` : `${provider.requests.toLocaleString()} ${provider.unit}`;
      const remaining = hasLimit ? `<strong>${provider.remaining.toLocaleString()}</strong> ${provider.unit} estimated remaining` : `${provider.errors ? `${provider.errors} error${provider.errors === 1 ? '' : 's'} today` : 'No error responses today'}`;
      return `<article class="api-limit-card"><div class="api-limit-card-heading"><div><p class="eyebrow">${escapeHtml(status)}</p><h2>${escapeHtml(provider.name)}</h2></div><span class="api-limit-status">${escapeHtml(provider.reset)}</span></div><div class="api-limit-usage"><strong>${escapeHtml(usage)}</strong><span>${escapeHtml(remaining)}</span></div>${hasLimit ? `<div class="api-limit-bar" aria-label="${Math.round(percent)} percent used"><i style="width:${percent}%"></i></div>` : ''}<p>${escapeHtml(provider.note)}</p><small>Last request: ${escapeHtml(formatApiTime(provider.lastRequest))}</small></article>`;
    }).join('');
    const trackedOperations = data.operations.filter((entry) => entry.requests > 0);
    const operationMarkup = trackedOperations.length ? `<div><p class="eyebrow">Today by operation</p><div class="api-usage-list">${trackedOperations.map((entry) => `<span><b>${escapeHtml(entry.provider)}</b> · ${escapeHtml(entry.operation)} <em>${Number(entry.units).toLocaleString()} units · ${entry.requests} call${entry.requests === 1 ? '' : 's'}</em></span>`).join('')}</div></div>` : '';
    const recentMarkup = data.recent.length ? `<div><p class="eyebrow">Recent tracked calls</p><div class="api-usage-list">${data.recent.map((entry) => `<span><b>${escapeHtml(entry.provider)}</b> · ${escapeHtml(entry.operation)} <em>${entry.units ? `${entry.units} units` : 'auth'} · ${formatApiTime(entry.requestedAt)}${entry.status ? ` · HTTP ${entry.status}` : ''}</em></span>`).join('')}</div></div>` : '';
    apiUsageDetail.innerHTML = `${operationMarkup}${recentMarkup}`;
  } catch (error) {
    apiLimitsNote.textContent = account ? error.message : 'Sign in to view tracked API usage.';
    apiLimitsNote.classList.add('error');
    apiLimitsGrid.innerHTML = '';
    apiUsageDetail.innerHTML = '';
  }
}

async function renderVenuePage() {
  if (page !== 'venue') return;
  const records = gigs.filter((gig) => gig.venue.toLowerCase() === venueNameFromUrl.toLowerCase() && (!venueCityFromUrl || gig.city.toLowerCase() === venueCityFromUrl.toLowerCase()));
  venueHeading.textContent = venueNameFromUrl || 'Venue not found';
  venuePageCity.textContent = venueCityFromUrl;
  venueStats.innerHTML = records.length ? `<span>${records.length} show${records.length === 1 ? '' : 's'}</span><span>${new Set(records.map((gig) => gig.artist)).size} artists</span><span>${new Set(records.map((gig) => gig.city)).size} cities</span><span>${records.reduce((sum, gig) => sum + (gig.songs?.length || 0), 0)} songs</span><span>${records.filter((gig) => gig.favorite).length} favourites</span>` : '';
  venueEmpty.hidden = Boolean(records.length);
  venueShows.replaceChildren();
  records.forEach((gig) => {
    const card = document.querySelector('#gig-template').content.cloneNode(true);
    card.querySelector('.edit-gig').href = `/edit?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.show-detail-link').href = `/show?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.play-gig').href = `/playback?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.play-gig').textContent = '▶';
    card.querySelector('.gig-date').textContent = formatGigDate(gig.date, { day: '2-digit', month: 'short', year: 'numeric' });
    card.querySelector('.gig-summary h3').innerHTML = `<a class="artist-link" href="/artist?name=${encodeURIComponent(gig.artist)}">${escapeHtml(gig.artist)}</a>`;
    card.querySelector('.gig-place').textContent = `${gig.venue} · ${gig.city}`;
    card.querySelector('.gig-notes').textContent = gig.performanceNotes || gig.notes || '';
    card.querySelector('.song-total').textContent = gig.songs?.length ? `${gig.songs.length} songs` : 'No setlist';
    renderMediaGallery(card.querySelector('.media-gallery'), gig.media, { songs: gig.songs || [] });
    venueShows.append(card);
  });
  if (!venueNameFromUrl) return;
  try {
    const info = await fetchJson(`/api/venues?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`);
    venueHeading.textContent = info.title || venueNameFromUrl;
    venueDescription.textContent = info.description || '';
    venueBio.textContent = info.bio || 'No venue biography was found yet.';
    venueImage.hidden = !info.image;
    if (info.image) { venueImage.src = info.image; venueImage.alt = `${info.title || venueNameFromUrl} photo`; }
    venueSource.hidden = !info.source;
    if (info.source) venueSource.href = info.source;
    venueEditLink.href = `/venue/edit?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`;
  } catch (error) { venueBio.textContent = 'Venue information could not be loaded right now.'; }
}

async function renderVenueEditPage() {
  if (page !== 'venue-edit') return;
  const info = await fetchJson(`/api/venues?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`);
  document.querySelector('#venue-edit-heading').textContent = `Edit ${info.title || venueNameFromUrl}`;
  document.querySelector('#venue-edit-back').href = `/venue?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`;
  venueEditForm.elements.title.value = info.title || '';
  venueEditForm.elements.description.value = info.description || '';
  venueEditForm.elements.bio.value = info.bio || '';
  venueEditForm.elements.image.value = info.image || '';
  venueEditForm.elements.source.value = info.source || '';
}

venueEditForm.addEventListener('submit', async (event) => {
  if (page !== 'venue-edit') return;
  event.preventDefault();
  try {
    const info = await fetchJson(`/api/venues?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(venueEditForm).entries())) });
    venueHeading.textContent = info.title; venueDescription.textContent = info.description; venueBio.textContent = info.bio;
    venueImage.hidden = !info.image; if (info.image) { venueImage.src = info.image; venueImage.alt = `${info.title} photo`; }
    venueSource.hidden = !info.source; if (info.source) venueSource.href = info.source;
    venueEditMessage.textContent = 'Venue info saved.'; venueEditMessage.classList.remove('error');
  } catch (error) { venueEditMessage.textContent = error.message; venueEditMessage.classList.add('error'); }
});

function renderEditPage() {
  if (page !== 'edit') return;
  const gig = gigs.find((entry) => entry.id === editGigId);
  if (!gig) { editMessage.textContent = 'Show not found.'; editMessage.classList.add('error'); return; }
  if (!editMediaInput.dataset.immediateUpload) {
    editMediaInput.dataset.immediateUpload = 'true';
    if (isMobileUpload) {
      const state = mobileUploadStateFor(editMediaInput, gig.id);
      state.onUploaded = (item) => { editMessage.textContent = `${item.name} uploaded.`; editMessage.classList.remove('error'); };
      state.onDrained = async () => { await pollMediaRecognition(gig.id, (refreshed) => renderMediaGallery(editGallery, refreshed, { editable: true, songs: gig.songs || [] })); };
      startMobileUploadQueue(editMediaInput, gig.id, state.onUploaded, state.onDrained);
    } else editMediaInput.addEventListener('change', async () => { const files = pendingMedia.get(editMediaInput) || [...(editMediaInput.files || [])]; if (!files.length) return; editMessage.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`; try { await uploadGigMedia(gig.id, files, (file, fraction) => { editMessage.textContent = `Uploading ${file.name} · ${Math.round(fraction * 100)}%`; }); pendingMedia.set(editMediaInput, []); editMediaInput.value = ''; editMessage.textContent = 'Media uploaded.'; const refreshed = await fetchJson(`/api/gigs/${gig.id}/media`); renderMediaGallery(editGallery, refreshed, { editable: true, songs: gig.songs || [] }); } catch (error) { editMessage.textContent = error.message; editMessage.classList.add('error'); } });
  }
  editForm.elements.artist.value = gig.artist;
  editForm.elements.date.value = gig.date;
  editForm.elements.venue.value = gig.venue;
  editForm.elements.city.value = gig.city;
  const tracks = [...(gig.songs || [])];
  const renderTracks = () => {
    editSetlistTracks.innerHTML = tracks.map((song, index) => `<div class="edit-track" data-track-index="${index}"><span class="edit-track-number">${index + 1}</span><input class="edit-track-title" value="${escapeHtml(song.title || '')}" placeholder="Track title" /><input class="edit-track-artist" value="${escapeHtml(song.artist || '')}" placeholder="Artist (optional)" /><input class="edit-track-album" value="${escapeHtml(song.album || '')}" placeholder="Album (optional)" /><input class="edit-track-start" type="number" min="0" step="1" value="${song.startSeconds ?? ''}" placeholder="Start s" aria-label="Start time in seconds" /><input class="edit-track-end" type="number" min="0" step="1" value="${song.endSeconds ?? ''}" placeholder="End s" aria-label="End time in seconds" /><button class="icon-button edit-track-remove" type="button" aria-label="Remove track">×</button></div>`).join('');
    editSetlistTracks.querySelectorAll('.edit-track-remove').forEach((button) => button.addEventListener('click', () => { tracks.splice(Number(button.closest('.edit-track').dataset.trackIndex), 1); renderTracks(); }));
  };
  renderTracks();
  addEditTrack.onclick = () => { tracks.push({ title: '', artist: gig.artist, album: '' }); renderTracks(); editSetlistTracks.lastElementChild?.querySelector('.edit-track-title')?.focus(); };
  renderMediaGallery(editGallery, gig.media, { editable: true, songs: gig.songs || [] });
  renderAttendeePicker(ensureEditAttendeePicker(), gig.attendees || []);
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = editForm.querySelector('button[type="submit"]');
    try {
      submitButton.disabled = true;
      const update = Object.fromEntries(new FormData(editForm).entries());
      update.attendees = readAttendees(ensureEditAttendeePicker());
      update.songs = [...editSetlistTracks.querySelectorAll('.edit-track')].map((row) => ({ title: row.querySelector('.edit-track-title').value, artist: row.querySelector('.edit-track-artist').value, album: row.querySelector('.edit-track-album').value, startSeconds: row.querySelector('.edit-track-start').value === '' ? null : Number(row.querySelector('.edit-track-start').value), endSeconds: row.querySelector('.edit-track-end').value === '' ? null : Number(row.querySelector('.edit-track-end').value), encore: false }));
      const saved = await fetchJson(`/api/gigs/${gig.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
      const files = pendingMedia.get(editMediaInput) || [...(editMediaInput?.files || [])];
      if (files.length) await uploadGigMedia(gig.id, files, (file, fraction) => { editMessage.textContent = fraction >= 1 ? `Upload complete · preparing mobile playback for ${file.name}…` : `Uploading ${file.name} · ${Math.round(fraction * 100)}%`; });
      await addYouTubeMedia(gig.id, editYoutubeMediaInput);
      gigs = gigs.map((entry) => entry.id === gig.id ? { ...entry, ...saved } : entry);
      editMessage.textContent = files.length ? 'Show and media saved.' : 'Show saved.';
      editMessage.classList.remove('error');
      editMediaInput.value = '';
      const refreshed = await fetchJson(`/api/gigs/${gig.id}/media`);
      renderMediaGallery(editGallery, refreshed, { editable: true, songs: gig.songs || [] });
      renderGigs();
    } catch (error) { editMessage.textContent = error.message; editMessage.classList.add('error'); } finally { submitButton.disabled = false; }
  });
}

function renderShowPage() {
  if (!['show', 'playback'].includes(page)) return;
  const gig = gigs.find((entry) => entry.id === showDetailId);
  if (!gig) { showDetailHeading.textContent = 'Show not found'; return; }
  showDetailHeading.textContent = gig.artist;
  showDetailPlace.innerHTML = `<a class="venue-link" href="/venue?name=${encodeURIComponent(gig.venue)}&city=${encodeURIComponent(gig.city)}">${escapeHtml(gig.venue)}</a> · <a class="venue-link" href="/city?name=${encodeURIComponent(gig.city)}">${escapeHtml(gig.city)}</a>`;
  showDetailDate.textContent = formatGigDate(gig.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  showDetailNotes.textContent = gig.performanceNotes || gig.notes || 'No performance notes yet.';
  showDetailVenueNotes.textContent = gig.venueNotes ? `Venue: ${gig.venueNotes}` : 'No venue notes yet.';
  showDetailRatings.innerHTML = `${gig.performanceRating ? `<span>Performance ${gig.performanceRating} / 5</span>` : '<span>Performance unrated</span>'}${gig.venueRating ? `<span>Venue ${gig.venueRating} / 5</span>` : '<span>Venue unrated</span>'}`;
  showDetailSetlist.innerHTML = gig.songs?.length ? `<ol>${renderTrackList(gig.songs, gig.artist)}</ol>${renderAlbumStats(gig.songs)}` : '<p>No setlist attached.</p>';
  if (gig.songs?.length) fetchJson(`/api/gigs/${encodeURIComponent(gig.id)}/album-stats`).then((data) => { gig.songs = data.songs; showDetailSetlist.innerHTML = `<ol>${renderTrackList(gig.songs, gig.artist)}</ol>${renderAlbumStats(gig.songs)}`; }).catch(() => {});
  showEditLink.href = `/edit?id=${encodeURIComponent(gig.id)}`;
  showDetailNoMedia.hidden = Boolean(gig.media?.length);
  // Keep the gallery manageable from the show page too, including YouTube videos
  // attached by the setlist search.
  renderMediaGallery(showDetailGallery, gig.media, { editable: true, songs: gig.songs || [] });
  if (page === 'playback' || new URLSearchParams(window.location.search).get('play') === '1') setTimeout(() => playWholeSet?.click(), 0);
}

function renderAlbumStats(songs) {
  const counts = new Map();
  songs.forEach((song) => { const album = String(song.album || 'Unknown album').trim() || 'Unknown album'; counts.set(album, (counts.get(album) || 0) + 1); });
  const total = songs.length;
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return `<div class="album-stats"><p class="eyebrow">Album breakdown</p><div class="album-stat-bar album-stat-bar-stacked">${entries.map(([album, count], index) => `<span class="album-segment album-segment-${index % 8}" style="width:${count / total * 100}%" title="${escapeHtml(album)} · ${Math.round(count / total * 100)}%"></span>`).join('')}</div><div class="album-stat-key">${entries.map(([album, count], index) => `<span><i class="album-key-swatch album-segment-${index % 8}"></i>${escapeHtml(album)} <strong>${Math.round(count / total * 100)}%</strong></span>`).join('')}</div></div>`;
}

function renderTrackList(songs, artist) {
  const counts = new Map();
  songs.forEach((song) => { const album = String(song.album || 'Unknown album').trim() || 'Unknown album'; counts.set(album, (counts.get(album) || 0) + 1); });
  const colours = new Map([...counts.entries()].sort((a, b) => b[1] - a[1]).map(([album], index) => [album, index % 8]));
  return songs.map((song) => { const album = String(song.album || 'Unknown album').trim() || 'Unknown album'; return `<li><span class="track-title">${escapeHtml(song.title)}</span>${song.artist && song.artist !== artist ? ` <span>— ${escapeHtml(song.artist)}</span>` : ''}<span class="album-tooltip">${escapeHtml(album)}</span>${song.encore ? ' <b>Encore</b>' : ''}</li>`; }).join('');
}

function playSetTrack() {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  const entry = setQueue[setQueueIndex];
  if (!gig || !entry) { setPlayerStatus.textContent = 'End of available set.'; return; }
  const song = gig.songs[entry.songIndex];
  setPlayer.hidden = false;
  setPlayerTitle.textContent = `${entry.songIndex + 1}. ${song.title}`;
  renderSetTimeline(gig);
  if (entry.media.mimeType === 'video/youtube' && activeYoutubePlayer) {
    const parsed = new URL(entry.media.url);
    const videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
    activeYoutubeVideoId = videoId;
    activeYoutubePlayer.loadVideoById(videoId);
    return;
  }
  const next = setQueue[setQueueIndex + 1];
  const currentMarkup = entry.media.mimeType === 'video/youtube'
    ? `<iframe src="${youtubeEmbedUrl(entry.media.url)}" title="${escapeHtml(song.title)}" allowfullscreen></iframe>`
    : `<video class="set-player-current" src="${entry.media.url}" controls autoplay playsinline></video>`;
  const preloadMarkup = next?.media.mimeType === 'video/youtube'
    ? `<iframe class="set-player-preload" src="${youtubeEmbedUrl(next.media.url)}" title="Preloaded next track" aria-hidden="true"></iframe>`
    : next ? `<video class="set-player-preload" src="${next.media.url}" preload="auto" muted playsinline></video>` : '';
  setPlayerStage.innerHTML = `${currentMarkup}${preloadMarkup}`;
  setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length}`;
  const video = setPlayerStage.querySelector('video');
  if (video) video.play().catch(() => { setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · Press play to continue`; });
  if (video) video.addEventListener('ended', () => {
    const nextVideo = setPlayerStage.querySelector('.set-player-preload');
    if (nextVideo?.tagName === 'VIDEO' && next?.media.mimeType !== 'video/youtube') {
      nextVideo.classList.add('set-player-fading-in');
      video.classList.add('set-player-fading-out');
      nextVideo.muted = false;
      nextVideo.play().catch(() => {});
      setTimeout(() => { setQueueIndex += 1; playSetTrack(); }, 650);
    } else { setQueueIndex += 1; playSetTrack(); }
  });
  const youtubeFrame = setPlayerStage.querySelector('iframe:not(.set-player-preload)');
  if (youtubeFrame) {
    youtubeFrame.id = `set-player-youtube-${Date.now()}`;
    loadYouTubeApi().then((YT) => {
      activeYoutubePlayer = new YT.Player(youtubeFrame.id, { events: { onReady: (event) => event.target.playVideo(), onStateChange: (event) => { if (event.data === YT.PlayerState.ENDED) { setQueueIndex += 1; playSetTrack(); } } } });
    }).catch(() => {});
  }
}

playWholeSet?.addEventListener('click', () => {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  setQueue = (gig?.media || []).filter((media) => Number.isInteger(media.songIndex) && gig.songs[media.songIndex]).sort((a, b) => a.songIndex - b.songIndex).map((media) => ({ media, songIndex: media.songIndex }));
  setQueueIndex = 0;
  if (!setQueue.length) { setPlayer.hidden = false; setPlayerStatus.textContent = 'Assign media to setlist tracks first.'; return; }
  playSetTrack();
});
setPlayerNext?.addEventListener('click', () => { setQueueIndex += 1; playSetTrack(); });
setPlayerPrev.addEventListener('click', () => { if (setQueueIndex > 0) { setQueueIndex -= 1; playSetTrack(); } });
setPlayerFullscreen?.addEventListener('click', async () => {
  if (!document.fullscreenElement) await setPlayer.requestFullscreen?.();
  else await document.exitFullscreen?.();
});

findYouTubeSet.addEventListener('click', async () => {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  if (!gig?.songs?.length) { youtubeSearchMessage.textContent = 'Add a setlist before searching YouTube.'; return; }
  findYouTubeSet.disabled = true; findYouTubeSet.textContent = 'Searching YouTube…'; youtubeSearchMessage.textContent = ''; youtubeResults.replaceChildren();
  try {
    const payload = await fetchJson(`/api/gigs/${gig.id}/youtube-search`, { method: 'POST' });
    youtubeResults.innerHTML = payload.matches.map((match) => `<article class="youtube-match" data-song-index="${match.index}"><h3>${escapeHtml(match.title)}</h3><div class="youtube-match-options">${match.results.map((result) => `<div class="youtube-result"><img src="${escapeHtml(result.thumbnail)}" alt="" /><div><p>${escapeHtml(result.title)}</p><small>${escapeHtml(result.channel)}</small><button type="button" data-youtube-url="https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}">Add to other media</button></div></div>`).join('') || '<p>No matching videos found.</p>'}</div></article>`).join('');
    youtubeResults.querySelectorAll('[data-youtube-url]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = 'Adding…';
      const match = button.closest('.youtube-match');
      const songIndex = Number(match?.dataset.songIndex);
      const added = await fetchJson(`/api/gigs/${gig.id}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ externalUrl: button.dataset.youtubeUrl, caption: button.closest('.youtube-result').querySelector('p').textContent, songIndex: Number.isInteger(songIndex) ? songIndex : null }) });
      gig.media = [...(gig.media || []), added]; button.textContent = 'Added'; renderMediaGallery(document.querySelector('#show-detail-gallery'), gig.media, { editable: true, songs: gig.songs || [] });
    }));
  } catch (error) { youtubeSearchMessage.textContent = error.message; youtubeSearchMessage.classList.add('error'); }
  finally { findYouTubeSet.disabled = false; findYouTubeSet.textContent = 'Find YouTube videos'; }
});

function renderProfiles() {
  if (!profiles.some((profile) => profile.id === activeProfileId)) activeProfileId = account?.id || '';
  profileSelect.replaceChildren(new Option('Choose a profile…', ''));
  for (const profile of profiles) profileSelect.add(new Option(profile.name, profile.id));
  profileSelect.value = activeProfileId;
}

function renderSharedShows() {
  sharedList.replaceChildren();
  const profile = activeProfile();
  if (!profiles.length) {
    setSharedMessage('Add yourself, then add friends who use this shared instance.');
    return;
  }
  if (!profile) {
    setSharedMessage('Choose your profile to create or review shared shows.');
    return;
  }
  setSharedMessage(sharedShows.length ? `${sharedShows.length} shared show${sharedShows.length === 1 ? '' : 's'} in this instance.` : 'Share a gig from your archive to start a collaborative record.');
  for (const show of sharedShows) {
    const card = document.querySelector('#shared-template').content.cloneNode(true);
    const date = formatGigDate(show.date);
    card.querySelector('.shared-date').textContent = date;
    card.querySelector('h3').textContent = show.artist;
    card.querySelector('.shared-place').textContent = `${show.venue} · ${show.city}`;
    card.querySelector('.shared-song-count').textContent = show.songs?.length ? `${show.songs.length} songs` : 'No setlist yet';
    card.querySelector('.shared-people').innerHTML = `<span>Went with</span>${show.attendees.map((person) => `<b>${escapeHtml(person.name)}</b>`).join('')}`;
    const attendeeSelect = card.querySelector('.attendee-select');
    const attendeeIds = new Set(show.attendees.map((person) => person.id));
    for (const person of profiles.filter((candidate) => !attendeeIds.has(candidate.id))) attendeeSelect.add(new Option(person.name, person.id));
    const addAttendee = card.querySelector('.add-attendee');
    if (!attendeeSelect.options.length) addAttendee.hidden = true;
    else card.querySelector('.add-attendee').addEventListener('click', async () => {
      try {
        await fetchJson(`/api/shared/shows/${show.id}/attendees`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: attendeeSelect.value }) });
        await refreshCollaboration();
      } catch (error) { setSharedMessage(error.message, true); }
    });

    const review = show.reviews.find((entry) => entry.profileId === profile.id) || {};
    const reviewSection = card.querySelector('.shared-review');
    if (!attendeeIds.has(profile.id)) {
      reviewSection.hidden = true;
    } else {
      reviewSection.querySelector('.shared-notes').value = review.notes || '';
      reviewSection.querySelectorAll('.shared-stars').forEach((stars) => {
        const field = stars.dataset.field;
        stars.dataset.value = review[field] || '';
        renderSharedStars(stars);
      });
      card.querySelector('.save-shared-review').addEventListener('click', async () => {
        try {
          const data = { profileId: profile.id, notes: reviewSection.querySelector('.shared-notes').value };
          reviewSection.querySelectorAll('.shared-stars').forEach((stars) => { data[stars.dataset.field] = stars.dataset.value || null; });
          await fetchJson(`/api/shared/shows/${show.id}/reviews`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          await refreshCollaboration();
        } catch (error) { setSharedMessage(error.message, true); }
      });
    }
    sharedList.append(card);
  }
}

function renderSharedStars(stars) {
  const rating = Number(stars.dataset.value) || 0;
  stars.innerHTML = [1, 2, 3, 4, 5].map((value) => `<button type="button" value="${value}" class="${value <= rating ? 'selected' : ''}" aria-label="${value} stars">★</button>`).join('');
  stars.closest('.shared-rating-row').querySelector('.shared-rating-number').textContent = rating ? `${rating} / 5` : 'Unrated';
  stars.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    stars.dataset.value = button.value;
    renderSharedStars(stars);
  }));
}

async function refreshCollaboration() {
  const [profileData, showData] = await Promise.all([fetchJson('/api/profiles'), fetchJson('/api/shared/shows')]);
  profiles = profileData;
  sharedShows = showData;
  renderProfiles();
  renderSharedShows();
}

function showAuth(status) {
  authPanel.hidden = false;
  profileBar.hidden = true;
  setupForm.hidden = Boolean(status.configured);
  loginForm.hidden = !status.configured;
  const invite = new URLSearchParams(window.location.search).get('invite');
  registerForm.hidden = !invite;
  if (invite) loginForm.hidden = true;
  authMessage.textContent = invite ? 'Create your account to join this shared instance.' : status.configured ? 'Sign in to your account.' : 'Create the owner account for this shared instance.';
}

async function submitAuth(form, endpoint, extra = {}) {
  try {
    const payload = { ...Object.fromEntries(new FormData(form).entries()), ...extra };
    const signedIn = await fetchJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    account = signedIn;
    activeProfileId = account.id;
    window.location.replace('/');
  } catch (error) { authMessage.textContent = error.message; authMessage.classList.add('error'); }
}

setupForm.addEventListener('submit', (event) => { event.preventDefault(); submitAuth(setupForm, '/api/auth/setup'); });
loginForm.addEventListener('submit', (event) => { event.preventDefault(); submitAuth(loginForm, '/api/auth/login'); });
registerForm.addEventListener('submit', (event) => { event.preventDefault(); submitAuth(registerForm, '/api/auth/register', { inviteToken: new URLSearchParams(window.location.search).get('invite') }); });
logoutButton.addEventListener('click', async () => { await fetchJson('/api/auth/logout', { method: 'POST' }); account = null; activeProfileId = ''; showAuth({ configured: true }); });
accountForm?.addEventListener('submit', async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(accountForm)); accountMessage.textContent = 'Updating…'; try { account = await fetchJson('/api/auth/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); accountMessage.textContent = 'Account updated.'; accountForm.reset(); accountForm.elements.name.value = account.name; } catch (error) { accountMessage.textContent = error.message; accountMessage.classList.add('error'); } });
peerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!peerMessage) return;
  peerMessage.textContent = 'Pairing…'; peerMessage.classList.remove('error');
  try {
    await fetchJson('/api/peers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(peerForm).entries())) });
    peerForm.reset(); peerMessage.textContent = 'Paired instance saved.'; await renderInstanceSettings();
  } catch (error) { peerMessage.textContent = error.message; peerMessage.classList.add('error'); }
});
createPeerInvite?.addEventListener('click', async () => {
  createPeerInvite.disabled = true;
  try {
    const invite = await fetchJson('/api/peers/invite', { method: 'POST' });
    let copied = false;
    try { await navigator.clipboard.writeText(invite.inviteUrl); copied = true; } catch {}
    peerInviteMessage.textContent = copied ? 'Pairing invite copied. It expires in seven days.' : `Copy this invite URL: ${invite.inviteUrl}`;
    peerInviteMessage.classList.remove('error');
  } catch (error) { peerInviteMessage.textContent = error.message; peerInviteMessage.classList.add('error'); }
  finally { createPeerInvite.disabled = false; }
});
importPeerInvite?.addEventListener('click', async () => {
  const value = peerInviteToken.value.trim();
  if (!value) return;
  importPeerInvite.disabled = true;
  try {
    let token = value;
    try { const parsed = new URL(value); token = parsed.searchParams.get('peerInvite') || value; } catch {}
    await fetchJson('/api/peers/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    peerInviteToken.value = '';
    peerInviteMessage.textContent = 'Peer paired successfully.';
    peerInviteMessage.classList.remove('error');
    await renderInstanceSettings();
  } catch (error) { peerInviteMessage.textContent = error.message; peerInviteMessage.classList.add('error'); }
  finally { importPeerInvite.disabled = false; }
});
inviteButton.addEventListener('click', async () => {
  try {
    const invite = await fetchJson('/api/auth/invites', { method: 'POST' });
    await navigator.clipboard.writeText(invite.inviteUrl);
    setSharedMessage('Invite link copied. It expires in seven days.');
  } catch (error) { setSharedMessage(error.message, true); }
});
downloadBackupButton.addEventListener('click', async () => {
  try {
    downloadBackupButton.disabled = true;
    const backup = await fetchJson('/api/backup');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
    link.download = `the-master-list-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) { setSharedMessage(error.message, true); } finally { downloadBackupButton.disabled = false; }
});
exportArchiveButton?.addEventListener('click', async () => { try { const data = await fetchJson('/api/archive/export'); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `the-master-list-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); } catch (error) { setSharedMessage(error.message, true); } });
importArchiveInput?.addEventListener('change', async () => { const file = importArchiveInput.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()); await fetchJson('/api/archive/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); setSharedMessage(`Imported ${data.gigs?.length || 0} shows.`); window.location.reload(); } catch (error) { setSharedMessage(error.message, true); } finally { importArchiveInput.value = ''; } });
cleanupMediaButton?.addEventListener('click', async () => { if (!confirm('Delete media files that are no longer referenced by a show?')) return; try { const result = await fetchJson('/api/media/cleanup', { method: 'POST' }); setSharedMessage(`Removed ${result.removed} unused media file${result.removed === 1 ? '' : 's'}.`); } catch (error) { setSharedMessage(error.message, true); } });

document.querySelector('#find-setlist').addEventListener('click', async () => {
  const gig = formValues();
  if (!gig.artist || !gig.city) {
    setMessage('Add an artist and city before searching.', true);
    return;
  }
  setMessage('Searching setlist.fm…');
  results.hidden = true;
  try {
    const params = new URLSearchParams({ artistName: gig.artist, cityName: gig.city, eventDate: gig.date });
    const payload = await fetchJson(`/api/setlists/search?${params}`);
    if (!payload.setlists.length) {
      setMessage('No matches found. You can still save the show without a setlist.');
      return;
    }
    renderMatches(payload.setlists);
    setMessage(`Found ${payload.setlists.length} possible match${payload.setlists.length === 1 ? '' : 'es'}. Choose a date to attach it.`);
  } catch (error) {
    setMessage(error.message, true);
  }
});

function renderMatches(setlists) {
  results.innerHTML = `<p class="eyebrow">Possible setlists</p>${setlists.map((setlist, index) => `
    <button class="match" data-match="${index}" type="button">
      <strong>${escapeHtml(setlist.venue || 'Unknown venue')}</strong>
      <span>${escapeHtml(setlist.city)} · ${escapeHtml(setlist.date || 'Date unknown')} · ${setlist.songs.length} songs</span>
    </button>`).join('')}`;
  results.hidden = false;
  results.querySelectorAll('[data-match]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedSetlist = setlists[Number(button.dataset.match)];
      form.elements.venue.value = selectedSetlist.venue || form.elements.venue.value;
      form.elements.city.value = selectedSetlist.city || form.elements.city.value;
      if (selectedSetlist.date) { const [day, month, year] = selectedSetlist.date.split('-'); form.elements.date.value = `${year}-${month}-${day}`; }
      results.querySelectorAll('.match').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      setMessage(`Setlist selected: ${selectedSetlist.songs.length} songs will be saved with this show.`);
    });
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const gig = formValues();
  const mediaFiles = pendingMedia.get(mediaInput) || [...(mediaInput?.files || [])];
  delete gig.media;
  const payload = { ...gig, attendees: readAttendees(addAttendeePicker), songs: selectedSetlist?.songs || [], setlistFmId: selectedSetlist?.id || null, setlistFmUrl: selectedSetlist?.url || null };
  const submitButton = form.querySelector('button[type="submit"]');
  try {
    submitButton.disabled = true;
    const saved = await fetchJson('/api/gigs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (mediaFiles.length) {
      if (isMobileUpload) {
        const uploadState = mobileUploadStateFor(mediaInput, saved.id);
        uploadState.releaseAfterDrain = true;
        startMobileUploadQueue(mediaInput, saved.id, (item) => {
          setMessage(`${item.name} uploaded. Continuing the queue…`);
        }, async () => {
          try { await pollMediaRecognition(saved.id, (refreshed) => { gigs = gigs.map((entry) => entry.id === saved.id ? { ...entry, media: refreshed } : entry); renderGigs(); }); } catch { /* the upload itself already succeeded */ }
        });
      } else await uploadGigMedia(saved.id, mediaFiles, (file, fraction) => setMessage(fraction >= 1 ? `Upload complete · preparing mobile playback for ${file.name}…` : `Uploading ${file.name} · ${Math.round(fraction * 100)}%`));
    }
    await addYouTubeMedia(saved.id, youtubeMediaInput);
    gigs.unshift(saved);
    form.reset();
    resetReviewForm();
    selectedSetlist = null;
    results.hidden = true;
    setMessage(isMobileUpload && mediaFiles.length ? 'Show saved. Uploads are continuing in the queue.' : 'Show saved to The Master List.');
    renderGigs();
    await loadPersistentJobs();
    await renderDashboardStats();
  } catch (error) {
    setMessage(error.message, true);
  } finally { submitButton.disabled = false; }
});

function renderGigs() {
  count.textContent = `${gigs.length} show${gigs.length === 1 ? '' : 's'}`;
  archiveStats.innerHTML = `<span>${gigs.length} shows</span><span>${new Set(gigs.map((gig) => gig.artist.toLowerCase())).size} artists</span><span>${new Set(gigs.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size} venues</span><span>${gigs.filter((gig) => gig.favorite).length} favourites</span><span>${gigs.reduce((total, gig) => total + (gig.songs?.length || 0), 0)} songs</span>`;
  const query = showFilter?.value.trim().toLowerCase() || '';
  const year = yearFilter?.value || '';
  const sort = sortFilter?.value || 'newest';
  const filtered = gigs.filter((gig) => (!query || [gig.artist, gig.venue, gig.city].some((value) => value.toLowerCase().includes(query))) && (!year || gig.date.startsWith(year)) && (!favouriteFilter?.checked || gig.favorite));
  emptyState.hidden = Boolean(filtered.length);
  copyPlaylist.hidden = !gigs.some((gig) => gig.songs?.length);
  gigList.replaceChildren();
  const orderedGigs = [...filtered].sort((a, b) => sort === 'oldest' ? a.date.localeCompare(b.date) : sort === 'rating' ? (Number(b.performanceRating || 0) - Number(a.performanceRating || 0)) || b.date.localeCompare(a.date) : Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.date.localeCompare(a.date));
  for (const gig of orderedGigs) {
    const card = document.querySelector('#gig-template').content.cloneNode(true);
    card.querySelector('.gig-card').id = `gig-${gig.id}`;
    card.querySelector('.edit-gig').href = `/edit?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.show-detail-link').href = `/show?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.play-gig').href = `/playback?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.play-gig').textContent = '▶';
    card.querySelector('.play-gig').setAttribute('aria-label', 'Play set');
    const date = formatGigDate(gig.date);
    card.querySelector('.gig-date').textContent = date;
    card.querySelector('h3').innerHTML = `<a class="artist-link" href="/artist?name=${encodeURIComponent(gig.artist)}">${escapeHtml(gig.artist)}</a>`;
    card.querySelector('.gig-place').innerHTML = `<a class="venue-link" href="/venue?name=${encodeURIComponent(gig.venue)}&city=${encodeURIComponent(gig.city)}">${escapeHtml(gig.venue)}</a> · <a class="venue-link" href="/city?name=${encodeURIComponent(gig.city)}">${escapeHtml(gig.city)}</a>`;
    card.querySelector('.gig-notes').textContent = gig.performanceNotes || gig.notes || '';
    card.querySelector('.venue-notes').textContent = gig.venueNotes ? `Venue: ${gig.venueNotes}` : '';
    card.querySelector('.song-total').textContent = gig.songs?.length ? `${gig.songs.length} songs` : 'No setlist';
    const ratings = card.querySelector('.gig-ratings');
    ratings.innerHTML = quickRating('performanceRating', 'Performance', gig.performanceRating) + quickRating('venueRating', 'Venue', gig.venueRating);
    ratings.querySelectorAll('.quick-star').forEach((button) => button.addEventListener('click', async () => {
      try {
        const updated = await fetchJson(`/api/gigs/${gig.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [button.dataset.field]: Number(button.dataset.rating) })
        });
        gigs = gigs.map((entry) => entry.id === gig.id ? updated : entry);
        renderGigs();
      } catch (error) {
        setMessage(error.message, true);
      }
    }));
    const heart = card.querySelector('.heart-toggle');
    heart.textContent = gig.favorite ? '♥' : '♡';
    heart.classList.toggle('favorite', Boolean(gig.favorite));
    heart.setAttribute('aria-label', gig.favorite ? 'Remove from favourites' : 'Mark as favourite');
    heart.addEventListener('click', async () => {
      try {
        const updated = await fetchJson(`/api/gigs/${gig.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: !gig.favorite }) });
        gigs = gigs.map((entry) => entry.id === gig.id ? updated : entry);
        renderGigs();
      } catch (error) {
        setMessage(error.message, true);
      }
    });
    card.querySelector('.share-gig').addEventListener('click', async () => {
      const profile = activeProfile();
      if (!profile) {
        window.location.assign('/shared');
        return;
      }
      try {
        await fetchJson('/api/shared/shows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceGigId: gig.id, profileId: profile.id }) });
        window.location.assign('/shared');
      } catch (error) { setSharedMessage(error.message, true); }
    });
    const setlist = card.querySelector('.setlist');
    const exports = card.querySelector('.exports');
    if (gig.songs?.length) {
      const tracks = `<ol>${gig.songs.map((song) => `<li>${escapeHtml(song.title)}${song.artist && song.artist !== gig.artist ? ` <span>— ${escapeHtml(song.artist)}</span>` : ''}${song.encore ? ' <b>Encore</b>' : ''}</li>`).join('')}</ol>${gig.setlistFmUrl ? `<a href="${escapeHtml(gig.setlistFmUrl)}" target="_blank" rel="noreferrer">View source on setlist.fm ↗</a>` : ''}`;
      setlist.innerHTML = `<details class="setlist-accordion"><summary>Setlist <span>${gig.songs.length} tracks</span></summary><div class="setlist-accordion-content">${tracks}</div></details>`;
      exports.hidden = false;
      setupExportButtons(exports, gig);
    }
    renderMediaGallery(card.querySelector('.media-gallery'), gig.media, { songs: gig.songs || [] });
    card.querySelector('.delete-gig').addEventListener('click', async () => {
      if (!confirm(`Remove ${gig.artist} at ${gig.venue}?`)) return;
      await fetchJson(`/api/gigs/${gig.id}`, { method: 'DELETE' });
      gigs = gigs.filter((item) => item.id !== gig.id);
      renderGigs();
    });
    gigList.append(card);
  }
}

function renderCityPage() {
  if (page !== 'city') return;
  const city = new URLSearchParams(window.location.search).get('name')?.trim() || '';
  document.querySelector('#city-heading').textContent = city || 'Location';
  const venues = [...new Map(gigs.filter((gig) => gig.city.toLowerCase() === city.toLowerCase()).map((gig) => [`${gig.venue}|${gig.city}`, gig])).values()];
  document.querySelector('#city-subtitle').textContent = `${venues.length} venue${venues.length === 1 ? '' : 's'} in this area`;
  document.querySelector('#city-venues').innerHTML = venues.map((gig) => `<a class="city-venue-card" href="/venue?name=${encodeURIComponent(gig.venue)}&city=${encodeURIComponent(gig.city)}"><strong>${escapeHtml(gig.venue)}</strong><span>${gigs.filter((entry) => entry.venue === gig.venue && entry.city === gig.city).length} show${gigs.filter((entry) => entry.venue === gig.venue && entry.city === gig.city).length === 1 ? '' : 's'}</span></a>`).join('') || '<p class="empty-state">No venues recorded here yet.</p>';
}

function populateYearFilter() {
  if (!yearFilter) return;
  const selected = yearFilter.value;
  yearFilter.replaceChildren(new Option('All years', ''));
  [...new Set(gigs.map((gig) => gig.date.slice(0, 4)))].sort().reverse().forEach((year) => yearFilter.add(new Option(year, year)));
  yearFilter.value = selected;
}

[showFilter, yearFilter, sortFilter, favouriteFilter].forEach((control) => control?.addEventListener('input', renderGigs));

function quickRating(field, label, value) {
  const rating = Number(value) || 0;
  return `<span class="quick-rating"><span class="rating-label">${label}</span>${[1, 2, 3, 4, 5].map((star) => `<button class="quick-star${star <= rating ? ' selected' : ''}" type="button" data-field="${field}" data-rating="${star}" aria-label="Rate ${label.toLowerCase()} ${star} out of 5">★</button>`).join('')}</span>`;
}

loadMapButton.addEventListener('click', async () => {
  if (!gigs.length) {
    mapMessage.textContent = 'Add a show first, then come back to map the places it happened.';
    return;
  }
  loadMapButton.disabled = true;
  loadMapButton.textContent = 'Finding venues…';
  mapMessage.textContent = 'Looking up venues that have not been placed yet…';
  try {
    const payload = await fetchJson('/api/map/locations', { method: 'POST' });
    drawMap(payload.locations);
  } catch (error) {
    mapMessage.textContent = error.message;
    mapMessage.classList.add('error');
  } finally {
    loadMapButton.disabled = false;
    loadMapButton.textContent = 'Refresh map';
  }
});

function drawMap(locations) {
  if (!locations.length) {
    mapMessage.textContent = 'No venues could be placed yet. Try adding a clearer venue and city name.';
    return;
  }
  mapMessage.classList.remove('error');
  mapMessage.textContent = `${locations.length} venue${locations.length === 1 ? '' : 's'} placed. Select a marker to revisit a show.`;
  mapElement.hidden = false;
  if (!venueMap) {
    venueMap = L.map(mapElement, { scrollWheelZoom: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(venueMap);
    venueLayer = L.layerGroup().addTo(venueMap);
  }
  venueLayer.clearLayers();
  for (const location of locations) {
    const popup = `<strong>${escapeHtml(location.venue)}</strong><br><span>${escapeHtml(location.city)}</span><ul>${location.gigs.map((gig) => `<li><a href="/artist?name=${encodeURIComponent(gig.artist)}">${escapeHtml(gig.artist)}</a> · ${escapeHtml(gig.date || 'Date unknown')}</li>`).join('')}</ul>`;
    L.circleMarker([location.lat, location.lng], {
      radius: Math.min(7 + location.gigs.length * 2, 16), color: '#274b42', weight: 2, fillColor: '#e85c34', fillOpacity: 0.9
    }).bindPopup(popup).addTo(venueLayer);
  }
  const points = locations.map((location) => [location.lat, location.lng]);
  if (points.length === 1) venueMap.setView(points[0], 13);
  else venueMap.fitBounds(points, { padding: [48, 48], maxZoom: 13 });
  setTimeout(() => venueMap.invalidateSize(), 0);
}

function providerName(provider) {
  return ({ spotify: 'Spotify', youtube: 'YouTube', 'apple-music': 'Apple Music' })[provider];
}

function integrationFor(provider) {
  return provider === 'apple-music' ? integrations.appleMusic : integrations[provider];
}

function setupExportButtons(exports, gig) {
  const status = exports.querySelector('.export-result');
  exports.querySelectorAll('.export-button').forEach((button) => {
    const provider = button.dataset.provider;
    const integration = integrationFor(provider);
    const label = providerName(provider);
    if (!integration?.configured) {
      button.textContent = `Set up ${label}`;
      button.disabled = true;
      button.title = `Add ${label} credentials to .env, then restart the server.`;
      return;
    }
    if (provider !== 'apple-music' && !integration.connected) button.textContent = `Connect ${label}`;
    else button.textContent = `Export to ${label}`;
    button.addEventListener('click', () => runExport(provider, gig, exports, status));
  });
}

async function runExport(provider, gig, exports, status) {
  const integration = integrationFor(provider);
  if (provider !== 'apple-music' && !integration.connected) {
    window.location.assign(`/auth/${provider}`);
    return;
  }
  const buttons = [...exports.querySelectorAll('button')];
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = `Matching ${gig.songs.length} songs and creating your ${providerName(provider)} playlist…`;
  try {
    let body = {};
    if (provider === 'apple-music') body = { musicUserToken: await authorizeAppleMusic(integration.developerToken) };
    const result = await fetchJson(`/api/gigs/${gig.id}/export/${provider}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    status.replaceChildren();
    const link = document.createElement('a');
    link.href = result.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = `Open ${providerName(provider)} playlist ↗`;
    status.append(`Created with ${result.matched} matched song${result.matched === 1 ? '' : 's'}. `, link);
    if (result.unmatched?.length) status.append(` ${result.unmatched.length} song${result.unmatched.length === 1 ? '' : 's'} could not be matched.`);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error');
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function authorizeAppleMusic(developerToken) {
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
  if (!musicKitConfigured) {
    window.MusicKit.configure({ developerToken, app: { name: 'The Master List', build: '0.1.0' } });
    musicKitConfigured = true;
  }
  return window.MusicKit.getInstance().authorize();
}

copyPlaylist.addEventListener('click', async () => {
  const source = gigs.find((gig) => gig.songs?.length);
  if (!source) return;
  const text = source.songs.map((song) => `${song.artist || source.artist} — ${song.title}`).join('\n');
  await navigator.clipboard.writeText(text);
  copyPlaylist.textContent = 'Copied!';
  setTimeout(() => { copyPlaylist.textContent = 'Copy selected setlist'; }, 1800);
});

async function initializeApp() {
  const auth = await fetchJson('/api/auth/status');
  account = auth.account;
  if (accountForm && account) accountForm.elements.name.value = account.name;
  if (!account) {
    if (page === 'home') { window.location.replace('/login'); return; }
    showAuth(auth);
  } else {
    authPanel.hidden = true;
    profileBar.hidden = false;
    inviteButton.hidden = !account.isAdmin;
    activeProfileId = account.id;
  }
  const [gigData, integrationData, profileData, showData, peerData] = await Promise.all([fetchJson('/api/gigs'), fetchJson('/api/integrations'), fetchJson('/api/profiles'), fetchJson('/api/shared/shows'), account ? fetchJson('/api/peers') : Promise.resolve([])]);
    gigs = gigData;
    integrations = integrationData;
    profiles = profileData;
    sharedShows = showData;
    peers = peerData;
    renderAttendeePicker(addAttendeePicker, []);
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) setMessage(`${providerName(params.get('connected'))} connected. Choose a show to export.`);
    if (params.get('integrationError')) setMessage('Could not connect that music service. Check its configuration and try again.', true);
    populateYearFilter();
    populateShowAutofill();
    renderGigs();
    await renderDashboardStats();
    await renderApiLimits();
    renderProfiles();
    renderSharedShows();
    await renderInstanceSettings();
    await renderArtistPage();
    renderShowPage();
    renderCityPage();
    await renderVenuePage();
    await renderVenueEditPage();
    renderEditPage();
    if (page === 'map' && loadMapButton) loadMapButton.click();
}

initializeApp().catch((error) => setMessage(error.message, true));
