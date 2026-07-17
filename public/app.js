const form = document.querySelector('#gig-form');
const mobileMenuToggle = document.querySelector('#mobile-menu-toggle');
const siteNav = document.querySelector('#site-nav');
mobileMenuToggle?.addEventListener('click', () => { const open = siteNav.classList.toggle('is-open'); mobileMenuToggle.setAttribute('aria-expanded', String(open)); });
const jobQueue = new Map();
const jobPanel = document.createElement('aside'); jobPanel.className = 'job-queue'; jobPanel.hidden = true; jobPanel.innerHTML = '<p class="eyebrow">Background jobs</p><div class="job-queue-list"></div>'; document.body.append(jobPanel);
const notificationPanel = document.createElement('aside'); notificationPanel.className = 'peer-notifications'; notificationPanel.hidden = true; notificationPanel.innerHTML = '<p class="eyebrow">From your peers</p><div class="peer-notification-list"></div>'; document.body.append(notificationPanel);
let peerPollRunning = false;
let peerPollTimer;
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
window.addEventListener('beforeunload', (event) => {
  const activeJob = [...jobQueue.values()].some((job) => job.type === 'Uploading' && job.status === 'running');
  const mobileState = mobileUploadStates.get(editMediaInput);
  const queuedMobileUpload = mobileState?.items?.some((item) => ['queued', 'uploading'].includes(item.status));
  if (activeJob || queuedMobileUpload) { event.preventDefault(); event.returnValue = ''; }
});
async function loadPersistentJobs() { try { const jobs = await fetchJson('/api/jobs'); jobs.forEach((job) => updateJob(job.id, job)); } catch {} }
const message = document.querySelector('#form-message');
const results = document.querySelector('#search-results');
const gigList = document.querySelector('#gig-list');
const emptyState = document.querySelector('#empty-state');
const count = document.querySelector('#record-count');
const showFilter = document.querySelector('#show-filter');
const yearFilter = document.querySelector('#year-filter');
const sortFilter = document.querySelector('#sort-filter');
const favouriteFilter = document.querySelector('#favourite-filter');
const archiveStats = document.querySelector('#archive-stats');
const dashboardStats = document.querySelector('#dashboard-stats');
const artistsFilter = document.querySelector('#artists-filter');
const artistsSort = document.querySelector('#artists-sort');
const artistsSummary = document.querySelector('#artists-summary');
const artistsGrid = document.querySelector('#artists-grid');
const venuesFilter = document.querySelector('#venues-filter');
const venuesSort = document.querySelector('#venues-sort');
const venuesSummary = document.querySelector('#venues-summary');
const venuesGrid = document.querySelector('#venues-grid');
const timelineSummary = document.querySelector('#timeline-summary');
const timelineChart = document.querySelector('#timeline-chart');
const timelineYearDetail = document.querySelector('#timeline-year-detail');
const timelineSelectedYear = document.querySelector('#timeline-selected-year');
const timelineYearChange = document.querySelector('#timeline-year-change');
const timelineMonths = document.querySelector('#timeline-months');
const timelineYearShows = document.querySelector('#timeline-year-shows');
const apiLimitsGrid = document.querySelector('#api-limits-grid');
const apiLimitsNote = document.querySelector('#api-limits-note');
const apiUsageDetail = document.querySelector('#api-usage-detail');
const globalSearchInput = document.querySelector('#global-search-input');
const globalSearchYear = document.querySelector('#global-search-year');
const globalSearchRating = document.querySelector('#global-search-rating');
const globalSearchMedia = document.querySelector('#global-search-media');
const globalSearchFavourite = document.querySelector('#global-search-favourite');
const globalSearchSummary = document.querySelector('#global-search-summary');
const globalSearchResults = document.querySelector('#global-search-results');
const healthSummary = document.querySelector('#health-summary');
const healthFilters = document.querySelector('#health-filters');
const healthList = document.querySelector('#health-list');
const healthMessage = document.querySelector('#health-message');
const repairAllMetadata = document.querySelector('#repair-all-metadata');
const addDuplicateWarning = document.querySelector('#add-duplicate-warning');
const editDuplicateWarning = document.querySelector('#edit-duplicate-warning');
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
const archiveArtistImageCache = new Map();
let activeProfileId = '';
let account = null;
let musicKitConfigured = false;
let venueMap;
let venueLayer;

const page = document.body.dataset.page || 'home';
const routeSections = {
  home: ['home-page'],
  overview: ['overview-page'],
  artists: ['artists-page'],
  venues: ['venues-page'],
  timeline: ['timeline-page'],
  search: ['search-page'],
  health: ['health-page'],
  'api-limits': ['api-limits-page'],
  add: ['add-page'],
  shows: ['shows-archive'],
  shared: ['shows-archive'],
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
for (const id of ['home-page', 'overview-page', 'artists-page', 'venues-page', 'timeline-page', 'search-page', 'health-page', 'api-limits-page', 'add-page', 'shows-archive', 'artist-page', 'show-page', 'venue-page', 'venue-edit-page', 'edit-page', 'shows-shared', 'map-page', 'city-page', 'account-page']) {
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
function mobileUploadStateFor(input, gigId = '', category = 'show') {
  let state = mobileUploadStates.get(input);
  if (!state) { state = { gigId: '', category, items: [], processing: false, startTimer: null, onUploaded: null, onDrained: null, completedSinceDrain: 0, releaseAfterDrain: false }; mobileUploadStates.set(input, state); }
  if (gigId) state.gigId = gigId;
  if (category) state.category = category;
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
        await uploadGigMedia(state.gigId, [item.file], (file, fraction) => { item.progress = fraction * 100; scheduleMobileUploadStateRender(input, state); }, state.category);
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
function startMobileUploadQueue(input, gigId, onUploaded, onDrained, category = 'show') {
  const state = mobileUploadStateFor(input, gigId, category);
  state.onUploaded = onUploaded || state.onUploaded;
  state.onDrained = onDrained || state.onDrained;
  state.items.filter((item) => item.status === 'waiting').forEach((item) => { item.status = 'queued'; });
  pendingMedia.set(input, []);
  renderMobileUploadState(input, state);
  return processMobileUploadQueue(input, state);
}
function setupMobileFileQueue(input, category = 'show') {
  if (!input || !isMobileUpload) return;
  pendingMedia.set(input, []);
  mobileUploadStateFor(input, '', category);
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
const mediaWorkspaceStats = document.querySelector('#media-workspace-stats');
const mediaWorkspaceFilters = document.querySelector('#media-workspace-filters');
const mediaWorkspaceEmpty = document.querySelector('#media-workspace-empty');
const mediaWorkspaceRefresh = document.querySelector('#media-workspace-refresh');
const playbackEditorList = document.querySelector('#playback-editor-list');
const playbackEditorHealth = document.querySelector('#playback-editor-health');
const playbackEditorSuggestions = document.querySelector('#playback-editor-suggestions');
const playbackEditorMessage = document.querySelector('#playback-editor-message');
const autoBuildPlaybackPlan = document.querySelector('#auto-build-playback-plan');
const savePlaybackPlan = document.querySelector('#save-playback-plan');
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
const showDetailArtifacts = document.querySelector('#show-detail-artifacts');
const showDetailNoArtifacts = document.querySelector('#show-detail-no-artifacts');
const showMemoryFacts = document.querySelector('#show-memory-facts');
const showNavTrackCount = document.querySelector('#show-nav-track-count');
const showNavMediaCount = document.querySelector('#show-nav-media-count');
const showNavArtifactCount = document.querySelector('#show-nav-artifact-count');
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
const setPlayerRestart = document.createElement('button');
setPlayerRestart.type = 'button'; setPlayerRestart.className = 'button button-secondary set-player-restart'; setPlayerRestart.textContent = '↺ Start over';
const setPlayerControlsToggle = document.createElement('button');
setPlayerControlsToggle.type = 'button'; setPlayerControlsToggle.className = 'set-player-controls-toggle'; setPlayerControlsToggle.textContent = '•••'; setPlayerControlsToggle.setAttribute('aria-label', 'Show or hide playback controls');
setPlayer.append(setPlayerControlsToggle);
const setPlayerControls = document.createElement('div'); setPlayerControls.className = 'set-player-controls';
if (setPlayerNext?.parentNode) { setPlayerNext.parentNode.insertBefore(setPlayerControls, setPlayerNext); setPlayerControls.append(setPlayerPrev, setPlayerRestart); if (setPlayerFullscreen) setPlayerControls.append(setPlayerFullscreen); setPlayerControls.append(setPlayerNext); }
const setPlayerStatus = document.querySelector('#set-player-status');
const setPlayerProgress = document.querySelector('#set-player-progress');
const setPlayerMarkers = document.querySelector('#set-player-markers');
const setPlayerTimeline = document.querySelector('.set-player-timeline');
const setPlayerOverview = document.querySelector('#set-player-overview');
const setPlayerOverviewProgress = document.querySelector('#set-player-overview-progress');
const setPlayerOverviewMarkers = document.querySelector('#set-player-overview-markers');
const setPlayerElapsed = document.querySelector('#set-player-elapsed');
const setPlayerTotal = document.querySelector('#set-player-total');
const setPlayerSourceKind = document.querySelector('#set-player-source-kind');
const setPlayerSourceLabel = document.querySelector('#set-player-source-label');
const setPlayerContextPrevious = document.querySelector('#set-player-context-previous');
const setPlayerContextCurrent = document.querySelector('#set-player-context-current');
const setPlayerContextNext = document.querySelector('#set-player-context-next');
let setQueue = [];
let setQueueIndex = 0;
let youtubeApiPromise;
let activeYoutubePlayer;
let activeYoutubeVideoId = '';
let youtubeTimelineTimer;
let setSourceLoadTimer;
let setFallbackPending = false;
let pendingSetSeek = null;
let setTrackAdvancePending = false;
let resumeSaveAt = 0;
let theatreControlsTimer;
let setPlaybackWakeLock;
const setTimelineMedia = matchMedia('(max-width: 640px)');
let setTimelineZoom = setTimelineMedia.matches ? 3 : 5;
const formatPlaybackTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const playbackResumeKey = (gigId) => `master-list:playback:${gigId}`;
function updateSetTheatreMeta(gig, entry) {
  const media = entry?.media;
  const sourceType = media?.mimeType === 'video/youtube' ? 'YouTube' : media ? 'Your upload' : 'No source';
  const sourceNumber = Number(entry?.sourceIndex || 0);
  setPlayerSourceKind.textContent = sourceNumber ? `${sourceType} · Backup ${sourceNumber}` : sourceType;
  setPlayerSourceLabel.textContent = media ? (media.caption || media.filename || 'Untitled video') : 'This track will be skipped';
  const previousEntry = setQueueIndex > 0 ? setQueue[setQueueIndex - 1] : null;
  const nextEntry = setQueueIndex < setQueue.length - 1 ? setQueue[setQueueIndex + 1] : null;
  setPlayerContextPrevious.textContent = previousEntry ? `← ${setQueueEntryTitle(gig, previousEntry)}` : 'Start of set';
  setPlayerContextCurrent.textContent = entry?.isUnknown ? 'Unknown' : `${entry.songIndex + 1} / ${gig.songs.length}`;
  setPlayerContextNext.textContent = nextEntry ? `${setQueueEntryTitle(gig, nextEntry)} →` : 'End of set';
}
function setPlaybackIsPlaying() {
  const video = setPlayerStage.querySelector('video.set-player-current');
  if (video) return !video.paused && !video.ended;
  try { return activeYoutubePlayer?.getPlayerState?.() === 1; } catch { return false; }
}
function scheduleTheatreControls() {
  clearTimeout(theatreControlsTimer);
  if (document.fullscreenElement !== setPlayer || !setPlaybackIsPlaying()) return;
  theatreControlsTimer = setTimeout(() => {
    if (document.fullscreenElement === setPlayer && !timelinePointer && setPlaybackIsPlaying()) setPlayer.classList.add('theatre-idle');
  }, 3400);
}
function revealTheatreControls({ schedule = true } = {}) {
  setPlayer.classList.remove('theatre-idle', 'controls-hidden');
  clearTimeout(theatreControlsTimer);
  if (schedule) scheduleTheatreControls();
}
async function requestSetPlaybackWakeLock() {
  if (!navigator.wakeLock || setPlaybackWakeLock || document.fullscreenElement !== setPlayer) return;
  try {
    setPlaybackWakeLock = await navigator.wakeLock.request('screen');
    setPlaybackWakeLock.addEventListener?.('release', () => { setPlaybackWakeLock = null; });
  } catch { setPlaybackWakeLock = null; }
}
async function releaseSetPlaybackWakeLock() {
  if (!setPlaybackWakeLock) return;
  const lock = setPlaybackWakeLock;
  setPlaybackWakeLock = null;
  try { await lock.release(); } catch {}
}
function toggleSetPlayback() {
  const video = setPlayerStage.querySelector('video.set-player-current');
  if (video) {
    if (video.paused) video.play().catch(() => {}); else video.pause();
    if (video.paused) revealTheatreControls({ schedule: false }); else scheduleTheatreControls();
    return;
  }
  try {
    if (activeYoutubePlayer?.getPlayerState?.() === 1) { activeYoutubePlayer.pauseVideo(); revealTheatreControls({ schedule: false }); }
    else { activeYoutubePlayer?.playVideo?.(); scheduleTheatreControls(); }
  } catch {}
}
function toggleSetMute() {
  const video = setPlayerStage.querySelector('video.set-player-current');
  if (video) { video.muted = !video.muted; setPlayerStatus.textContent = video.muted ? 'Muted' : 'Sound on'; return; }
  try {
    if (activeYoutubePlayer?.isMuted?.()) { activeYoutubePlayer.unMute(); setPlayerStatus.textContent = 'Sound on'; }
    else { activeYoutubePlayer?.mute?.(); setPlayerStatus.textContent = 'Muted'; }
  } catch {}
}
function playbackBounds(source, duration = 0) {
  const media = source?.media || source;
  const clip = source?.clip || null;
  const requestedStart = Math.max(0, Number(clip?.startSeconds ?? media?.playbackStart) || 0);
  const requestedEnd = Number(clip?.endSeconds ?? media?.playbackEnd);
  const naturalEnd = Number(duration) > 0 ? Number(duration) : null;
  const start = naturalEnd ? Math.min(requestedStart, naturalEnd) : requestedStart;
  const end = Number.isFinite(requestedEnd) && requestedEnd > start ? (naturalEnd ? Math.min(requestedEnd, naturalEnd) : requestedEnd) : naturalEnd;
  return { start, end, length: end && end > start ? end - start : null };
}
function playbackFraction(source, current, duration) {
  const bounds = playbackBounds(source, duration);
  if (!bounds.length) return duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
  return Math.max(0, Math.min(1, (current - bounds.start) / bounds.length));
}
function playbackTimeAt(source, fraction, duration) {
  const bounds = playbackBounds(source, duration);
  const bounded = Math.max(0, Math.min(1, Number(fraction) || 0));
  if (bounds.length) return bounds.start + (bounds.length * bounded);
  return bounds.end !== null ? bounds.start + (Math.max(0, bounds.end - bounds.start) * bounded) : bounds.start;
}
function savePlaybackResume(gig, fraction) {
  if (!gig || !setQueue[setQueueIndex]?.media || Date.now() - resumeSaveAt < 1000) return;
  resumeSaveAt = Date.now();
  const entry = setQueue[setQueueIndex];
  try { localStorage.setItem(playbackResumeKey(gig.id), JSON.stringify({ entryKey: setQueueEntryKey(entry), songIndex: entry.songIndex, mediaId: entry.media.id, fraction: Math.max(0, Math.min(1, fraction)), savedAt: Date.now() })); } catch {}
}
function readPlaybackResume(gig) {
  try {
    const saved = JSON.parse(localStorage.getItem(playbackResumeKey(gig.id)) || 'null');
    if (!saved || Date.now() - Number(saved.savedAt || 0) > 1000 * 60 * 60 * 24 * 30 || Number(saved.fraction) >= .98) return null;
    const index = setQueue.findIndex((entry) => (saved.entryKey ? setQueueEntryKey(entry) === saved.entryKey : entry.songIndex === Number(saved.songIndex)) && (entry.sources || []).some((source) => source.media?.id === saved.mediaId));
    if (index < 0) return null;
    const sourceIndex = setQueue[index].sources.findIndex((source) => source.media?.id === saved.mediaId);
    return { index, sourceIndex: Math.max(0, sourceIndex), fraction: Math.max(0, Math.min(1, Number(saved.fraction) || 0)) };
  } catch { return null; }
}
function clearPlaybackResume(gig) { try { localStorage.removeItem(playbackResumeKey(gig.id)); } catch {} }
function validChapterStart(song) {
  if (song?.startSeconds === null || song?.startSeconds === undefined || song?.startSeconds === '') return null;
  const value = Number(song.startSeconds);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function playbackPlanLengths(gig) {
  const lengths = setQueue.map((entry, index) => {
    const bounds = playbackBounds(entry);
    if (bounds.length) return bounds.length;
    const nextSameSource = entry.media ? setQueue.slice(index + 1).find((candidate) => candidate.media?.id === entry.media.id && playbackBounds(candidate).start > bounds.start) : null;
    if (nextSameSource) return playbackBounds(nextSameSource).start - bounds.start;
    const chapterStart = entry.isUnknown ? null : validChapterStart(gig.songs[entry.songIndex]);
    const nextEntry = index < setQueue.length - 1 ? setQueue[index + 1] : null;
    const nextChapterStart = nextEntry && !nextEntry.isUnknown ? validChapterStart(gig.songs[nextEntry.songIndex]) : null;
    return chapterStart !== null && nextChapterStart !== null && nextChapterStart > chapterStart ? nextChapterStart - chapterStart : null;
  });
  const known = lengths.filter((length) => Number.isFinite(length) && length > 0).sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 180;
  return lengths.map((length) => Number.isFinite(length) && length > 0 ? length : fallback);
}
function playbackTimelineModel(gig) {
  const count = setQueue.length;
  if (!count) return [];
  const lengths = playbackPlanLengths(gig);
  const total = lengths.reduce((sum, length) => sum + length, 0) || count;
  let elapsed = 0;
  return setQueue.map((entry, index) => {
    const start = elapsed / total;
    elapsed += lengths[index];
    const end = index === count - 1 ? 1 : elapsed / total;
    return { entry, index, marker: start, start, end };
  });
}
function focusedPlaybackTimelineModel(gig) {
  const full = playbackTimelineModel(gig);
  if (setTimelineZoom === 'all' || full.length <= Number(setTimelineZoom)) return full;
  const visible = Math.max(1, Number(setTimelineZoom) || 3);
  const startIndex = Math.max(0, Math.min(full.length - visible, setQueueIndex - Math.floor(visible / 2)));
  const window = full.slice(startIndex, startIndex + visible);
  const rangeStart = window[0].start;
  const rangeEnd = window[window.length - 1].end;
  const range = rangeEnd - rangeStart || 1;
  return window.map((item, localIndex) => ({
    ...item,
    marker: (item.start - rangeStart) / range,
    start: (item.start - rangeStart) / range,
    end: (item.end - rangeStart) / range
  }));
}
function setTimelineProgress(gig, mediaFraction = 0, currentSeconds = 0, durationSeconds = 0) {
  const fullSegment = playbackTimelineModel(gig)[setQueueIndex];
  const segment = focusedPlaybackTimelineModel(gig).find((item) => item.index === setQueueIndex);
  if (!fullSegment || !segment) return;
  const fraction = Math.max(0, Math.min(1, Number(mediaFraction) || 0));
  setPlayerProgress.style.width = `${(segment.start + ((segment.end - segment.start) * fraction)) * 100}%`;
  setPlayerOverviewProgress.style.width = `${(fullSegment.start + ((fullSegment.end - fullSegment.start) * fraction)) * 100}%`;
  const bounds = playbackBounds(segment.entry, durationSeconds);
  setPlayerElapsed.textContent = formatPlaybackTime(Math.max(0, (currentSeconds || 0) - bounds.start));
  setPlayerTotal.textContent = bounds.length ? formatPlaybackTime(bounds.length) : '--:--';
}
function renderSetTimeline(gig) {
  const fullModel = playbackTimelineModel(gig);
  const model = focusedPlaybackTimelineModel(gig);
  setPlayerOverviewMarkers.innerHTML = fullModel.map(({ entry, index, marker }) => { const title = setQueueEntryTitle(gig, entry); return `<button class="set-overview-marker${index === setQueueIndex ? ' active' : ''}${entry.media ? '' : ' is-gap'}${entry.isUnknown ? ' is-unknown' : ''}${marker <= 0 ? ' marker-first' : ''}${marker >= .999999 ? ' marker-last' : ''}" type="button" style="left:${marker * 100}%" title="${escapeHtml(title)}${entry.media ? '' : ' · no video'}" aria-label="Play ${escapeHtml(title)}"></button>`; }).join('');
  setPlayerMarkers.innerHTML = model.map(({ entry, index, marker }) => { const title = setQueueEntryTitle(gig, entry); const label = entry.isUnknown ? title : `${entry.songIndex + 1} · ${title}`; return `<button class="set-marker${index === setQueueIndex ? ' active' : ''}${entry.media ? '' : ' is-gap'}${entry.isUnknown ? ' is-unknown' : ''}${marker <= 0 ? ' marker-first' : ''}${marker >= .999999 ? ' marker-last' : ''}" type="button" style="left:${marker * 100}%" title="${escapeHtml(title)}${entry.media ? '' : ' · no video'}" aria-label="${entry.media ? 'Play' : 'Skip to next video after'} ${escapeHtml(title)}"><span class="set-marker-label">${escapeHtml(label)}</span></button>`; }).join('');
  setPlayerOverviewMarkers.querySelectorAll('.set-overview-marker').forEach((marker, index) => marker.addEventListener('click', (event) => { event.stopPropagation(); setQueueIndex = index; pendingSetSeek = { index, fraction: 0 }; playSetTrack(); }));
  setPlayerMarkers.querySelectorAll('.set-marker').forEach((marker, localIndex) => marker.addEventListener('click', (event) => { event.stopPropagation(); const index = model[localIndex].index; setQueueIndex = index; pendingSetSeek = { index, fraction: 0 }; playSetTrack(); }));
  setPlayer.dataset.timelineZoom = String(setTimelineZoom);
  setTimelineProgress(gig, 0);
}
function applySetSeek(gig, fraction) {
  const bounded = Math.max(0, Math.min(1, Number(fraction) || 0));
  const entry = setQueue[setQueueIndex];
  if (!entry?.media) return;
  const video = setPlayerStage.querySelector('video.set-player-current, video:not(.set-player-preload)');
  if (video) {
    const seek = () => { if (Number.isFinite(video.duration) && video.duration > 0) { video.currentTime = playbackTimeAt(entry, bounded, video.duration); pendingSetSeek = null; setTimelineProgress(gig, bounded, video.currentTime, video.duration); } };
    if (video.readyState >= 1) seek(); else video.addEventListener('loadedmetadata', seek, { once: true });
    return;
  }
  if (activeYoutubePlayer?.seekTo && activeYoutubePlayer.getDuration) {
    const duration = Number(activeYoutubePlayer.getDuration()) || 0;
    if (duration > 0) { const time = playbackTimeAt(entry, bounded, duration); activeYoutubePlayer.seekTo(time, true); pendingSetSeek = null; setTimelineProgress(gig, bounded, time, duration); }
  }
}
function seekSetTimeline(ratio, useFullTimeline = false) {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  const model = gig ? (useFullTimeline ? playbackTimelineModel(gig) : focusedPlaybackTimelineModel(gig)) : [];
  if (!model.length) return;
  const bounded = Math.max(0, Math.min(1, ratio));
  let segment = model.find((item) => bounded <= item.end) || model[model.length - 1];
  if (!segment.entry.media) { const localIndex = model.indexOf(segment); segment = model.slice(localIndex).find((item) => item.entry.media) || [...model.slice(0, localIndex)].reverse().find((item) => item.entry.media) || segment; }
  const fraction = segment.end > segment.start ? (bounded - segment.start) / (segment.end - segment.start) : 0;
  const changedTrack = segment.index !== setQueueIndex;
  setQueueIndex = segment.index;
  pendingSetSeek = { index: segment.index, fraction: Math.max(0, Math.min(1, fraction)) };
  setPlayerProgress.style.width = `${bounded * 100}%`;
  if (changedTrack) playSetTrack(); else applySetSeek(gig, pendingSetSeek.fraction);
}
let timelinePointer = null;
const timelinePointerRatio = (event) => {
  const rect = setPlayerTimeline.getBoundingClientRect();
  if (!rect.width) return 0;
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
};
setPlayerOverview?.addEventListener('pointerup', (event) => {
  if (event.target.closest('.set-overview-marker') || !setQueue.length) return;
  const rect = setPlayerOverview.getBoundingClientRect();
  if (!rect.width) return;
  seekSetTimeline(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), true);
});
setTimelineMedia.addEventListener?.('change', (event) => {
  setTimelineZoom = event.matches ? 3 : 5;
  const gig = gigs.find((entry) => entry.id === showDetailId);
  if (gig && setQueue.length) renderSetTimeline(gig);
});
setPlayerTimeline?.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.set-marker') || event.button !== 0) return;
  timelinePointer = { id: event.pointerId, x: event.clientX, y: event.clientY, scrubbing: false };
});
setPlayerTimeline?.addEventListener('pointermove', (event) => {
  if (!timelinePointer || timelinePointer.id !== event.pointerId) return;
  const dx = Math.abs(event.clientX - timelinePointer.x);
  const dy = Math.abs(event.clientY - timelinePointer.y);
  if (!timelinePointer.scrubbing && dx >= 8 && dx > dy) {
    timelinePointer.scrubbing = true;
    setPlayerTimeline.classList.add('is-scrubbing');
    setPlayerTimeline.setPointerCapture?.(event.pointerId);
  }
  if (!timelinePointer.scrubbing) return;
  setPlayerProgress.style.width = `${timelinePointerRatio(event) * 100}%`;
});
setPlayerTimeline?.addEventListener('pointerup', (event) => {
  if (!timelinePointer || timelinePointer.id !== event.pointerId) return;
  const pointer = timelinePointer;
  timelinePointer = null;
  setPlayerTimeline.classList.remove('is-scrubbing');
  if (pointer.scrubbing) setPlayerTimeline.releasePointerCapture?.(event.pointerId);
  else if (Math.abs(event.clientY - pointer.y) > 10) return;
  seekSetTimeline(timelinePointerRatio(event));
});
setPlayerTimeline?.addEventListener('pointercancel', () => {
  timelinePointer = null;
  setPlayerTimeline.classList.remove('is-scrubbing');
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

const duplicateKey = (value) => String(value || '').trim().toLocaleLowerCase();

function findDuplicateShows(values, excludeId = '') {
  const artist = duplicateKey(values.artist); const venue = duplicateKey(values.venue); const city = duplicateKey(values.city); const date = String(values.date || '').trim();
  if (!artist || !venue) return [];
  const localReferences = new Set(gigs.flatMap((gig) => [gig.id, gig.sharedId].filter(Boolean)));
  const candidates = [
    ...gigs.filter((gig) => gig.id !== excludeId).map((gig) => ({ ...gig, duplicateSource: 'Your archive' })),
    ...sharedShows.filter((show) => !localReferences.has(show.id) && !localReferences.has(show.sourceGigId)).map((show) => ({ ...show, duplicateSource: 'Shared by a peer' }))
  ];
  return candidates.filter((gig) => duplicateKey(gig.artist) === artist && duplicateKey(gig.venue) === venue && (!city || !gig.city || duplicateKey(gig.city) === city) && String(gig.date || '').trim() === date);
}

function showDuplicateWarning(container, values, excludeId = '') {
  if (!container) return [];
  const matches = findDuplicateShows(values, excludeId);
  container.hidden = !matches.length;
  container.innerHTML = matches.length ? `<strong>Possible duplicate show</strong><p>${matches.length} matching ${matches.length === 1 ? 'entry already exists' : 'entries already exist'} for this artist, venue and date.</p>${matches.map((gig) => `<a href="${gig.duplicateSource === 'Your archive' ? `/show?id=${encodeURIComponent(gig.id)}` : '/shows'}"><span>${escapeHtml(gig.artist)}</span><small>${escapeHtml(gig.venue)} · ${escapeHtml(gig.city || '')} · ${escapeHtml(formatGigDate(gig.date))} · ${escapeHtml(gig.duplicateSource)}</small></a>`).join('')}` : '';
  return matches;
}

function confirmDuplicateSave(container, values, excludeId = '') {
  const matches = showDuplicateWarning(container, values, excludeId);
  return !matches.length || window.confirm(`${matches.length} matching show ${matches.length === 1 ? 'already exists' : 'entries already exist'}. Save another copy anyway?`);
}

['artist', 'venue', 'city', 'date'].forEach((name) => {
  form.elements[name]?.addEventListener('input', () => showDuplicateWarning(addDuplicateWarning, formValues()));
  editForm?.elements[name]?.addEventListener('input', () => showDuplicateWarning(editDuplicateWarning, Object.fromEntries(new FormData(editForm).entries()), editGigId));
});

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

function renderPeerNotifications(notifications) {
  const list = notificationPanel.querySelector('.peer-notification-list');
  notificationPanel.hidden = !notifications.length;
  list.innerHTML = notifications.map((notification) => `<article class="peer-notification" data-notification-id="${escapeHtml(notification.id)}"><a href="/shows#shared-${encodeURIComponent(notification.sharedGigId || '')}"><strong>${escapeHtml(notification.title)}</strong><span>${escapeHtml(notification.body || '')}</span></a><button type="button" aria-label="Dismiss notification">×</button></article>`).join('');
  list.querySelectorAll('.peer-notification').forEach((item) => {
    const markRead = () => fetchJson(`/api/notifications/${encodeURIComponent(item.dataset.notificationId)}`, { method: 'PATCH' }).catch(() => {});
    item.querySelector('a').addEventListener('click', async (event) => { event.preventDefault(); await markRead(); window.location.assign(event.currentTarget.href); });
    item.querySelector('button').addEventListener('click', async () => { await markRead(); item.remove(); notificationPanel.hidden = !list.children.length; });
  });
}

async function loadPeerNotifications() {
  if (!account) return [];
  try {
    const notifications = await fetchJson('/api/notifications');
    renderPeerNotifications(notifications);
    return notifications;
  } catch { return []; /* Authentication state is handled by the next page load. */ }
}

async function pollConnectedPeers() {
  if (!account || peerPollRunning) return;
  peerPollRunning = true;
  try {
    const result = await fetchJson('/api/peers/sync-all', { method: 'POST' });
    const notifications = await loadPeerNotifications();
    if (result.applied > 0 || notifications.length) {
      const [gigData, showData] = await Promise.all([fetchJson('/api/gigs'), fetchJson('/api/shared/shows')]);
      gigs = gigData;
      sharedShows = showData;
      populateYearFilter();
      renderGigs();
    }
  } catch { /* A disconnected peer should not interrupt normal app use. */ }
  finally {
    peerPollRunning = false;
    clearTimeout(peerPollTimer);
    peerPollTimer = setTimeout(pollConnectedPeers, 30_000);
  }
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
    peers = instance.peers || [];
    peerList.innerHTML = peers.length ? peers.map((peer) => `<article class="peer-card" data-peer-id="${escapeHtml(peer.id)}"><div class="peer-card-copy"><strong>${escapeHtml(peer.name)}</strong><small>${escapeHtml(peer.baseUrl || 'Direct relay/VPN connection not configured')}</small><span class="peer-status peer-status-${escapeHtml(peer.status || 'paired')}">${escapeHtml(peer.status || 'paired')}${peer.lastSeenAt ? ` · seen ${escapeHtml(new Date(peer.lastSeenAt).toLocaleString())}` : ''}</span></div><div class="peer-actions"><button type="button" class="peer-test" ${peer.baseUrl ? '' : 'disabled'}>Test</button><button type="button" class="peer-sync" ${peer.baseUrl ? '' : 'disabled'}>Sync now</button><button type="button" class="peer-remove">Remove</button></div></article>`).join('') : '<p class="shared-message">No paired instances yet.</p>';
    peerList.querySelectorAll('.peer-test, .peer-sync').forEach((button) => button.addEventListener('click', async () => {
      const card = button.closest('.peer-card');
      const action = button.classList.contains('peer-sync') ? 'sync' : 'test';
      button.disabled = true;
      const original = button.textContent;
      button.textContent = action === 'sync' ? 'Syncing…' : 'Testing…';
      try {
        const result = await fetchJson(`/api/peers/${encodeURIComponent(card.dataset.peerId)}/${action}`, { method: 'POST' });
        peerMessage.textContent = action === 'sync' ? `Sync complete · sent ${result.sent}, received ${result.received}, applied ${result.applied}.` : `Connected to ${result.name}.`;
        peerMessage.classList.remove('error');
        if (action === 'sync') {
          gigs = await fetchJson('/api/gigs');
          populateYearFilter();
          renderGigs();
          await refreshCollaboration();
          await loadPeerNotifications();
        }
        await renderInstanceSettings();
      } catch (error) { peerMessage.textContent = error.message; peerMessage.classList.add('error'); await renderInstanceSettings(); }
      finally { button.disabled = false; button.textContent = original; }
    }));
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
async function uploadGigMediaNow(gigId, files, onProgress = () => {}, category = 'show') {
  if (!crypto.randomUUID) Object.defineProperty(crypto, 'randomUUID', { value: () => `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  const queue = [...files];
  const uploadPath = category === 'artifact' ? `/api/gigs/${gigId}/artifacts` : `/api/gigs/${gigId}/media`;
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
          const response = await fetch(`${uploadPath}/chunk`, { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': file.type, 'X-Upload-Id': uploadId, 'X-Upload-Offset': String(offset), 'X-Upload-Total': String(file.size), 'X-Media-Filename': encodeURIComponent(file.name), 'X-Media-Category': category }, body: chunk });
          const body = await response.json().catch(() => ({}));
          if (response.status === 409 && Number.isFinite(Number(body.offset))) { offset = Math.max(0, Math.min(file.size, Number(body.offset))); continue; }
          if (!response.ok) throw new Error(body.error || `Chunk failed (HTTP ${response.status})`);
          if (body.complete && category === 'artifact' && body.media?.category !== 'artifact') throw new Error('The server did not save this as an artifact. Restart the server and retry.');
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
          xhr.open('POST', uploadPath);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.setRequestHeader('X-Media-Filename', encodeURIComponent(file.name));
          xhr.setRequestHeader('X-Media-Caption', encodeURIComponent(file.name));
          xhr.setRequestHeader('X-Media-Category', category);
          xhr.upload.onprogress = (event) => { if (event.lengthComputable) { updateJob(jobId, { progress: (event.loaded / event.total) * 100 }); onProgress(file, event.loaded / event.total); } };
          xhr.onload = () => { let body = {}; try { body = JSON.parse(xhr.responseText); } catch {} if (xhr.status >= 200 && xhr.status < 300) { if (category === 'artifact' && body.media?.category !== 'artifact' && body.category !== 'artifact') return reject(new Error('The server did not save this as an artifact. Restart the server and retry.')); updateJob(jobId, { status: 'complete', progress: 100 }); resolve(body); } else reject(new Error(body.error || 'Media upload failed.')); };
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
function uploadGigMedia(gigId, files, onProgress = () => {}, category = 'show') {
  if (!isMobileUpload) return uploadGigMediaNow(gigId, files, onProgress, category);
  const previous = mobileUploadChains.get(gigId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => uploadGigMediaNow(gigId, files, onProgress, category));
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

function youtubeEmbedUrl(url, { autoplay = false } = {}) {
  try {
    const parsed = new URL(url);
    const id = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&autoplay=${autoplay ? 1 : 0}&origin=${encodeURIComponent(window.location.origin)}` : url;
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

function renderMediaGallery(container, media = [], { editable = false, songs = [], allowCover = true, onDelete = () => {}, afterRender = () => {} } = {}) {
  container.replaceChildren();
  if (!media.length) { afterRender(container, media); return; }
      const redraw = () => renderMediaGallery(container, media, { editable, songs, allowCover, onDelete, afterRender });
      for (const id of [...selectedMediaIds]) if (!media.some((item) => item.id === id)) selectedMediaIds.delete(id);
      const selectedCount = media.filter((item) => selectedMediaIds.has(item.id)).length;
      container.innerHTML = `${editable && selectedCount ? `<div class="media-bulk-actions"><span>${selectedCount} selected</span><button type="button" class="media-bulk-delete">Remove selected</button><button type="button" class="media-bulk-clear">Clear</button></div>` : ''}${media.map((item, index) => `<figure class="media-item${item.isCover ? ' is-cover' : ''}${item.useBackgroundRemoved ? ' is-cutout' : ''}${selectedMediaIds.has(item.id) ? ' is-selected' : ''}" data-media-id="${item.id}">${editable ? `<button type="button" class="media-delete-corner" aria-label="${selectedMediaIds.has(item.id) ? 'Deselect media' : 'Select media for removal'}" title="${selectedMediaIds.has(item.id) ? 'Deselect media' : 'Select media for removal'}" aria-pressed="${selectedMediaIds.has(item.id)}">×</button>` : ''}${item.mimeType === 'video/youtube' ? `<iframe src="${youtubeEmbedUrl(item.url)}" title="${escapeHtml(item.caption || 'YouTube video')}" loading="lazy" allowfullscreen></iframe>` : item.mimeType.startsWith('video/') ? `<video src="${item.url}" controls preload="${isMobileUpload ? 'none' : 'metadata'}"></video>` : `<button class="media-open" type="button"><img src="${item.url}" alt="${escapeHtml(item.caption || 'Photo from the show')}" loading="lazy" style="transform:rotate(${item.rotation || 0}deg)" /></button>`}<figcaption>${escapeHtml(item.caption || item.filename || '')}</figcaption>${item.backgroundStatus === 'running' ? '<small class="media-background-status">Removing background…</small>' : item.backgroundStatus === 'error' ? `<small class="media-background-status media-detection-error">${escapeHtml(item.backgroundError || 'Background removal failed')}</small>` : item.useBackgroundRemoved ? '<small class="media-background-status">Transparent cutout</small>' : ''}${mediaRecognitionMarkup(item, songs)}${editable ? `<div class="media-actions"><button type="button" class="media-menu-toggle" aria-expanded="false">⋮ Options</button><div class="media-action-menu" hidden>${songs.length && item.category !== 'artifact' ? `<label class="media-song-label">Setlist track${item.recognitionOverride ? ' · manual override' : ''}<select class="media-song-select"><option value="">Unassigned</option>${songs.map((song, songIndex) => `<option value="${songIndex}" ${item.songIndex === songIndex ? 'selected' : ''}>${songIndex + 1}. ${escapeHtml(song.title)}</option>`).join('')}</select></label>` : ''}<button class="media-caption" type="button">Caption</button>${allowCover && item.category !== 'artifact' ? `<button type="button" class="media-cover">${item.isCover ? 'Cover photo' : 'Make cover'}</button>` : ''}${item.category === 'artifact' && item.mimeType.startsWith('image/') ? `${item.backgroundFilename ? `<button type="button" class="media-background-toggle">${item.useBackgroundRemoved ? 'Use original photo' : 'Use transparent cutout'}</button>` : ''}<button type="button" class="media-background-remove" ${item.backgroundStatus === 'running' ? 'disabled' : ''}>${item.backgroundFilename ? 'Recreate cutout' : item.backgroundStatus === 'error' ? 'Retry background removal' : 'Remove background'}</button>` : ''}${item.mimeType.startsWith('video/') && item.mimeType !== 'video/youtube' ? '<button type="button" class="media-trim">Trim video</button><button type="button" class="media-rotate media-rotate-cw">↻ Clockwise</button><button type="button" class="media-rotate media-rotate-ccw">↺ Counter-clockwise</button>' : ''}<button type="button" class="media-up" ${index === 0 ? 'disabled' : ''}>↑ Move earlier</button><button type="button" class="media-down" ${index === media.length - 1 ? 'disabled' : ''}>↓ Move later</button></div></div>` : ''}</figure>`).join('')}`;
  container.querySelectorAll('.media-open').forEach((button, index) => button.addEventListener('click', () => openMediaLightbox(media[index])));
  if (editable) {
    container.querySelectorAll('.media-delete-corner').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      if (!item) return;
      if (selectedMediaIds.has(item.id)) selectedMediaIds.delete(item.id); else selectedMediaIds.add(item.id);
      redraw();
    }));
    container.querySelector('.media-bulk-clear')?.addEventListener('click', () => { selectedMediaIds.clear(); redraw(); });
    container.querySelector('.media-bulk-delete')?.addEventListener('click', async (event) => {
      const selected = media.filter((item) => selectedMediaIds.has(item.id));
      if (!selected.length || !confirm(`Remove ${selected.length} selected media item${selected.length === 1 ? '' : 's'}?`)) return;
      event.currentTarget.disabled = true;
      try {
        await Promise.all(selected.map((item) => fetchJson(`/api/media/${item.id}`, { method: 'DELETE' })));
        selected.forEach((item) => { selectedMediaIds.delete(item.id); media.splice(media.indexOf(item), 1); });
        onDelete(selected);
        redraw();
      } catch (error) { event.currentTarget.disabled = false; event.currentTarget.textContent = error.message; }
    });
    container.querySelectorAll('.media-song-select').forEach((select) => select.addEventListener('change', async () => {
      const item = media.find((entry) => entry.id === select.closest('.media-item').dataset.mediaId);
      const value = select.value === '' ? null : Number(select.value);
      await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songIndex: value, recognitionOverride: true }) });
      item.songIndex = value;
      item.recognitionOverride = true;
      redraw();
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
      item.caption = caption; redraw();
    }));
    container.querySelectorAll('.media-background-toggle').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      const updated = await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useBackgroundRemoved: !item.useBackgroundRemoved }) });
      Object.assign(item, updated);
      redraw();
    }));
    container.querySelectorAll('.media-background-remove').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      button.disabled = true;
      try {
        const job = await fetchJson(`/api/media/${item.id}/remove-background`, { method: 'POST' });
        item.backgroundStatus = 'running';
        updateJob(job.jobId, { id: job.jobId, type: 'Remove background', name: item.caption || item.filename, status: 'running', progress: 10 });
        let status;
        do {
          await new Promise((resolve) => setTimeout(resolve, 900));
          status = await fetchJson(`/api/jobs/${job.jobId}`);
          updateJob(job.jobId, status);
        } while (status.status === 'running' || status.status === 'queued');
        if (status.status === 'error') throw new Error(status.error || 'Background removal failed.');
        item.backgroundStatus = 'complete';
        item.backgroundFilename = `${item.id}.cutout.png`;
        item.backgroundError = '';
        item.useBackgroundRemoved = true;
        item.url = `/api/media/${item.id}?variant=cutout&v=${Date.now()}`;
      } catch (error) {
        item.backgroundStatus = 'error'; item.backgroundError = error.message;
      }
      redraw();
    }));
    container.querySelectorAll('.media-cover').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isCover: true }) });
      media.forEach((entry) => { entry.isCover = entry.id === item.id; }); redraw();
    }));
    container.querySelectorAll('.media-trim').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      const start = prompt('Trim start time in seconds', '0'); if (start === null) return;
      const end = prompt('Trim end time in seconds', ''); if (end === null || end === '' || Number(end) <= Number(start)) return;
      button.disabled = true; button.textContent = 'Trimming…';
      try { const job = await fetchJson(`/api/media/${item.id}/trim?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { method: 'POST' }); let status; do { await new Promise((resolve) => setTimeout(resolve, 1000)); status = await fetchJson(`/api/media/rotate/${job.jobId}`); button.textContent = `Trimming ${status.progress}%`; } while (status.status === 'running'); if (status.status === 'error') throw new Error(status.error || 'Video trim failed.'); redraw(); } catch (error) { button.textContent = error.message; } finally { button.disabled = false; }
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
      redraw();
    }));
    container.querySelectorAll('.media-up, .media-down').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      const index = media.indexOf(item); const nextIndex = button.classList.contains('media-up') ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= media.length) return;
      [media[index], media[nextIndex]] = [media[nextIndex], media[index]];
      await Promise.all(media.map((entry, order) => fetchJson(`/api/media/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: order }) })));
      redraw();
    }));
  }
  afterRender(container, media);
}

let mediaWorkspaceFilter = 'all';
let activeEditGig = null;

function mediaWorkspaceState(item) {
  const uploadedVideo = String(item.mimeType || '').startsWith('video/') && item.mimeType !== 'video/youtube';
  if (item.originalExists === false) return { key: 'failed', label: 'Missing original', detail: 'The database entry exists, but its file is missing from disk.' };
  if (item.backgroundStatus === 'error' || item.recognitionStatus === 'error' || (uploadedVideo && ['error', 'not_started'].includes(item.playbackStatus))) return { key: 'failed', label: 'Needs attention', detail: item.backgroundError || item.recognitionError || item.playbackError || 'A mobile playback copy still needs to be created.' };
  if (item.backgroundStatus === 'running') return { key: 'processing', label: 'Removing background', detail: 'Creating a transparent artifact cutout.' };
  if (item.recognitionStatus === 'running') return { key: 'processing', label: 'Detecting track', detail: item.playbackStatus === 'encoding' ? 'Track detection and playback encoding are running.' : 'Listening for a matching setlist track.' };
  if (item.recognitionStatus === 'queued') return { key: 'processing', label: 'Detection queued', detail: item.playbackStatus === 'encoding' ? 'Playback encoding is also running.' : 'Waiting to identify the track.' };
  if (uploadedVideo && item.playbackStatus === 'encoding') return { key: 'processing', label: 'Encoding playback', detail: 'Creating the mobile-friendly H.264 playback copy.' };
  if (String(item.mimeType || '').startsWith('video/') && item.category !== 'artifact' && (item.songIndex === null || item.songIndex === undefined)) return { key: 'unassigned', label: 'Unassigned', detail: 'Choose the matching setlist track.' };
  return { key: 'ready', label: 'Ready', detail: item.playbackStatus === 'ready' ? 'Original and playback copy are available.' : 'Available in the show memory.' };
}

function applyMediaWorkspaceFilter() {
  if (!editGallery || !mediaWorkspaceEmpty) return;
  let visible = 0;
  editGallery.querySelectorAll('.media-item').forEach((card) => {
    const show = mediaWorkspaceFilter === 'all' || card.dataset.processingState === mediaWorkspaceFilter;
    card.hidden = !show;
    if (show) visible += 1;
  });
  mediaWorkspaceEmpty.hidden = visible > 0;
  mediaWorkspaceFilters?.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.mediaFilter === mediaWorkspaceFilter));
}

async function refreshEditMediaWorkspace(gig = activeEditGig) {
  if (!gig) return;
  const refreshed = await fetchJson(`/api/gigs/${gig.id}/media`);
  gig.media = refreshed;
  renderEditMediaWorkspace(gig, refreshed);
}

function decorateMediaWorkspace(container, media, gig) {
  const states = media.map((item) => mediaWorkspaceState(item));
  const totals = { all: media.length, processing: 0, failed: 0, unassigned: 0, ready: 0 };
  states.forEach((state) => { totals[state.key] += 1; });
  mediaWorkspaceStats.innerHTML = `<span><b>${totals.all}</b>Total</span><span><b>${totals.processing}</b>Processing</span><span><b>${totals.failed}</b>Needs attention</span><span><b>${totals.unassigned}</b>Unassigned</span><span><b>${totals.ready}</b>Ready</span>`;
  container.querySelectorAll('.media-item').forEach((card) => {
    const item = media.find((entry) => entry.id === card.dataset.mediaId);
    if (!item) return;
    const state = mediaWorkspaceState(item);
    card.dataset.processingState = state.key;
    const health = document.createElement('div');
    health.className = `media-processing-state is-${state.key}`;
    const sizeLine = item.mimeType === 'video/youtube' ? 'YouTube embed' : `${formatUploadSize(item.size || 0)} original${item.playbackSize ? ` · ${formatUploadSize(item.playbackSize)} playback` : ''}`;
    health.innerHTML = `<div><span class="media-processing-badge">${escapeHtml(state.label)}</span><small>${escapeHtml(sizeLine)}</small></div><p>${escapeHtml(state.detail)}</p><div class="media-processing-actions"></div>`;
    const actions = health.querySelector('.media-processing-actions');
    const uploadedVideo = String(item.mimeType || '').startsWith('video/') && item.mimeType !== 'video/youtube';
    if (uploadedVideo && item.originalExists !== false && ['error', 'not_started'].includes(item.playbackStatus)) {
      const retryEncode = document.createElement('button');
      retryEncode.type = 'button'; retryEncode.textContent = item.playbackStatus === 'not_started' ? 'Create playback copy' : 'Retry playback copy';
      retryEncode.addEventListener('click', async () => {
        retryEncode.disabled = true; retryEncode.textContent = 'Queued…';
        try {
          const job = await fetchJson(`/api/media/${item.id}/retry-encode`, { method: 'POST' });
          updateJob(job.jobId, { id: job.jobId, type: 'Encode video', name: item.caption || item.filename, status: 'running', progress: 1 });
          let status;
          do { await new Promise((resolve) => setTimeout(resolve, 1000)); status = await fetchJson(`/api/jobs/${job.jobId}`); updateJob(job.jobId, status); } while (['queued', 'running'].includes(status.status));
          if (status.status === 'error') throw new Error(status.error || 'Playback encoding failed.');
          await refreshEditMediaWorkspace(gig);
        } catch (error) { retryEncode.disabled = false; retryEncode.textContent = error.message; }
      });
      actions.append(retryEncode);
    }
    if (uploadedVideo && item.originalExists !== false && !['queued', 'running'].includes(item.recognitionStatus)) {
      const detectRecognition = document.createElement('button');
      const detectionLabel = item.recognitionStatus === 'error' ? 'Retry audio detection' : item.recognitionTitle ? 'Detect audio again' : 'Detect audio';
      detectRecognition.type = 'button'; detectRecognition.textContent = detectionLabel;
      detectRecognition.addEventListener('click', async () => {
        detectRecognition.disabled = true; detectRecognition.textContent = 'Detecting…';
        try {
          await fetchJson(`/api/media/${item.id}/retry-recognition`, { method: 'POST' });
          await pollMediaRecognition(gig.id, (refreshed) => { gig.media = refreshed; renderEditMediaWorkspace(gig, refreshed); });
        } catch (error) { detectRecognition.disabled = false; detectRecognition.textContent = error.message; }
      });
      actions.append(detectRecognition);
    }
    if (!actions.childElementCount) actions.remove();
    card.querySelector('figcaption')?.insertAdjacentElement('afterend', health);
  });
  applyMediaWorkspaceFilter();
}

function renderEditMediaWorkspace(gig, media = []) {
  if (!editGallery || !mediaWorkspaceStats) return;
  activeEditGig = gig;
  gig.media = media;
  renderMediaGallery(editGallery, media, {
    editable: true,
    songs: gig.songs || [],
    onDelete: (removed) => { const ids = new Set(removed.map((item) => item.id)); gig.media = gig.media.filter((item) => !ids.has(item.id)); },
    afterRender: (container, current) => { decorateMediaWorkspace(container, current, gig); renderPlaybackEditor(gig); }
  });
}

function playbackSourceLabel(item) {
  const type = item.mimeType === 'video/youtube' ? 'YouTube' : 'Upload';
  return `${type} · ${item.caption || item.filename || 'Untitled video'}`;
}

function playbackCandidates(gig, songIndex) {
  return (gig.media || []).filter((item) => item.category !== 'artifact' && String(item.mimeType || '').startsWith('video/'));
}

function playbackClipFor(item, songIndex) {
  return (item?.playbackClips || []).filter((clip) => clip.songIndex === songIndex).sort((a, b) => (a.priority || 0) - (b.priority || 0))[0] || null;
}

function playbackSourcesForSong(gig, songIndex) {
  const videos = playbackCandidates(gig, songIndex);
  const planned = videos.flatMap((media) => (media.playbackClips || []).filter((clip) => clip.songIndex === songIndex).map((clip) => ({ media, clip }))).sort((a, b) => (a.clip.priority || 0) - (b.clip.priority || 0));
  if (planned.length) return planned;
  const legacy = videos.find((item) => !(item.playbackClips || []).length && item.songIndex === songIndex);
  return legacy ? [{ media: legacy, clip: { songIndex, startSeconds: legacy.playbackStart ?? null, endSeconds: legacy.playbackEnd ?? null, priority: 0 } }] : [];
}

function playbackFallbackOptions(gig, selectedId = '') {
  return `<option value="">Choose backup…</option>${playbackCandidates(gig).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(playbackSourceLabel(item))}</option>`).join('')}`;
}

function playbackFallbackMarkup(gig, entry = {}) {
  return `<div class="playback-fallback-row"><span class="playback-fallback-rank"></span><select class="playback-fallback-source">${playbackFallbackOptions(gig, entry.media?.id || '')}</select><input class="playback-fallback-start" type="number" min="0" step="0.1" inputmode="decimal" aria-label="Fallback start" placeholder="Start" value="${entry.clip?.startSeconds ?? ''}" /><input class="playback-fallback-end" type="number" min="0" step="0.1" inputmode="decimal" aria-label="Fallback end" placeholder="End" value="${entry.clip?.endSeconds ?? ''}" /><div class="playback-fallback-actions"><button type="button" data-fallback-action="up" aria-label="Move fallback up">↑</button><button type="button" data-fallback-action="down" aria-label="Move fallback down">↓</button><button type="button" data-fallback-action="remove" aria-label="Remove fallback">×</button></div></div>`;
}

function refreshPlaybackFallbacks(row) {
  const fallbacks = [...row.querySelectorAll('.playback-fallback-row')];
  fallbacks.forEach((fallback, index) => { fallback.querySelector('.playback-fallback-rank').textContent = `Backup ${index + 1}`; });
  row.querySelector('.playback-fallback-count').textContent = fallbacks.length ? String(fallbacks.length) : 'None';
  const primary = row.querySelector('.playback-source');
  row.querySelector('.add-playback-fallback').disabled = !primary.value || primary.options.length <= 2 || fallbacks.length >= 7;
}

function setupPlaybackFallbackEditor(gig, row) {
  const list = row.querySelector('.playback-fallback-list');
  const add = row.querySelector('.add-playback-fallback');
  const changed = () => { refreshPlaybackFallbacks(row); playbackEditorHealthCheck(gig); };
  add.addEventListener('click', () => {
    if (!row.querySelector('.playback-source').value) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = playbackFallbackMarkup(gig);
    list.append(wrapper.firstElementChild);
    changed();
  });
  list.addEventListener('input', changed);
  list.addEventListener('change', changed);
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-fallback-action]');
    if (!button) return;
    const fallback = button.closest('.playback-fallback-row');
    if (button.dataset.fallbackAction === 'remove') fallback.remove();
    if (button.dataset.fallbackAction === 'up' && fallback.previousElementSibling) list.insertBefore(fallback, fallback.previousElementSibling);
    if (button.dataset.fallbackAction === 'down' && fallback.nextElementSibling) list.insertBefore(fallback.nextElementSibling, fallback);
    changed();
  });
  refreshPlaybackFallbacks(row);
}

let activePlaybackEditorPreview = null;
function closePlaybackEditorPreview() {
  if (!activePlaybackEditorPreview) return;
  clearInterval(activePlaybackEditorPreview.timer);
  try { activePlaybackEditorPreview.player?.destroy?.(); } catch {}
  activePlaybackEditorPreview.video?.pause?.();
  const preview = activePlaybackEditorPreview.row?.querySelector('.playback-preview');
  if (preview) { preview.hidden = true; preview.querySelector('.playback-preview-stage').innerHTML = ''; }
  activePlaybackEditorPreview.row?.querySelector('.playback-preview-toggle')?.setAttribute('aria-expanded', 'false');
  activePlaybackEditorPreview = null;
}

function playbackEditorRowSources(gig, row) {
  const sources = [];
  const primaryId = row.querySelector('.playback-source').value;
  if (primaryId) sources.push({
    media: (gig.media || []).find((item) => item.id === primaryId),
    startValue: row.querySelector('.playback-start').value,
    endValue: row.querySelector('.playback-end').value,
    priority: 0,
    element: row
  });
  row.querySelectorAll('.playback-fallback-row').forEach((fallback, index) => {
    const mediaId = fallback.querySelector('.playback-fallback-source').value;
    if (mediaId) sources.push({
      media: (gig.media || []).find((item) => item.id === mediaId),
      startValue: fallback.querySelector('.playback-fallback-start').value,
      endValue: fallback.querySelector('.playback-fallback-end').value,
      priority: index + 1,
      element: fallback
    });
  });
  return sources;
}

function playbackEditorHealthCheck(gig) {
  const rows = [...playbackEditorList.querySelectorAll('.playback-editor-row')];
  const errors = [];
  const warnings = [];
  const clipsByMedia = new Map();
  let assigned = 0;
  rows.forEach((row) => {
    row.classList.remove('is-invalid', 'has-warning');
    const rowHealth = row.querySelector('.playback-row-health');
    rowHealth.textContent = '';
    const songIndex = Number(row.dataset.songIndex);
    const rowErrors = [];
    const rowWarnings = [];
    const sources = playbackEditorRowSources(gig, row);
    const primaryId = row.querySelector('.playback-source').value;
    if (!primaryId && sources.length) rowErrors.push('Choose a primary source before adding fallbacks.');
    if (!primaryId) {
      if (rowErrors.length) { row.classList.add('is-invalid'); rowHealth.textContent = rowErrors.join(' '); errors.push(...rowErrors.map((message) => `${gig.songs[songIndex].title}: ${message}`)); }
      return;
    }
    assigned += 1;
    const seenMedia = new Set();
    sources.forEach((source) => {
      const { media } = source;
      const start = source.startValue === '' ? null : Number(source.startValue);
      const end = source.endValue === '' ? null : Number(source.endValue);
      const duration = source.priority === 0 ? Number(row.dataset.mediaDuration) || null : null;
      const prefix = source.priority ? `Backup ${source.priority}: ` : '';
      if (!media) { rowErrors.push(`${prefix}Source is unavailable.`); return; }
      if (seenMedia.has(media.id)) rowErrors.push(`${prefix}Source is already used for this track.`);
      seenMedia.add(media.id);
      if (media.originalExists === false) rowErrors.push(`${prefix}Source file is missing from disk.`);
      if (source.priority === 0 && row.dataset.previewUnavailable === 'true') rowErrors.push('Primary source could not be loaded in the preview player.');
      if (media.mimeType !== 'video/youtube' && media.playbackStatus === 'encoding') rowWarnings.push(`${prefix}Mobile playback copy is still encoding.`);
      if (media.mimeType !== 'video/youtube' && media.playbackStatus === 'error') rowWarnings.push(`${prefix}Playback copy failed; the original file will be used.`);
      if (start !== null && (!Number.isFinite(start) || start < 0)) rowErrors.push(`${prefix}Start must be zero or greater.`);
      if (end !== null && (!Number.isFinite(end) || end <= 0)) rowErrors.push(`${prefix}End must be greater than zero.`);
      if (start !== null && end !== null && end <= start) rowErrors.push(`${prefix}End must be after start.`);
      if (duration && start !== null && start >= duration) rowErrors.push('Start is beyond the end of the primary video.');
      if (duration && end !== null && end > duration + .1) rowErrors.push('End is beyond the end of the primary video.');
      if (!clipsByMedia.has(media.id)) clipsByMedia.set(media.id, []);
      clipsByMedia.get(media.id).push({ row, songIndex, start, end, title: gig.songs[songIndex].title });
    });
    if (rowErrors.length) { row.classList.add('is-invalid'); rowHealth.textContent = rowErrors.join(' '); errors.push(...rowErrors.map((message) => `${gig.songs[songIndex].title}: ${message}`)); }
    else if (rowWarnings.length) { row.classList.add('has-warning'); rowHealth.textContent = rowWarnings.join(' '); warnings.push(...rowWarnings.map((message) => `${gig.songs[songIndex].title}: ${message}`)); }
  });
  clipsByMedia.forEach((clips) => {
    clips.sort((a, b) => a.songIndex - b.songIndex);
    for (let index = 1; index < clips.length; index += 1) {
      const previous = clips[index - 1];
      const current = clips[index];
      let message = '';
      if (previous.start !== null && current.start !== null && current.start < previous.start) message = `Starts before the earlier track “${previous.title}”.`;
      else if (previous.end !== null && current.start !== null && current.start < previous.end) message = `Overlaps “${previous.title}” on the same video.`;
      if (!message) continue;
      current.row.classList.add('is-invalid');
      const rowHealth = current.row.querySelector('.playback-row-health');
      rowHealth.textContent = `${rowHealth.textContent} ${message}`.trim();
      errors.push(`${current.title}: ${message}`);
    }
  });
  const gaps = rows.length - assigned;
  playbackEditorHealth.innerHTML = `<span class="playback-health-ready">${assigned}/${rows.length} tracks assigned</span><span class="playback-health-gap">${gaps} gap${gaps === 1 ? '' : 's'}</span><span class="${errors.length ? 'playback-health-error' : 'playback-health-ok'}">${errors.length ? `${errors.length} issue${errors.length === 1 ? '' : 's'} to fix` : 'No blocking issues'}</span>${warnings.length ? `<span class="playback-health-warning">${warnings.length} warning${warnings.length === 1 ? '' : 's'}</span>` : ''}`;
  savePlaybackPlan.disabled = Boolean(errors.length);
  savePlaybackPlan.title = errors.length ? errors[0] : '';
  return { errors, warnings, gaps };
}

function openPlaybackEditorPreview(gig, row) {
  if (activePlaybackEditorPreview?.row === row) { closePlaybackEditorPreview(); return; }
  closePlaybackEditorPreview();
  const media = (gig.media || []).find((item) => item.id === row.querySelector('.playback-source').value);
  if (!media) return;
  const preview = row.querySelector('.playback-preview');
  const stage = preview.querySelector('.playback-preview-stage');
  const time = preview.querySelector('.playback-preview-time');
  const toggle = row.querySelector('.playback-preview-toggle');
  row.dataset.previewUnavailable = '';
  preview.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  let currentTime = 0;
  let duration = 0;
  const updateTime = () => { time.textContent = `${formatPlaybackTime(currentTime)}${duration ? ` / ${formatPlaybackTime(duration)}` : ''}`; };
  const setDuration = (value) => { duration = Number(value) || 0; row.dataset.mediaDuration = duration || ''; playbackEditorHealthCheck(gig); updateTime(); };
  const previewState = { row, player: null, video: null, timer: null, current: () => currentTime, seek: () => {} };
  const markUnavailable = () => { row.dataset.previewUnavailable = 'true'; time.textContent = 'Video preview unavailable.'; playbackEditorHealthCheck(gig); };
  activePlaybackEditorPreview = previewState;
  if (media.mimeType === 'video/youtube') {
    const frameId = `playback-editor-youtube-${Date.now()}`;
    stage.innerHTML = `<iframe id="${frameId}" src="${youtubeEmbedUrl(media.url)}" title="Preview ${escapeHtml(playbackSourceLabel(media))}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    loadYouTubeApi().then((YT) => {
      if (activePlaybackEditorPreview !== previewState) return;
      previewState.player = new YT.Player(frameId, { events: { onReady: (event) => { setDuration(event.target.getDuration()); const start = Number(row.querySelector('.playback-start').value) || 0; if (start) event.target.seekTo(start, true); }, onError: markUnavailable } });
      previewState.seek = (seconds) => previewState.player?.seekTo?.(seconds, true);
      previewState.timer = setInterval(() => { currentTime = Number(previewState.player?.getCurrentTime?.()) || 0; if (!duration) setDuration(previewState.player?.getDuration?.()); else updateTime(); }, 250);
    }).catch(markUnavailable);
  } else {
    stage.innerHTML = `<video src="${escapeHtml(media.url)}" controls preload="metadata" playsinline></video>`;
    const video = stage.querySelector('video');
    previewState.video = video;
    previewState.seek = (seconds) => { video.currentTime = seconds; };
    video.addEventListener('loadedmetadata', () => { setDuration(video.duration); const start = Number(row.querySelector('.playback-start').value) || 0; if (start) video.currentTime = start; });
    video.addEventListener('timeupdate', () => { currentTime = video.currentTime; updateTime(); });
    video.addEventListener('error', markUnavailable, { once: true });
  }
  preview.querySelector('.set-preview-start').onclick = () => { row.querySelector('.playback-start').value = currentTime.toFixed(1); playbackEditorHealthCheck(gig); };
  preview.querySelector('.set-preview-end').onclick = () => { row.querySelector('.playback-end').value = currentTime.toFixed(1); playbackEditorHealthCheck(gig); };
  preview.querySelector('.jump-preview-start').onclick = () => previewState.seek(Math.max(0, Number(row.querySelector('.playback-start').value) || 0));
  preview.querySelector('.jump-preview-end').onclick = () => { const end = Number(row.querySelector('.playback-end').value); if (Number.isFinite(end) && end > 0) previewState.seek(end); };
  updateTime();
}

let playbackSuggestionState = { gigId: '', suggestions: [], metadataWarning: '' };
let playbackEditorRenderedGigId = '';
function capturePlaybackEditorDraft(gigId) {
  if (playbackEditorRenderedGigId !== gigId || !playbackEditorList?.querySelector('.playback-editor-row')) return null;
  return [...playbackEditorList.querySelectorAll('.playback-editor-row')].map((row) => ({
    songIndex: Number(row.dataset.songIndex),
    sources: playbackEditorRowSources({ media: activeEditGig?.media || [] }, row).filter((source) => source.media).map((source) => ({
      mediaId: source.media.id,
      startValue: source.startValue,
      endValue: source.endValue,
      priority: source.priority
    }))
  }));
}
function restorePlaybackEditorDraft(gig, draft) {
  if (!draft) return;
  draft.forEach((entry) => {
    const row = playbackEditorList.querySelector(`.playback-editor-row[data-song-index="${entry.songIndex}"]`);
    const primary = entry.sources.find((source) => source.priority === 0);
    if (!row) return;
    const select = row.querySelector('.playback-source');
    const fallbackList = row.querySelector('.playback-fallback-list');
    fallbackList.replaceChildren();
    if (!primary) {
      select.value = '';
      select.dispatchEvent(new Event('change'));
      refreshPlaybackFallbacks(row);
      return;
    }
    if (![...select.options].some((option) => option.value === primary.mediaId)) return;
    select.value = primary.mediaId;
    select.dispatchEvent(new Event('change'));
    row.querySelector('.playback-start').value = primary.startValue;
    row.querySelector('.playback-end').value = primary.endValue;
    entry.sources.filter((source) => source.priority > 0).sort((a, b) => a.priority - b.priority).forEach((source) => {
      const media = (gig.media || []).find((item) => item.id === source.mediaId);
      if (!media) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = playbackFallbackMarkup(gig, { media, clip: { startSeconds: source.startValue, endSeconds: source.endValue } });
      fallbackList.append(wrapper.firstElementChild);
    });
    refreshPlaybackFallbacks(row);
  });
}
function playbackSuggestionConfidence(suggestion) {
  const value = Number(suggestion?.confidence) || 0;
  if (value >= .9) return 'High confidence';
  if (value >= .75) return 'Good confidence';
  if (/interpolated/i.test(suggestion?.reason || '')) return 'Timing estimate';
  if (/estimated/i.test(suggestion?.reason || '')) return 'Rough timing';
  return 'Possible match';
}
function playbackSuggestionTiming(suggestion) {
  if (suggestion.startSeconds === null || suggestion.startSeconds === undefined) return 'Timing not detected';
  const start = formatPlaybackTime(suggestion.startSeconds);
  const end = suggestion.endSeconds === null || suggestion.endSeconds === undefined ? 'video end' : formatPlaybackTime(suggestion.endSeconds);
  return `${start}–${end}`;
}
function addSuggestedPlaybackFallback(gig, row, suggestion) {
  const media = (gig.media || []).find((item) => item.id === suggestion.mediaId);
  if (!media || !row.querySelector('.playback-source').value || row.querySelectorAll('.playback-fallback-row').length >= 7) return false;
  const used = new Set([row.querySelector('.playback-source').value, ...[...row.querySelectorAll('.playback-fallback-source')].map((select) => select.value)]);
  if (used.has(media.id)) return false;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = playbackFallbackMarkup(gig, { media, clip: suggestion });
  row.querySelector('.playback-fallback-list').append(wrapper.firstElementChild);
  row.querySelector('.playback-fallback-editor').open = true;
  refreshPlaybackFallbacks(row);
  return true;
}
function applyPlaybackSuggestion(gig, suggestion, withAlternatives = false) {
  const row = playbackEditorList.querySelector(`.playback-editor-row[data-song-index="${suggestion.songIndex}"]`);
  if (!row) return false;
  let applied = false;
  if (suggestion.fallbackOnly) applied = addSuggestedPlaybackFallback(gig, row, suggestion);
  else {
    const select = row.querySelector('.playback-source');
    if (![...select.options].some((option) => option.value === suggestion.mediaId)) return false;
    select.value = suggestion.mediaId;
    select.dispatchEvent(new Event('change'));
    row.querySelector('.playback-start').value = suggestion.startSeconds ?? '';
    row.querySelector('.playback-end').value = suggestion.endSeconds ?? '';
    applied = true;
  }
  if (withAlternatives) (suggestion.alternatives || []).filter((item) => item.confidence >= .65).forEach((item) => { if (addSuggestedPlaybackFallback(gig, row, item)) applied = true; });
  if (!applied) return false;
  row.classList.add('suggestion-applied');
  playbackSuggestionState.suggestions = playbackSuggestionState.suggestions.filter((item) => item.songIndex !== suggestion.songIndex);
  playbackEditorHealthCheck(gig);
  return applied;
}
function renderPlaybackSuggestions(gig) {
  playbackEditorList.querySelectorAll('.playback-suggestion').forEach((element) => element.remove());
  if (playbackSuggestionState.gigId !== gig.id) { playbackEditorSuggestions.innerHTML = ''; return; }
  const suggestions = playbackSuggestionState.suggestions;
  if (!suggestions.length) {
    playbackEditorSuggestions.innerHTML = `<p>${playbackSuggestionState.metadataWarning ? escapeHtml(playbackSuggestionState.metadataWarning) : 'No unapplied suggestions remain.'}</p>`;
    return;
  }
  const safeSuggestions = suggestions.filter((suggestion) => {
    if (suggestion.confidence < .75) return false;
    const row = playbackEditorList.querySelector(`.playback-editor-row[data-song-index="${suggestion.songIndex}"]`);
    if (!row) return false;
    const selected = row.querySelector('.playback-source').value;
    const hasTiming = row.querySelector('.playback-start').value !== '' || row.querySelector('.playback-end').value !== '';
    if (suggestion.fallbackOnly) return Boolean(selected) && !playbackEditorRowSources(gig, row).some((source) => source.media?.id === suggestion.mediaId);
    return !selected || (selected === suggestion.mediaId && !hasTiming);
  });
  const timingEstimates = suggestions.filter((suggestion) => /estimated|interpolated/i.test(suggestion.reason || ''));
  playbackEditorSuggestions.innerHTML = `<div><strong>${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'} ready to review</strong><small>${playbackSuggestionState.metadataWarning ? escapeHtml(playbackSuggestionState.metadataWarning) : 'Manual clips have been left untouched. Timing estimates remain editable until you save.'}</small></div>${timingEstimates.length ? `<button type="button" class="button button-secondary apply-timing-estimates">Apply ${timingEstimates.length} timing estimate${timingEstimates.length === 1 ? '' : 's'}</button>` : ''}${safeSuggestions.length ? `<button type="button" class="button button-secondary apply-safe-suggestions">Apply ${safeSuggestions.length} safe suggestion${safeSuggestions.length === 1 ? '' : 's'}</button>` : ''}`;
  suggestions.forEach((suggestion) => {
    const row = playbackEditorList.querySelector(`.playback-editor-row[data-song-index="${suggestion.songIndex}"]`);
    if (!row) return;
    const suggestionElement = document.createElement('div');
    suggestionElement.className = 'playback-suggestion';
    const alternatives = (suggestion.alternatives || []).filter((item) => item.confidence >= .65);
    suggestionElement.innerHTML = `<div><span>${suggestion.fallbackOnly ? 'Fallback candidate' : playbackSuggestionConfidence(suggestion)} · ${Math.round(suggestion.confidence * 100)}%</span><strong>${escapeHtml(suggestion.sourceLabel)}</strong><small>${escapeHtml(playbackSuggestionTiming(suggestion))} · ${escapeHtml(suggestion.reason)}${alternatives.length ? ` · ${alternatives.length} additional source${alternatives.length === 1 ? '' : 's'}` : ''}</small></div><div><button type="button" class="apply-playback-suggestion">${suggestion.fallbackOnly ? 'Add backup' : 'Apply'}</button>${alternatives.length ? `<button type="button" class="apply-playback-suggestion-all">${suggestion.fallbackOnly ? 'Add all' : 'Apply + backups'}</button>` : ''}<button type="button" class="dismiss-playback-suggestion">Dismiss</button></div>`;
    row.querySelector('.playback-preview').insertAdjacentElement('beforebegin', suggestionElement);
    suggestionElement.querySelector('.apply-playback-suggestion').addEventListener('click', () => { applyPlaybackSuggestion(gig, suggestion); renderPlaybackSuggestions(gig); });
    suggestionElement.querySelector('.apply-playback-suggestion-all')?.addEventListener('click', () => { applyPlaybackSuggestion(gig, suggestion, true); renderPlaybackSuggestions(gig); });
    suggestionElement.querySelector('.dismiss-playback-suggestion').addEventListener('click', () => { playbackSuggestionState.suggestions = playbackSuggestionState.suggestions.filter((item) => item.songIndex !== suggestion.songIndex); renderPlaybackSuggestions(gig); });
  });
  playbackEditorSuggestions.querySelector('.apply-safe-suggestions')?.addEventListener('click', () => {
    let applied = 0;
    safeSuggestions.forEach((suggestion) => { if (applyPlaybackSuggestion(gig, suggestion)) applied += 1; });
    playbackEditorMessage.textContent = `${applied} suggestion${applied === 1 ? '' : 's'} applied. Review the plan, then save it.`;
    playbackEditorMessage.classList.remove('error');
    renderPlaybackSuggestions(gig);
  });
  playbackEditorSuggestions.querySelector('.apply-timing-estimates')?.addEventListener('click', () => {
    let applied = 0;
    timingEstimates.forEach((suggestion) => { if (applyPlaybackSuggestion(gig, suggestion)) applied += 1; });
    playbackEditorMessage.textContent = `${applied} full-show timing estimate${applied === 1 ? '' : 's'} applied. Preview the boundaries, then save the plan.`;
    playbackEditorMessage.classList.remove('error');
    renderPlaybackSuggestions(gig);
  });
}

function renderPlaybackEditor(gig) {
  if (!playbackEditorList) return;
  const playbackDraft = capturePlaybackEditorDraft(gig.id);
  closePlaybackEditorPreview();
  const songs = gig.songs || [];
  if (!songs.length) { playbackEditorRenderedGigId = gig.id; playbackEditorHealth.innerHTML = ''; playbackEditorList.innerHTML = '<p class="empty-state">Add a setlist before building the playback plan.</p>'; savePlaybackPlan.disabled = true; return; }
  savePlaybackPlan.disabled = false;
  playbackEditorList.innerHTML = songs.map((song, songIndex) => {
    const candidates = playbackCandidates(gig, songIndex);
    const sources = playbackSourcesForSong(gig, songIndex);
    const selectedEntry = sources[0] || null;
    const selected = selectedEntry?.media || null;
    const clip = selectedEntry?.clip || null;
    const fallbacks = sources.slice(1);
    return `<div class="playback-editor-row${selected ? '' : ' is-gap'}" data-song-index="${songIndex}"><span class="playback-editor-number">${songIndex + 1}</span><div class="playback-editor-track"><strong>${escapeHtml(song.title)}</strong><small>${selected ? escapeHtml(playbackSourceLabel(selected)) : 'Missing video · skipped during playback'}</small><button class="playback-preview-toggle" type="button" aria-expanded="false" ${selected ? '' : 'disabled'}>▶ Preview &amp; set points</button></div><label class="playback-source-field">Primary source<select class="playback-source" ${candidates.length ? '' : 'disabled'}><option value="">No video · skip track</option>${candidates.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected?.id ? 'selected' : ''}>${escapeHtml(playbackSourceLabel(item))}</option>`).join('')}</select></label><label class="playback-start-field">Start<input class="playback-start" type="number" min="0" step="0.1" inputmode="decimal" value="${clip?.startSeconds ?? selected?.playbackStart ?? ''}" placeholder="0:00" ${selected ? '' : 'disabled'} /></label><label class="playback-end-field">End<input class="playback-end" type="number" min="0" step="0.1" inputmode="decimal" value="${clip?.endSeconds ?? selected?.playbackEnd ?? ''}" placeholder="Video end" ${selected ? '' : 'disabled'} /></label><details class="playback-fallback-editor"><summary>Fallback sources <span class="playback-fallback-count">${fallbacks.length || 'None'}</span></summary><div class="playback-fallback-list">${fallbacks.map((entry) => playbackFallbackMarkup(gig, entry)).join('')}</div><button class="add-playback-fallback" type="button" ${candidates.length > 1 ? '' : 'disabled'}>+ Add fallback</button></details><p class="playback-row-health" aria-live="polite"></p><div class="playback-preview" hidden><div class="playback-preview-stage"></div><div class="playback-preview-toolbar"><output class="playback-preview-time">0:00</output><button type="button" class="set-preview-start">Set start here</button><button type="button" class="set-preview-end">Set end here</button><button type="button" class="jump-preview-start">Jump to start</button><button type="button" class="jump-preview-end">Jump to end</button></div></div></div>`;
  }).join('');
  playbackEditorList.querySelectorAll('.playback-source').forEach((select) => select.addEventListener('change', () => {
    const row = select.closest('.playback-editor-row');
    if (activePlaybackEditorPreview?.row === row) closePlaybackEditorPreview();
    const songIndex = Number(row.dataset.songIndex);
    const item = (gig.media || []).find((entry) => entry.id === select.value);
    const clip = playbackClipFor(item, songIndex);
    row.dataset.mediaDuration = '';
    row.dataset.previewUnavailable = '';
    row.querySelector('.playback-start').value = clip?.startSeconds ?? item?.playbackStart ?? '';
    row.querySelector('.playback-end').value = clip?.endSeconds ?? item?.playbackEnd ?? '';
    row.querySelector('.playback-start').disabled = !item;
    row.querySelector('.playback-end').disabled = !item;
    row.querySelector('.playback-preview-toggle').disabled = !item;
    row.querySelector('.add-playback-fallback').disabled = !item || playbackCandidates(gig).length <= 1;
    row.querySelectorAll('.playback-fallback-row').forEach((fallback) => { if (fallback.querySelector('.playback-fallback-source').value === item?.id) fallback.remove(); });
    refreshPlaybackFallbacks(row);
    row.querySelector('.playback-editor-track small').textContent = item ? playbackSourceLabel(item) : 'Missing video · skipped during playback';
    row.classList.toggle('is-gap', !item);
    playbackEditorHealthCheck(gig);
  }));
  restorePlaybackEditorDraft(gig, playbackDraft);
  playbackEditorRenderedGigId = gig.id;
  playbackEditorList.querySelectorAll('.playback-editor-row').forEach((row) => setupPlaybackFallbackEditor(gig, row));
  playbackEditorList.querySelectorAll('.playback-preview-toggle').forEach((button) => button.addEventListener('click', () => openPlaybackEditorPreview(gig, button.closest('.playback-editor-row'))));
  playbackEditorList.querySelectorAll('.playback-start, .playback-end').forEach((input) => input.addEventListener('input', () => playbackEditorHealthCheck(gig)));
  playbackEditorHealthCheck(gig);
  renderPlaybackSuggestions(gig);
  savePlaybackPlan.onclick = async () => {
    const health = playbackEditorHealthCheck(gig);
    if (health.errors.length) { playbackEditorMessage.textContent = health.errors[0]; playbackEditorMessage.classList.add('error'); return; }
    savePlaybackPlan.disabled = true;
    playbackEditorMessage.textContent = 'Saving playback plan…'; playbackEditorMessage.classList.remove('error');
    try {
      const clips = [];
      for (const row of playbackEditorList.querySelectorAll('.playback-editor-row')) {
        const songIndex = Number(row.dataset.songIndex);
        for (const source of playbackEditorRowSources(gig, row)) {
          const start = source.startValue === '' ? null : Number(source.startValue);
          const end = source.endValue === '' ? null : Number(source.endValue);
          if (start !== null && (!Number.isFinite(start) || start < 0)) throw new Error(`Invalid start point for ${gig.songs[songIndex].title}.`);
          if (end !== null && (!Number.isFinite(end) || end <= 0)) throw new Error(`Invalid end point for ${gig.songs[songIndex].title}.`);
          if (start !== null && end !== null && end <= start) throw new Error(`End must be after start for ${gig.songs[songIndex].title}.`);
          clips.push({ mediaId: source.media.id, songIndex, startSeconds: start, endSeconds: end, priority: source.priority });
        }
      }
      const updated = await fetchJson(`/api/gigs/${gig.id}/playback-plan`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clips }) });
      gig.media = updated.media;
      gigs = gigs.map((entry) => entry.id === gig.id ? gig : entry);
      if (playbackSuggestionState.gigId === gig.id) {
        const savedSongIndexes = new Set(clips.map((clip) => clip.songIndex));
        playbackSuggestionState.suggestions = playbackSuggestionState.suggestions.filter((suggestion) => !savedSongIndexes.has(suggestion.songIndex));
      }
      playbackEditorMessage.textContent = 'Playback plan saved.';
      renderPlaybackEditor(gig);
    } catch (error) { playbackEditorMessage.textContent = error.message; playbackEditorMessage.classList.add('error'); }
    finally { savePlaybackPlan.disabled = false; }
  };
}

autoBuildPlaybackPlan?.addEventListener('click', async () => {
  const gig = gigs.find((entry) => entry.id === editGigId);
  if (!gig) return;
  autoBuildPlaybackPlan.disabled = true;
  autoBuildPlaybackPlan.textContent = 'Inspecting videos…';
  playbackEditorSuggestions.innerHTML = '<p>Reading chapters, full-show durations, titles and track detections…</p>';
  playbackEditorMessage.textContent = '';
  try {
    const result = await fetchJson(`/api/gigs/${gig.id}/playback-plan/suggest`, { method: 'POST' });
    playbackSuggestionState = { gigId: gig.id, suggestions: result.suggestions || [], metadataWarning: result.metadataWarning || '' };
    renderPlaybackSuggestions(gig);
    playbackEditorMessage.textContent = result.suggestions?.length ? `Inspected ${result.inspected} video${result.inspected === 1 ? '' : 's'}. Review the highlighted suggestions below.` : 'No new setlist matches were found. Your saved plan was not changed.';
    playbackEditorMessage.classList.remove('error');
  } catch (error) {
    playbackEditorSuggestions.innerHTML = '';
    playbackEditorMessage.textContent = error.message;
    playbackEditorMessage.classList.add('error');
  } finally {
    autoBuildPlaybackPlan.disabled = false;
    autoBuildPlaybackPlan.textContent = '✦ Suggest plan';
  }
});

mediaWorkspaceFilters?.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { mediaWorkspaceFilter = button.dataset.mediaFilter; applyMediaWorkspaceFilter(); }));
mediaWorkspaceRefresh?.addEventListener('click', async () => {
  mediaWorkspaceRefresh.disabled = true; mediaWorkspaceRefresh.textContent = 'Refreshing…';
  try { await refreshEditMediaWorkspace(); } finally { mediaWorkspaceRefresh.disabled = false; mediaWorkspaceRefresh.textContent = 'Refresh status'; }
});

function setSharedMessage(text, isError = false) {
  sharedMessage.textContent = text;
  sharedMessage.classList.toggle('error', isError);
}

function activeProfile() {
  return profiles.find((profile) => profile.id === activeProfileId);
}

function attendeeNames(gig) {
  return (Array.isArray(gig?.attendees) ? gig.attendees : []).map((person) => person?.name).filter(Boolean);
}

function renderAttendeeSummary(container, gig, prefix = 'With') {
  const names = attendeeNames(gig);
  if (names.length < 2) return;
  const summary = document.createElement('p');
  summary.className = 'gig-attendees-summary';
  summary.textContent = `${prefix} ${names.join(', ')}`;
  container.append(summary);
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
    renderAttendeeSummary(card.querySelector('.gig-summary'), gig);
    const ratings = card.querySelector('.gig-ratings');
    ratings.innerHTML = `${gig.performanceRating ? `<span>Performance ${gig.performanceRating} / 5</span>` : ''}${gig.venueRating ? `<span>Venue ${gig.venueRating} / 5</span>` : ''}`;
    const setlist = card.querySelector('.setlist');
    if (gig.songs?.length) setlist.innerHTML = `<ol>${gig.songs.map((song) => `<li>${escapeHtml(song.title)}${song.encore ? ' <b>Encore</b>' : ''}</li>`).join('')}</ol>`;
    setupShowMediaSection(card, (gig.media || []).filter((item) => item.category !== 'artifact'), { songs: gig.songs || [] });
    card.querySelectorAll('.artifact-section, .add-artifact-gig').forEach((element) => element.remove());
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
  const topVenues = countBy(gigs.map((gig) => `${gig.venue}\u001f${gig.city}`)).slice(0, 5).map(([key, count]) => { const [name, city] = key.split('\u001f'); return [name, city, count]; });
  const localStats = { shows: gigs.length, artists: new Set(gigs.map((gig) => gig.artist.toLowerCase())).size, venues: new Set(gigs.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size, cities: new Set(gigs.map((gig) => gig.city.toLowerCase())).size, songs: gigs.reduce((sum, gig) => sum + (gig.songs?.length || 0), 0), favourites: gigs.filter((gig) => gig.favorite).length, topArtists: countBy(gigs.map((gig) => gig.artist)).slice(0, 5), topVenues };
  const render = (stats) => {
    const artistLinks = stats.topArtists.map(([name, count]) => `<a class="dashboard-stat-link" href="/artist?name=${encodeURIComponent(name)}"><span>${escapeHtml(name)}</span><small>${count} show${count === 1 ? '' : 's'}</small></a>`).join('') || '<span>None yet</span>';
    const venueLinks = stats.topVenues.map(([name, cityOrCount, possibleCount]) => {
      const legacyEntry = possibleCount === undefined;
      const city = legacyEntry ? gigs.find((gig) => gig.venue === name)?.city || '' : cityOrCount;
      const count = legacyEntry ? cityOrCount : possibleCount;
      return `<a class="dashboard-stat-link" href="/venue?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}"><span>${escapeHtml(name)}</span><small>${escapeHtml(city)}${city ? ' · ' : ''}${count} show${count === 1 ? '' : 's'}</small></a>`;
    }).join('') || '<span>None yet</span>';
    dashboardStats.innerHTML = `<p class="eyebrow">Archive snapshot</p><div class="dashboard-stat-grid"><span><strong>${stats.shows}</strong> shows</span><span><strong>${stats.artists}</strong> artists</span><span><strong>${stats.venues}</strong> venues</span><span><strong>${stats.cities}</strong> cities</span><span><strong>${stats.songs}</strong> songs</span><span><strong>${stats.favourites}</strong> favourites</span></div><div class="dashboard-stat-columns"><div><b>Most seen artists</b>${artistLinks}</div><div><b>Most visited venues</b>${venueLinks}</div></div>`;
  };
  render(localStats);
  try { render(await fetchJson('/api/stats')); } catch { /* local snapshot remains visible */ }
}

function directoryInitials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '♪';
}

function directoryRatingFor(show) {
  const localRating = Number(show.performanceRating || 0);
  if (localRating) return localRating;
  return Math.max(0, ...(show.contributions || []).map((entry) => Number(entry.performanceRating || 0)));
}

function bindDirectoryImageFallbacks(grid) {
  grid.querySelectorAll('.entity-card-image img').forEach((image) => image.addEventListener('error', () => {
    image.closest('.entity-card-image')?.classList.add('is-missing');
    image.remove();
  }, { once: true }));
}

const directoryCardObservers = new WeakMap();
const directoryMetadataRequests = new Map();
const directoryHydrationQueue = [];
let directoryHydrationActive = 0;

function directoryEntityInfo(type, name, city = '') {
  const key = `${type}|${name}|${city}`.toLocaleLowerCase();
  if (!directoryMetadataRequests.has(key)) {
    const endpoint = type === 'artist'
      ? `/api/artists?name=${encodeURIComponent(name)}`
      : `/api/venues?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}`;
    directoryMetadataRequests.set(key, fetchJson(endpoint).catch(() => null));
  }
  return directoryMetadataRequests.get(key);
}

function runDirectoryHydrationQueue() {
  while (directoryHydrationActive < 2 && directoryHydrationQueue.length) {
    const task = directoryHydrationQueue.shift();
    directoryHydrationActive += 1;
    directoryEntityInfo(task.type, task.name, task.city).then((info) => {
      if (!info?.image || !task.card.isConnected || task.card.querySelector('.entity-card-image img')) return;
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => { task.card.querySelector('.entity-card-image')?.classList.add('is-missing'); image.remove(); }, { once: true });
      image.src = info.image;
      task.card.querySelector('.entity-card-image')?.append(image);
    }).finally(() => {
      directoryHydrationActive -= 1;
      runDirectoryHydrationQueue();
    });
  }
}

function hydrateMissingDirectoryCards(grid, type) {
  directoryCardObservers.get(grid)?.disconnect();
  const cards = [...grid.querySelectorAll('.entity-card')].filter((card) => !card.querySelector('.entity-card-image img'));
  if (!cards.length) return;
  const enqueue = (card) => {
    directoryHydrationQueue.push({ card, type, name: card.dataset.entityName, city: card.dataset.entityCity || '' });
    runDirectoryHydrationQueue();
  };
  if (!('IntersectionObserver' in window)) { cards.forEach(enqueue); return; }
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    observer.unobserve(entry.target);
    enqueue(entry.target);
  }), { rootMargin: '240px' });
  cards.forEach((card) => observer.observe(card));
  directoryCardObservers.set(grid, observer);
}

async function renderEntityDirectories() {
  if (!['artists', 'venues'].includes(page)) return;
  let metadata = { artists: [], venues: [] };
  try { metadata = await fetchJson('/api/directory/metadata'); } catch { /* Directory remains useful without cached artwork. */ }
  const artistMetadata = new Map(metadata.artists.map((entry) => [entry.lookupName, entry]));
  const venueMetadata = new Map(metadata.venues.map((entry) => [entry.lookupName, entry]));
  const archiveShows = [...gigs, ...remoteSharedArchiveShows()];

  if (page === 'artists') {
    const records = new Map();
    for (const show of archiveShows) {
      const key = show.artist.trim().toLocaleLowerCase();
      if (!records.has(key)) records.set(key, { key, name: show.artist, shows: 0, venues: new Set(), latestDate: '', ratings: [], favourites: 0 });
      const record = records.get(key);
      record.shows += 1;
      record.venues.add(`${show.venue}|${show.city}`.toLocaleLowerCase());
      if (show.date > record.latestDate) record.latestDate = show.date;
      const rating = directoryRatingFor(show);
      if (rating) record.ratings.push(rating);
      if (show.favorite || show.contributions?.some((entry) => entry.favorite)) record.favourites += 1;
    }
    const artists = [...records.values()].map((record) => {
      const info = artistMetadata.get(record.key) || {};
      return { ...record, image: info.image || '', description: info.description || '', averageRating: record.ratings.length ? record.ratings.reduce((sum, rating) => sum + rating, 0) / record.ratings.length : 0 };
    });
    const drawArtists = () => {
      const query = artistsFilter.value.trim().toLocaleLowerCase();
      const visible = artists.filter((artist) => !query || artist.name.toLocaleLowerCase().includes(query)).sort((a, b) => {
        if (artistsSort.value === 'name') return a.name.localeCompare(b.name);
        if (artistsSort.value === 'recent') return (b.latestDate || '').localeCompare(a.latestDate || '') || a.name.localeCompare(b.name);
        if (artistsSort.value === 'rating') return b.averageRating - a.averageRating || b.shows - a.shows || a.name.localeCompare(b.name);
        return b.shows - a.shows || (b.latestDate || '').localeCompare(a.latestDate || '') || a.name.localeCompare(b.name);
      });
      artistsSummary.textContent = `${visible.length} of ${artists.length} artist${artists.length === 1 ? '' : 's'}`;
      artistsGrid.innerHTML = visible.map((artist) => `<a class="entity-card entity-card-artist" data-entity-name="${escapeHtml(artist.name)}" href="/artist?name=${encodeURIComponent(artist.name)}"><div class="entity-card-image"><span aria-hidden="true">${escapeHtml(directoryInitials(artist.name))}</span>${artist.image ? `<img src="${escapeHtml(artist.image)}" alt="" loading="lazy" decoding="async" />` : ''}</div><div class="entity-card-copy"><p class="eyebrow">${artist.shows} show${artist.shows === 1 ? '' : 's'} · ${artist.venues.size} venue${artist.venues.size === 1 ? '' : 's'}</p><h2>${escapeHtml(artist.name)}</h2><p>${escapeHtml(artist.description || (artist.latestDate ? `Last seen ${formatGigDate(artist.latestDate)}` : 'An undated archive memory'))}</p><div class="entity-card-stats"><span><strong>${artist.averageRating ? artist.averageRating.toFixed(1) : '—'}</strong>Avg rating</span><span><strong>${artist.favourites}</strong>Favourite${artist.favourites === 1 ? '' : 's'}</span><span><strong>${artist.latestDate ? artist.latestDate.slice(0, 4) : '—'}</strong>Last seen</span></div></div></a>`).join('') || '<p class="empty-state entity-directory-empty">No artists match that search.</p>';
      bindDirectoryImageFallbacks(artistsGrid);
      hydrateMissingDirectoryCards(artistsGrid, 'artist');
    };
    artistsFilter.addEventListener('input', drawArtists);
    artistsSort.addEventListener('change', drawArtists);
    drawArtists();
  }

  if (page === 'venues') {
    const records = new Map();
    for (const show of archiveShows) {
      const key = `${show.venue}|${show.city}`.toLocaleLowerCase();
      if (!records.has(key)) records.set(key, { key, name: show.venue, city: show.city, shows: 0, artists: new Set(), latestDate: '', favourites: 0 });
      const record = records.get(key);
      record.shows += 1;
      record.artists.add(show.artist.toLocaleLowerCase());
      if (show.date > record.latestDate) record.latestDate = show.date;
      if (show.favorite || show.contributions?.some((entry) => entry.favorite)) record.favourites += 1;
    }
    const venues = [...records.values()].map((record) => { const info = venueMetadata.get(record.key) || {}; return { ...record, image: info.image || '', description: info.description || '' }; });
    const drawVenues = () => {
      const query = venuesFilter.value.trim().toLocaleLowerCase();
      const visible = venues.filter((venue) => !query || `${venue.name} ${venue.city}`.toLocaleLowerCase().includes(query)).sort((a, b) => {
        if (venuesSort.value === 'name') return a.name.localeCompare(b.name) || a.city.localeCompare(b.city);
        if (venuesSort.value === 'recent') return (b.latestDate || '').localeCompare(a.latestDate || '') || a.name.localeCompare(b.name);
        return b.shows - a.shows || (b.latestDate || '').localeCompare(a.latestDate || '') || a.name.localeCompare(b.name);
      });
      venuesSummary.textContent = `${visible.length} of ${venues.length} venue${venues.length === 1 ? '' : 's'}`;
      venuesGrid.innerHTML = visible.map((venue) => `<a class="entity-card entity-card-venue" data-entity-name="${escapeHtml(venue.name)}" data-entity-city="${escapeHtml(venue.city)}" href="/venue?name=${encodeURIComponent(venue.name)}&city=${encodeURIComponent(venue.city)}"><div class="entity-card-image"><span aria-hidden="true">${escapeHtml(directoryInitials(venue.name))}</span>${venue.image ? `<img src="${escapeHtml(venue.image)}" alt="" loading="lazy" decoding="async" />` : ''}</div><div class="entity-card-copy"><p class="eyebrow">${escapeHtml(venue.city || 'Location unknown')}</p><h2>${escapeHtml(venue.name)}</h2><p>${escapeHtml(venue.description || (venue.latestDate ? `Last visited ${formatGigDate(venue.latestDate)}` : 'An undated archive location'))}</p><div class="entity-card-stats"><span><strong>${venue.shows}</strong>Visit${venue.shows === 1 ? '' : 's'}</span><span><strong>${venue.artists.size}</strong>Artist${venue.artists.size === 1 ? '' : 's'}</span><span><strong>${venue.latestDate ? venue.latestDate.slice(0, 4) : '—'}</strong>Last visit</span></div></div></a>`).join('') || '<p class="empty-state entity-directory-empty">No venues match that search.</p>';
      bindDirectoryImageFallbacks(venuesGrid);
      hydrateMissingDirectoryCards(venuesGrid, 'venue');
    };
    venuesFilter.addEventListener('input', drawVenues);
    venuesSort.addEventListener('change', drawVenues);
    drawVenues();
  }
}

function renderTimeline() {
  if (page !== 'timeline' || !timelineChart) return;
  const allShows = [...gigs, ...remoteSharedArchiveShows()];
  const yearFor = (gig) => String(gig.date || '').match(/^(\d{4})/)?.[1] || '';
  const datedShows = allShows.filter((gig) => yearFor(gig));
  const undatedCount = allShows.length - datedShows.length;
  const counts = datedShows.reduce((result, gig) => {
    const year = yearFor(gig);
    result[year] = (result[year] || 0) + 1;
    return result;
  }, {});
  const availableYears = Object.keys(counts).map(Number).sort((a, b) => a - b);

  if (!availableYears.length) {
    timelineSummary.innerHTML = `<span><strong>0</strong>Dated shows</span><span><strong>${undatedCount}</strong>Undated</span><span><strong>—</strong>Busiest year</span>`;
    timelineChart.replaceChildren();
    const message = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    message.setAttribute('x', '480'); message.setAttribute('y', '190'); message.setAttribute('text-anchor', 'middle'); message.setAttribute('class', 'timeline-empty-label');
    message.textContent = 'ADD DATES TO REVEAL YOUR TIMELINE';
    timelineChart.append(message);
    timelineYearDetail.hidden = true;
    return;
  }

  timelineYearDetail.hidden = false;
  const firstYear = availableYears[0];
  const lastYear = availableYears.at(-1);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const busiestYear = availableYears.reduce((best, year) => counts[year] >= counts[best] ? year : best, availableYears[0]);
  const requestedYear = Number(new URLSearchParams(location.search).get('year'));
  let selectedYear = years.includes(requestedYear) ? requestedYear : busiestYear;
  timelineSummary.innerHTML = `<span><strong>${datedShows.length}</strong>Dated shows</span><span><strong>${availableYears.length}</strong>Active years</span><span><strong>${busiestYear}</strong>Busiest · ${counts[busiestYear]} shows</span><span><strong>${undatedCount}</strong>Undated</span>`;

  const drawChart = () => {
    const width = 960; const height = 380;
    const margin = { top: 34, right: 48, bottom: 62, left: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxCount = Math.max(...years.map((year) => counts[year] || 0), 1);
    const cumulative = [];
    years.reduce((total, year) => { const next = total + (counts[year] || 0); cumulative.push(next); return next; }, 0);
    const cumulativeMax = cumulative.at(-1) || 1;
    const slot = plotWidth / years.length;
    const barWidth = Math.max(5, Math.min(42, slot * .58));
    const x = (index) => margin.left + slot * index + slot / 2;
    const barY = (value) => margin.top + plotHeight - (value / maxCount) * plotHeight;
    const totalY = (value) => margin.top + plotHeight - (value / cumulativeMax) * plotHeight;
    const labelEvery = Math.max(1, Math.ceil(years.length / 12));
    const svg = [];
    svg.push(`<title id="timeline-chart-title">Shows attended from ${firstYear} to ${lastYear}</title><desc id="timeline-chart-description">${datedShows.length} dated shows. ${busiestYear} was busiest with ${counts[busiestYear]} shows. Select a year for details.</desc>`);
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = Math.round((maxCount * tick) / 4);
      const y = barY(value);
      svg.push(`<line class="timeline-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="timeline-axis-label" x="${margin.left - 11}" y="${y + 4}" text-anchor="end">${value}</text>`);
    }
    years.forEach((year, index) => {
      const value = counts[year] || 0;
      const y = barY(value);
      const heightValue = Math.max(value ? 3 : 1, margin.top + plotHeight - y);
      const selected = year === selectedYear ? ' is-selected' : '';
      svg.push(`<a class="timeline-year-link${selected}" href="/timeline?year=${year}" data-timeline-year="${year}" aria-label="${year}: ${value} show${value === 1 ? '' : 's'}"><rect class="timeline-bar-hit" x="${x(index) - slot / 2}" y="${margin.top}" width="${slot}" height="${plotHeight}"></rect><rect class="timeline-bar" x="${x(index) - barWidth / 2}" y="${margin.top + plotHeight - heightValue}" width="${barWidth}" height="${heightValue}"></rect>${value ? `<text class="timeline-value-label" x="${x(index)}" y="${Math.max(margin.top + 12, y - 8)}" text-anchor="middle">${value}</text>` : ''}</a>`);
      if (index % labelEvery === 0 || index === years.length - 1 || year === selectedYear) svg.push(`<text class="timeline-year-label${selected}" x="${x(index)}" y="${height - 28}" text-anchor="middle">${year}</text>`);
    });
    const points = cumulative.map((value, index) => `${x(index)},${totalY(value)}`).join(' ');
    svg.push(`<polyline class="timeline-cumulative-line" points="${points}"></polyline>`);
    cumulative.forEach((value, index) => svg.push(`<circle class="timeline-cumulative-point" cx="${x(index)}" cy="${totalY(value)}" r="${years[index] === selectedYear ? 5 : 3}"><title>${value} total shows by ${years[index]}</title></circle>`));
    svg.push(`<text class="timeline-axis-title" x="${margin.left}" y="17">SHOWS</text><text class="timeline-axis-title timeline-axis-title-right" x="${width - margin.right}" y="17" text-anchor="end">${cumulativeMax} TOTAL</text>`);
    timelineChart.innerHTML = svg.join('');
    timelineChart.querySelectorAll('[data-timeline-year]').forEach((link) => link.addEventListener('click', (event) => {
      event.preventDefault();
      selectedYear = Number(link.dataset.timelineYear);
      const url = new URL(location.href); url.searchParams.set('year', selectedYear); history.replaceState({}, '', url);
      drawChart();
      drawYearDetail();
      if (matchMedia('(max-width: 640px)').matches) timelineYearDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  };

  const drawYearDetail = () => {
    const selectedShows = datedShows.filter((gig) => Number(yearFor(gig)) === selectedYear).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const previousCount = counts[selectedYear - 1] || 0;
    const difference = selectedShows.length - previousCount;
    timelineSelectedYear.textContent = selectedYear;
    timelineYearChange.className = difference > 0 ? 'is-up' : difference < 0 ? 'is-down' : 'is-even';
    timelineYearChange.textContent = previousCount ? `${difference > 0 ? '▲' : difference < 0 ? '▼' : '◆'} ${Math.abs(difference)} ${difference === 0 ? 'change' : difference > 0 ? 'more' : 'fewer'} than ${selectedYear - 1}` : `${selectedShows.length} show${selectedShows.length === 1 ? '' : 's'} logged`;
    const monthCounts = Array(12).fill(0);
    selectedShows.forEach((gig) => { const month = Number(String(gig.date).slice(5, 7)); if (month >= 1 && month <= 12) monthCounts[month - 1] += 1; });
    const maxMonth = Math.max(...monthCounts, 1);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    timelineMonths.innerHTML = monthCounts.map((value, index) => `<div class="timeline-month" title="${monthNames[index]} ${selectedYear}: ${value} show${value === 1 ? '' : 's'}"><span class="timeline-month-count">${value || ''}</span><div><i style="height:${Math.max(value ? 8 : 2, (value / maxMonth) * 100)}%"></i></div><b>${monthNames[index]}</b></div>`).join('');
    const localIds = new Set(gigs.map((gig) => gig.id));
    timelineYearShows.innerHTML = selectedShows.length ? `<p class="eyebrow">${selectedShows.length} show${selectedShows.length === 1 ? '' : 's'} in ${selectedYear}</p><div>${selectedShows.map((gig) => `<a class="timeline-show-link" href="${localIds.has(gig.id) ? `/show?id=${encodeURIComponent(gig.id)}` : `/shows#shared-${encodeURIComponent(gig.id)}`}"><time>${escapeHtml(formatGigDate(gig.date, { month: 'short', day: 'numeric' }))}</time><span><strong>${escapeHtml(gig.artist)}</strong><small>${escapeHtml(gig.venue)} · ${escapeHtml(gig.city)}</small></span><b aria-hidden="true">→</b></a>`).join('')}</div>` : `<p class="empty-state">No shows logged in ${selectedYear}. The quiet years count too.</p>`;
  };

  drawChart();
  drawYearDetail();
}

const normaliseSearch = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
const uniqueSearchResults = (items, key) => [...new Map(items.map((item) => [key(item), item])).values()];

function searchSection(title, items) {
  if (!items.length) return '';
  return `<section class="global-search-section"><div class="global-search-section-heading"><h2>${escapeHtml(title)}</h2><span>${items.length}</span></div><div class="global-search-grid">${items.join('')}</div></section>`;
}

function updateGlobalSearch() {
  if (page !== 'search' || !globalSearchResults) return;
  const query = normaliseSearch(globalSearchInput.value);
  const year = globalSearchYear.value;
  const minimumRating = Number(globalSearchRating.value || 0);
  const mediaFilter = globalSearchMedia.value;
  const favouritesOnly = globalSearchFavourite.checked;
  const eligible = gigs.filter((gig) => {
    const mediaCount = gig.media?.length || 0;
    return (!year || String(gig.date || '').startsWith(year))
      && Number(gig.performanceRating || 0) >= minimumRating
      && (!favouritesOnly || gig.favorite)
      && (mediaFilter === 'any' || (mediaFilter === 'with' ? mediaCount > 0 : mediaCount === 0));
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const searchableGigText = (gig) => normaliseSearch([
    gig.artist, gig.venue, gig.city, gig.date, gig.notes, gig.performanceNotes, gig.venueNotes,
    ...(gig.songs || []).flatMap((song) => [song.title, song.artist, song.album, song.info]),
    ...(gig.media || []).flatMap((item) => [item.caption, item.filename, item.recognitionTitle, item.recognitionArtist, item.recognitionAlbum])
  ].join(' '));
  const showMatches = eligible.filter((gig) => !query || searchableGigText(gig).includes(query));
  const showCards = showMatches.map((gig) => {
    const matchingNote = query ? [gig.performanceNotes, gig.venueNotes, gig.notes, ...(gig.media || []).map((item) => item.caption)].find((value) => normaliseSearch(value).includes(query)) : '';
    return `<a class="global-search-card global-search-show" href="/show?id=${encodeURIComponent(gig.id)}"><span class="global-search-type">Show</span><h3>${escapeHtml(gig.artist)}</h3><p>${escapeHtml(gig.venue)} · ${escapeHtml(gig.city)} · ${escapeHtml(formatGigDate(gig.date))}</p>${matchingNote ? `<blockquote>${escapeHtml(String(matchingNote).slice(0, 180))}</blockquote>` : ''}<small>${gig.songs?.length || 0} tracks · ${gig.media?.length || 0} media${gig.performanceRating ? ` · ${gig.performanceRating}/5` : ''}${gig.favorite ? ' · ♥' : ''}</small></a>`;
  });
  let trackCards = [];
  let artistCards = [];
  let placeCards = [];
  let mediaCards = [];
  if (query) {
    trackCards = eligible.flatMap((gig) => (gig.songs || []).filter((song) => normaliseSearch([song.title, song.artist, song.album, song.info].join(' ')).includes(query)).map((song) => `<a class="global-search-card" href="/show?id=${encodeURIComponent(gig.id)}#setlist"><span class="global-search-type">Track</span><h3>${escapeHtml(song.title)}</h3><p>${escapeHtml(gig.artist)} · ${escapeHtml(gig.venue)}</p><small>${escapeHtml(song.album || 'Album unknown')} · ${escapeHtml(formatGigDate(gig.date))}</small></a>`));
    const artists = uniqueSearchResults(eligible.filter((gig) => normaliseSearch(gig.artist).includes(query)), (gig) => normaliseSearch(gig.artist));
    artistCards = artists.map((gig) => { const shows = gigs.filter((entry) => normaliseSearch(entry.artist) === normaliseSearch(gig.artist)).length; return `<a class="global-search-card" href="/artist?name=${encodeURIComponent(gig.artist)}"><span class="global-search-type">Artist</span><h3>${escapeHtml(gig.artist)}</h3><p>${shows} archived show${shows === 1 ? '' : 's'}</p></a>`; });
    const places = uniqueSearchResults(eligible.filter((gig) => normaliseSearch(`${gig.venue} ${gig.city}`).includes(query)), (gig) => `${normaliseSearch(gig.venue)}|${normaliseSearch(gig.city)}`);
    placeCards = places.map((gig) => { const shows = gigs.filter((entry) => normaliseSearch(entry.venue) === normaliseSearch(gig.venue) && normaliseSearch(entry.city) === normaliseSearch(gig.city)).length; return `<a class="global-search-card" href="/venue?name=${encodeURIComponent(gig.venue)}&city=${encodeURIComponent(gig.city)}"><span class="global-search-type">Venue</span><h3>${escapeHtml(gig.venue)}</h3><p>${escapeHtml(gig.city)} · ${shows} show${shows === 1 ? '' : 's'}</p></a>`; });
    mediaCards = eligible.flatMap((gig) => (gig.media || []).filter((item) => item.caption && normaliseSearch(item.caption).includes(query)).map((item) => `<a class="global-search-card" href="/show?id=${encodeURIComponent(gig.id)}#${item.category === 'artifact' ? 'artifacts' : 'media'}"><span class="global-search-type">${item.category === 'artifact' ? 'Artifact' : 'Media'}</span><h3>${escapeHtml(item.caption)}</h3><p>${escapeHtml(gig.artist)} · ${escapeHtml(gig.venue)}</p><small>${escapeHtml(formatGigDate(gig.date))}</small></a>`));
  }
  const total = showCards.length + trackCards.length + artistCards.length + placeCards.length + mediaCards.length;
  globalSearchSummary.textContent = query ? `${total} result${total === 1 ? '' : 's'} for “${globalSearchInput.value.trim()}”` : `${showCards.length} show${showCards.length === 1 ? '' : 's'} match the selected filters`;
  globalSearchResults.innerHTML = total ? `${searchSection('Shows', showCards)}${searchSection('Tracks', trackCards)}${searchSection('Artists', artistCards)}${searchSection('Venues & cities', placeCards)}${searchSection('Media & artifacts', mediaCards)}` : '<div class="empty-state">No archive entries match this search.</div>';
}

function renderGlobalSearch() {
  if (page !== 'search' || !globalSearchInput) return;
  const years = [...new Set(gigs.map((gig) => String(gig.date || '').slice(0, 4)).filter((year) => /^\d{4}$/.test(year)))].sort((a, b) => b.localeCompare(a));
  globalSearchYear.innerHTML = `<option value="">All years</option>${years.map((year) => `<option value="${year}">${year}</option>`).join('')}`;
  const initialQuery = new URLSearchParams(window.location.search).get('q') || '';
  globalSearchInput.value = initialQuery;
  [globalSearchInput, globalSearchYear, globalSearchRating, globalSearchMedia, globalSearchFavourite].forEach((control) => control.addEventListener(control === globalSearchInput ? 'input' : 'change', updateGlobalSearch));
  updateGlobalSearch();
  globalSearchInput.focus();
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

let healthData = null;
let healthFilter = 'all';
const healthTypeLabels = { setlist: 'Setlists', albums: 'Albums', artist: 'Artists', venue: 'Venues', location: 'Map' };

function manualMetadataForm(issue) {
  if (issue.type === 'location') return `<form class="health-manual-form" hidden><div class="health-manual-grid"><label class="health-manual-wide">Venue address<input name="address" placeholder="Street, suburb, city, country" /></label><p class="health-coordinate-divider">Or enter exact coordinates</p><label>Latitude<input name="lat" type="number" min="-90" max="90" step="any" placeholder="-27.4698" /></label><label>Longitude<input name="lng" type="number" min="-180" max="180" step="any" placeholder="153.0251" /></label></div><button class="button" type="submit">Save location</button><button class="button button-secondary health-manual-cancel" type="button">Cancel</button></form>`;
  if (!['artist', 'venue'].includes(issue.type)) return '';
  return `<form class="health-manual-form" hidden><div class="health-manual-grid"><label>Display name<input name="title" value="${escapeHtml(issue.title)}" required /></label><label>Short description<input name="description" placeholder="Optional short description" /></label><label class="health-manual-wide">Biography<textarea name="bio" rows="4" placeholder="Enter the information you want displayed"></textarea></label><label>Photo URL<input name="image" type="url" placeholder="https://…" /></label><label>Source URL<input name="source" type="url" placeholder="https://…" /></label></div><button class="button" type="submit">Save manual entry</button><button class="button button-secondary health-manual-cancel" type="button">Cancel</button></form>`;
}

function renderHealthSnapshot(data) {
  if (!healthSummary || !healthList) return;
  healthData = data;
  const repairable = data.issues.filter((issue) => issue.repairable).length;
  healthSummary.innerHTML = `<article><strong>${data.totalShows}</strong><span>Shows scanned</span></article><article><strong>${data.issues.length}</strong><span>Issues found</span></article><article><strong>${repairable}</strong><span>Can auto-repair</span></article><article class="${data.healthy ? 'is-healthy' : ''}"><strong>${data.healthy ? '✓' : Math.max(0, data.totalShows - new Set(data.issues.filter((issue) => issue.href?.startsWith('/show') || issue.href?.startsWith('/edit')).map((issue) => issue.href)).size)}</strong><span>${data.healthy ? 'Archive healthy' : 'Shows without show-level issues'}</span></article>`;
  const types = ['all', ...Object.keys(healthTypeLabels).filter((type) => data.counts[type])];
  healthFilters.innerHTML = types.map((type) => `<button type="button" class="${type === healthFilter ? 'active' : ''}" data-health-filter="${type}">${type === 'all' ? 'All' : healthTypeLabels[type]} <span>${type === 'all' ? data.issues.length : data.counts[type]}</span></button>`).join('');
  healthFilters.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { healthFilter = button.dataset.healthFilter; renderHealthSnapshot(healthData); }));
  const visible = data.issues.filter((issue) => healthFilter === 'all' || issue.type === healthFilter);
  healthList.innerHTML = visible.length ? visible.map((issue) => `<article class="health-item" data-health-issue="${escapeHtml(issue.id)}"><div class="health-item-copy"><span class="health-type">${escapeHtml(healthTypeLabels[issue.type] || issue.type)}</span><h2>${escapeHtml(issue.title)}</h2><p>${escapeHtml(issue.detail)}</p></div><div class="health-actions"><a class="button button-secondary" href="${escapeHtml(issue.href)}">${['setlist', 'albums'].includes(issue.type) ? 'Edit manually' : 'Open'}</a>${issue.repairable ? '<button class="button health-repair" type="button">Repair</button>' : ''}${['artist', 'venue', 'location'].includes(issue.type) ? '<button class="button button-secondary health-manual-toggle" type="button">Enter manually</button>' : ''}</div>${manualMetadataForm(issue)}</article>`).join('') : `<div class="empty-state">${data.healthy ? 'Everything is in good shape.' : 'No issues match this filter.'}</div>`;
  healthList.querySelectorAll('.health-repair').forEach((button) => {
    const issue = visible.find((entry) => entry.id === button.closest('.health-item').dataset.healthIssue);
    button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = 'Repairing…'; healthMessage.textContent = `Repairing ${issue.title}…`;
      try { renderHealthSnapshot(await fetchJson('/api/health/repair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(issue) })); healthMessage.textContent = `${issue.title} checked.`; }
      catch (error) { button.disabled = false; button.textContent = 'Retry'; healthMessage.textContent = error.message; healthMessage.classList.add('error'); }
    });
  });
  healthList.querySelectorAll('.health-manual-toggle').forEach((button) => button.addEventListener('click', () => {
    const form = button.closest('.health-item').querySelector('.health-manual-form');
    form.hidden = !form.hidden;
    button.textContent = form.hidden ? 'Enter manually' : 'Close manual entry';
    if (!form.hidden) form.querySelector('input, textarea')?.focus();
  }));
  healthList.querySelectorAll('.health-manual-cancel').forEach((button) => button.addEventListener('click', () => {
    const card = button.closest('.health-item'); card.querySelector('.health-manual-form').hidden = true; card.querySelector('.health-manual-toggle').textContent = 'Enter manually';
  }));
  healthList.querySelectorAll('.health-manual-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const issue = visible.find((entry) => entry.id === form.closest('.health-item').dataset.healthIssue);
    const submit = form.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = 'Saving…';
    healthMessage.classList.remove('error'); healthMessage.textContent = `Saving ${issue.title}…`;
    try {
      const manual = Object.fromEntries(new FormData(form).entries());
      renderHealthSnapshot(await fetchJson('/api/health/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...issue, ...manual }) }));
      healthMessage.textContent = `${issue.title} saved.`;
    } catch (error) { submit.disabled = false; submit.textContent = 'Retry save'; healthMessage.textContent = error.message; healthMessage.classList.add('error'); }
  }));
  repairAllMetadata.disabled = !repairable;
}

async function renderArchiveHealth() {
  if (page !== 'health' || !healthList) return;
  try { renderHealthSnapshot(await fetchJson('/api/health')); }
  catch (error) { healthMessage.textContent = error.message; healthMessage.classList.add('error'); }
}

repairAllMetadata?.addEventListener('click', async () => {
  const repairable = (healthData?.issues || []).filter((issue) => issue.repairable);
  if (!repairable.length) return;
  repairAllMetadata.disabled = true;
  healthMessage.classList.remove('error');
  let latest = healthData;
  for (const [index, issue] of repairable.entries()) {
    repairAllMetadata.textContent = `${index + 1} / ${repairable.length}`;
    healthMessage.textContent = `Repairing ${issue.title}…`;
    try { latest = await fetchJson('/api/health/repair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(issue) }); }
    catch (error) { healthMessage.textContent = `${issue.title}: ${error.message}`; healthMessage.classList.add('error'); }
  }
  renderHealthSnapshot(latest);
  repairAllMetadata.textContent = 'Repair all available';
  healthMessage.textContent = latest.issues.length ? 'Metadata repair pass complete. Some records may still need manual attention.' : 'Metadata repair complete. The archive is healthy.';
});

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
    renderAttendeeSummary(card.querySelector('.gig-summary'), gig);
    setupShowMediaSection(card, (gig.media || []).filter((item) => item.category !== 'artifact'), { songs: gig.songs || [] });
    card.querySelectorAll('.artifact-section, .add-artifact-gig').forEach((element) => element.remove());
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
      state.onDrained = async () => { await pollMediaRecognition(gig.id, (refreshed) => renderEditMediaWorkspace(gig, refreshed)); };
      startMobileUploadQueue(editMediaInput, gig.id, state.onUploaded, state.onDrained);
    } else editMediaInput.addEventListener('change', async () => { const files = pendingMedia.get(editMediaInput) || [...(editMediaInput.files || [])]; if (!files.length) return; editMessage.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`; try { await uploadGigMedia(gig.id, files, (file, fraction) => { editMessage.textContent = `Uploading ${file.name} · ${Math.round(fraction * 100)}%`; }); pendingMedia.set(editMediaInput, []); editMediaInput.value = ''; editMessage.textContent = 'Media uploaded.'; const refreshed = await fetchJson(`/api/gigs/${gig.id}/media`); renderEditMediaWorkspace(gig, refreshed); } catch (error) { editMessage.textContent = error.message; editMessage.classList.add('error'); } });
  }
  editForm.elements.artist.value = gig.artist;
  editForm.elements.date.value = gig.date;
  editForm.elements.venue.value = gig.venue;
  editForm.elements.city.value = gig.city;
  showDuplicateWarning(editDuplicateWarning, Object.fromEntries(new FormData(editForm).entries()), gig.id);
  let tracks = [...(gig.songs || [])];
  const syncTracksFromInputs = () => {
    tracks = [...editSetlistTracks.querySelectorAll('.edit-track')].map((row, index) => ({
      ...(tracks[index] || {}),
      title: row.querySelector('.edit-track-title').value,
      artist: row.querySelector('.edit-track-artist').value,
      album: row.querySelector('.edit-track-album').value
    }));
  };
  const clearTrackDropIndicators = () => editSetlistTracks.querySelectorAll('.edit-track').forEach((row) => row.classList.remove('is-dragging', 'drop-before', 'drop-after'));
  const moveTrack = (sourceIndex, targetIndex, placeAfter = false) => {
    syncTracksFromInputs();
    let insertionIndex = targetIndex + (placeAfter ? 1 : 0);
    const [movedTrack] = tracks.splice(sourceIndex, 1);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    insertionIndex = Math.max(0, Math.min(tracks.length, insertionIndex));
    tracks.splice(insertionIndex, 0, movedTrack);
    renderTracks();
    editSetlistTracks.querySelectorAll('.edit-track-drag')[insertionIndex]?.focus();
  };
  const wireTrackReordering = () => {
    let draggedIndex = null;
    let nativeDropTarget = null;
    let nativeDropCompleted = false;
    let pointerTarget = null;
    let pointerMoved = false;
    const showDropTarget = (row, placeAfter) => {
      editSetlistTracks.querySelectorAll('.edit-track').forEach((entry) => entry.classList.remove('drop-before', 'drop-after'));
      row?.classList.add(placeAfter ? 'drop-after' : 'drop-before');
      return row ? { index: Number(row.dataset.trackIndex), placeAfter } : null;
    };
    editSetlistTracks.querySelectorAll('.edit-track').forEach((row) => {
      const handle = row.querySelector('.edit-track-drag');
      handle.addEventListener('dragstart', (event) => {
        draggedIndex = Number(row.dataset.trackIndex);
        nativeDropTarget = null;
        nativeDropCompleted = false;
        row.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(draggedIndex));
      });
      row.addEventListener('dragover', (event) => {
        if (draggedIndex === null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const placeAfter = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
        nativeDropTarget = showDropTarget(row, placeAfter);
      });
      row.addEventListener('drop', (event) => {
        if (draggedIndex === null) return;
        event.preventDefault();
        const sourceIndex = draggedIndex;
        const placeAfter = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
        const targetIndex = Number(row.dataset.trackIndex);
        nativeDropCompleted = true;
        clearTrackDropIndicators();
        draggedIndex = null;
        moveTrack(sourceIndex, targetIndex, placeAfter);
      });
      handle.addEventListener('dragend', () => {
        const sourceIndex = draggedIndex;
        const destination = nativeDropTarget;
        draggedIndex = null;
        nativeDropTarget = null;
        clearTrackDropIndicators();
        if (!nativeDropCompleted && sourceIndex !== null && destination) moveTrack(sourceIndex, destination.index, destination.placeAfter);
      });
      handle.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        draggedIndex = Number(row.dataset.trackIndex);
        pointerTarget = null;
        pointerMoved = false;
        handle.setPointerCapture(event.pointerId);
        row.classList.add('is-dragging');
      });
      handle.addEventListener('pointermove', (event) => {
        if (draggedIndex === null || event.pointerType === 'mouse') return;
        pointerMoved = true;
        const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest('.edit-track');
        if (!targetRow || !editSetlistTracks.contains(targetRow)) { pointerTarget = null; return; }
        const placeAfter = event.clientY > targetRow.getBoundingClientRect().top + targetRow.offsetHeight / 2;
        pointerTarget = showDropTarget(targetRow, placeAfter);
      });
      const finishPointerDrag = (event, cancelled = false) => {
        if (draggedIndex === null || event.pointerType === 'mouse') return;
        const sourceIndex = draggedIndex;
        const destination = pointerTarget;
        draggedIndex = null;
        pointerTarget = null;
        clearTrackDropIndicators();
        if (!cancelled && pointerMoved && destination) moveTrack(sourceIndex, destination.index, destination.placeAfter);
      };
      handle.addEventListener('pointerup', (event) => finishPointerDrag(event));
      handle.addEventListener('pointercancel', (event) => finishPointerDrag(event, true));
      handle.addEventListener('keydown', (event) => {
        const sourceIndex = Number(row.dataset.trackIndex);
        if (event.key === 'ArrowUp' && sourceIndex > 0) { event.preventDefault(); moveTrack(sourceIndex, sourceIndex - 1); }
        if (event.key === 'ArrowDown' && sourceIndex < tracks.length - 1) { event.preventDefault(); moveTrack(sourceIndex, sourceIndex + 1, true); }
      });
    });
  };
  const renderTracks = () => {
    editSetlistTracks.innerHTML = tracks.map((song, index) => `<div class="edit-track" data-track-index="${index}"><button class="edit-track-drag" type="button" draggable="true" aria-label="Reorder track ${index + 1}. Drag or use arrow keys" title="Drag to reorder · arrow keys also work">⠿</button><span class="edit-track-number">${index + 1}</span><input class="edit-track-title" value="${escapeHtml(song.title || '')}" placeholder="Track title" /><input class="edit-track-artist" value="${escapeHtml(song.artist || '')}" placeholder="Artist (optional)" /><input class="edit-track-album" value="${escapeHtml(song.album || '')}" placeholder="Album (optional)" /><button class="icon-button edit-track-remove" type="button" aria-label="Remove track">×</button></div>`).join('');
    editSetlistTracks.querySelectorAll('.edit-track-remove').forEach((button) => button.addEventListener('click', () => {
      const trackIndex = Number(button.closest('.edit-track').dataset.trackIndex);
      syncTracksFromInputs();
      tracks.splice(trackIndex, 1);
      renderTracks();
    }));
    wireTrackReordering();
  };
  renderTracks();
  addEditTrack.onclick = () => {
    syncTracksFromInputs();
    tracks.push({ title: '', artist: editForm.elements.artist.value || gig.artist, album: '' });
    renderTracks();
    editSetlistTracks.lastElementChild?.querySelector('.edit-track-title')?.focus();
  };
  renderEditMediaWorkspace(gig, gig.media);
  renderAttendeePicker(ensureEditAttendeePicker(), gig.attendees || []);
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = editForm.querySelector('button[type="submit"]');
    try {
      if (!confirmDuplicateSave(editDuplicateWarning, Object.fromEntries(new FormData(editForm).entries()), gig.id)) return;
      submitButton.disabled = true;
      const update = Object.fromEntries(new FormData(editForm).entries());
      update.attendees = readAttendees(ensureEditAttendeePicker());
      syncTracksFromInputs();
      update.songs = tracks;
      const saved = await fetchJson(`/api/gigs/${gig.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
      const files = pendingMedia.get(editMediaInput) || [...(editMediaInput?.files || [])];
      if (files.length) await uploadGigMedia(gig.id, files, (file, fraction) => { editMessage.textContent = fraction >= 1 ? `Upload complete · preparing mobile playback for ${file.name}…` : `Uploading ${file.name} · ${Math.round(fraction * 100)}%`; });
      await addYouTubeMedia(gig.id, editYoutubeMediaInput);
      Object.assign(gig, saved);
      gigs = gigs.map((entry) => entry.id === gig.id ? gig : entry);
      editMessage.textContent = files.length ? 'Show and media saved.' : 'Show saved.';
      editMessage.classList.remove('error');
      editMediaInput.value = '';
      const refreshed = await fetchJson(`/api/gigs/${gig.id}/media`);
      renderEditMediaWorkspace(gig, refreshed);
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
  const attendeesLine = document.querySelector('#show-detail-attendees');
  const names = attendeeNames(gig);
  attendeesLine.textContent = names.length > 1 ? `Attended with ${names.slice(1).join(', ')}` : 'Solo show';
  showDetailRatings.innerHTML = gig.performanceRating ? `<span><b>${gig.performanceRating}</b> / 5 stars</span>` : '<span>Not rated yet</span>';
  showDetailSetlist.innerHTML = gig.songs?.length ? `<ol>${renderTrackList(gig.songs)}</ol>${renderAlbumStats(gig.songs)}` : '<p>No setlist attached.</p>';
  if (gig.songs?.length) fetchJson(`/api/gigs/${encodeURIComponent(gig.id)}/album-stats`).then((data) => { gig.songs = data.songs; showDetailSetlist.innerHTML = `<ol>${renderTrackList(gig.songs)}</ol>${renderAlbumStats(gig.songs)}`; }).catch(() => {});
  showEditLink.href = `/edit?id=${encodeURIComponent(gig.id)}`;
  const generalMedia = (gig.media || []).filter((item) => item.category !== 'artifact');
  const artifacts = (gig.media || []).filter((item) => item.category === 'artifact');
  showDetailNoMedia.hidden = Boolean(generalMedia.length);
  showDetailNoArtifacts.hidden = Boolean(artifacts.length);
  showNavTrackCount.textContent = gig.songs?.length ? String(gig.songs.length) : '';
  showNavMediaCount.textContent = generalMedia.length ? String(generalMedia.length) : '';
  showNavArtifactCount.textContent = artifacts.length ? String(artifacts.length) : '';
  showMemoryFacts.innerHTML = `<span><b>${gig.performanceRating || '—'}</b> rating</span><span><b>${gig.songs?.length || 0}</b> tracks</span><span><b>${generalMedia.length}</b> media</span><span><b>${artifacts.length}</b> artifacts</span><span><b>${Math.max(names.length, 1)}</b> attendee${Math.max(names.length, 1) === 1 ? '' : 's'}</span>`;
  // Keep the gallery manageable from the show page too, including YouTube videos
  // attached by the setlist search.
  renderMediaGallery(showDetailGallery, generalMedia, { editable: true, songs: gig.songs || [] });
  renderMediaGallery(showDetailArtifacts, artifacts, { editable: true, allowCover: false, songs: gig.songs || [] });
  if (page === 'playback' || new URLSearchParams(window.location.search).get('play') === '1') setTimeout(() => playWholeSet?.click(), 0);
}

function renderAlbumStats(songs) {
  const counts = new Map();
  songs.forEach((song) => { const album = String(song.album || 'Unknown album').trim() || 'Unknown album'; counts.set(album, (counts.get(album) || 0) + 1); });
  const total = songs.length;
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return `<div class="album-stats"><p class="eyebrow">Album breakdown</p><div class="album-stat-bar album-stat-bar-stacked">${entries.map(([album, count], index) => `<span class="album-segment album-segment-${index % 8}" style="width:${count / total * 100}%" title="${escapeHtml(album)} · ${Math.round(count / total * 100)}%"></span>`).join('')}</div><div class="album-stat-key">${entries.map(([album, count], index) => `<span><i class="album-key-swatch album-segment-${index % 8}"></i>${escapeHtml(album)} <strong>${Math.round(count / total * 100)}%</strong></span>`).join('')}</div></div>`;
}

function renderTrackList(songs, albumFallback = 'Album data unavailable') {
  return songs.map((song) => { const album = String(song.album || albumFallback).trim() || albumFallback; return `<li tabindex="0"><span class="track-title">${escapeHtml(song.title)}</span><span class="album-tooltip">${escapeHtml(album)}</span>${song.encore ? ' <b>Encore</b>' : ''}</li>`; }).join('');
}

function setupArchiveSetlist(setlist, gig, { fetchAlbums = true } = {}) {
  const source = gig.setlistFmUrl ? `<a href="${escapeHtml(gig.setlistFmUrl)}" target="_blank" rel="noreferrer">View source on setlist.fm ↗</a>` : '';
  const tracks = () => `<ol>${renderTrackList(gig.songs || [], fetchAlbums ? 'Loading album…' : 'Album data unavailable')}</ol>${source}`;
  setlist.innerHTML = `<details class="setlist-accordion"><summary>Setlist <span>${gig.songs.length} tracks</span></summary><div class="setlist-accordion-content">${tracks()}</div></details>`;
  const needsAlbumLookup = gig.songs.some((song) => !String(song.album || '').trim() || /^unknown album$/i.test(String(song.album).trim()));
  if (!fetchAlbums || !needsAlbumLookup) return;
  const details = setlist.querySelector('.setlist-accordion');
  details.addEventListener('toggle', async () => {
    if (!details.open || details.dataset.albumLoad) return;
    details.dataset.albumLoad = 'loading';
    try {
      const data = await fetchJson(`/api/gigs/${encodeURIComponent(gig.id)}/album-stats`);
      gig.songs = data.songs;
      details.querySelector('.setlist-accordion-content').innerHTML = tracks();
      details.dataset.albumLoad = 'complete';
    } catch {
      details.dataset.albumLoad = 'error';
      details.querySelectorAll('.album-tooltip').forEach((tooltip) => { if (tooltip.textContent === 'Loading album…') tooltip.textContent = 'Album data unavailable'; });
    }
  });
}

document.addEventListener('click', (event) => {
  const track = event.target.closest('.setlist li[tabindex]');
  document.querySelectorAll('.setlist li.tooltip-open').forEach((item) => { if (item !== track) item.classList.remove('tooltip-open'); });
  if (track) track.classList.toggle('tooltip-open');
});
document.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const track = event.target.closest('.setlist li[tabindex]');
  if (!track) return;
  event.preventDefault();
  track.click();
});

function stopYoutubeTimelinePolling() { if (youtubeTimelineTimer) { clearInterval(youtubeTimelineTimer); youtubeTimelineTimer = null; } }
function clearSetSourceLoadTimer() { if (setSourceLoadTimer) { clearTimeout(setSourceLoadTimer); setSourceLoadTimer = null; } }
function activateSetSource(entry, sourceIndex = 0) {
  entry.sourceIndex = Math.max(0, Math.min(sourceIndex, Math.max(0, (entry.sources || []).length - 1)));
  const source = entry.sources?.[entry.sourceIndex] || null;
  entry.media = source?.media || null;
  entry.clip = source?.clip || null;
  return source;
}
function setQueueEntryTitle(gig, entry) {
  return entry?.isUnknown ? 'Unknown' : gig?.songs?.[entry?.songIndex]?.title || 'Unknown';
}
function setQueueEntryKey(entry) {
  if (!entry?.isUnknown) return `song:${entry?.songIndex}`;
  const bounds = playbackBounds(entry);
  return `unknown:${entry.media?.id || ''}:${bounds.start}:${bounds.end ?? ''}`;
}
function unknownSetQueueEntry(media, startSeconds, endSeconds) {
  const clip = { songIndex: null, startSeconds, endSeconds, priority: 0 };
  const source = { media, clip };
  return { isUnknown: true, songIndex: null, sources: [source], sourceIndex: 0, media, clip };
}
function buildSetPlaybackQueue(gig) {
  const baseQueue = (gig?.songs || []).map((song, songIndex) => {
    const entry = { songIndex, sources: playbackSourcesForSong(gig, songIndex), sourceIndex: 0, media: null, clip: null };
    activateSetSource(entry, 0);
    return entry;
  });
  const queue = [];
  let previousPlayable = null;
  baseQueue.forEach((entry) => {
    if (entry.media) {
      const currentBounds = playbackBounds(entry);
      if (!previousPlayable && currentBounds.start > .5) queue.push(unknownSetQueueEntry(entry.media, 0, currentBounds.start));
      if (previousPlayable?.media?.id === entry.media.id) {
        const previousBounds = playbackBounds(previousPlayable);
        if (previousBounds.end !== null && currentBounds.start > previousBounds.end + .5) queue.push(unknownSetQueueEntry(entry.media, previousBounds.end, currentBounds.start));
      }
      previousPlayable = entry;
    }
    queue.push(entry);
  });
  if (previousPlayable) {
    const bounds = playbackBounds(previousPlayable);
    const sourceDuration = Number(previousPlayable.media?.sourceDuration) || 0;
    if (bounds.end !== null && sourceDuration > bounds.end + .5) queue.push(unknownSetQueueEntry(previousPlayable.media, bounds.end, sourceDuration));
  }
  return queue;
}
function failSetSource(reason = 'Source unavailable') {
  if (setFallbackPending) return;
  const entry = setQueue[setQueueIndex];
  if (!entry?.media) return;
  clearSetSourceLoadTimer();
  stopYoutubeTimelinePolling();
  const nextSourceIndex = (entry.sourceIndex || 0) + 1;
  if (nextSourceIndex < (entry.sources || []).length) {
    setFallbackPending = true;
    activateSetSource(entry, nextSourceIndex);
    entry.fallbackNotice = `${reason}; using backup ${nextSourceIndex}`;
    pendingSetSeek = { index: setQueueIndex, fraction: 0 };
    playSetTrack();
    return;
  }
  setFallbackPending = true;
  setPlayerStatus.textContent = `${reason}; no backups remain. Skipping…`;
  const failedEntry = entry;
  setTimeout(() => { if (setQueue[setQueueIndex] === failedEntry) { setFallbackPending = false; moveToPlayableTrack(1); } }, 900);
}
function armSetSourceLoadTimer() {
  clearSetSourceLoadTimer();
  const entry = setQueue[setQueueIndex];
  const mediaId = entry?.media?.id;
  setSourceLoadTimer = setTimeout(() => { if (setQueue[setQueueIndex] === entry && entry.media?.id === mediaId) failSetSource('Video timed out'); }, 12000);
}
function nextPlayableSetIndex(start, direction = 1) {
  for (let index = start; index >= 0 && index < setQueue.length; index += direction) if (setQueue[index]?.media) return index;
  return -1;
}
function finishSetPlayback(gig) {
  stopYoutubeTimelinePolling();
  clearSetSourceLoadTimer();
  clearPlaybackResume(gig);
  releaseSetPlaybackWakeLock();
  setPlayerStatus.textContent = 'End of available set.';
  setPlayerSourceKind.textContent = 'Set complete';
  setPlayerSourceLabel.textContent = `${gig.songs.length} tracks in this playback plan`;
  setPlayerProgress.style.width = '100%';
  setPlayerOverviewProgress.style.width = '100%';
  revealTheatreControls({ schedule: false });
}
function continueSameSetSource(gig, index) {
  const entry = setQueue[index];
  setQueueIndex = index;
  pendingSetSeek = null;
  setTrackAdvancePending = false;
  setPlayerTitle.textContent = entry.isUnknown ? 'Unknown' : `${entry.songIndex + 1}. ${setQueueEntryTitle(gig, entry)}`;
  updateSetTheatreMeta(gig, entry);
  renderSetTimeline(gig);
  setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · continuous video`;
  const requestedStart = entry.clip?.startSeconds ?? entry.media?.playbackStart;
  if (requestedStart !== null && requestedStart !== undefined && requestedStart !== '') {
    const start = Math.max(0, Number(requestedStart) || 0);
    const video = setPlayerStage.querySelector('video.set-player-current');
    if (video && Math.abs(video.currentTime - start) > .75) video.currentTime = start;
    else if (activeYoutubePlayer?.getCurrentTime && activeYoutubePlayer?.seekTo && Math.abs(Number(activeYoutubePlayer.getCurrentTime()) - start) > .75) activeYoutubePlayer.seekTo(start, true);
  }
  if (entry.media?.mimeType === 'video/youtube') startYoutubeTimelinePolling(gig);
}
function moveToPlayableTrack(direction = 1, continuous = false) {
  clearSetSourceLoadTimer();
  const gig = gigs.find((entry) => entry.id === showDetailId);
  const expected = setQueueIndex + direction;
  const index = nextPlayableSetIndex(expected, direction);
  if (index < 0) { if (direction > 0 && gig) finishSetPlayback(gig); return; }
  const skipped = Math.abs(index - expected);
  if (continuous && gig && setQueue[setQueueIndex]?.media?.id === setQueue[index]?.media?.id) { continueSameSetSource(gig, index); return; }
  setQueueIndex = index;
  pendingSetSeek = { index, fraction: 0 };
  playSetTrack();
  if (skipped) setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · skipped ${skipped} missing track${skipped === 1 ? '' : 's'}`;
}
function startYoutubeTimelinePolling(gig) {
  stopYoutubeTimelinePolling();
  youtubeTimelineTimer = setInterval(() => {
    if (!activeYoutubePlayer?.getDuration || !activeYoutubePlayer?.getCurrentTime) return;
    const duration = Number(activeYoutubePlayer.getDuration()) || 0;
    const current = Number(activeYoutubePlayer.getCurrentTime()) || 0;
    if (duration <= 0) return;
    const entry = setQueue[setQueueIndex];
    const fraction = playbackFraction(entry, current, duration);
    setTimelineProgress(gig, fraction, current, duration);
    savePlaybackResume(gig, fraction);
    const bounds = playbackBounds(entry, duration);
    if (!setTrackAdvancePending && bounds.end && current >= bounds.end - .2) {
      setTrackAdvancePending = true;
      moveToPlayableTrack(1, true);
    }
  }, 250);
}
function advanceUploadedSetTrack(video, nextIndex) {
  if (setTrackAdvancePending) return;
  setTrackAdvancePending = true;
  const next = nextIndex >= 0 ? setQueue[nextIndex] : null;
  const gig = gigs.find((entry) => entry.id === showDetailId);
  if (next && gig && next.media?.id === setQueue[setQueueIndex]?.media?.id) { continueSameSetSource(gig, nextIndex); return; }
  const nextVideo = setPlayerStage.querySelector('video.set-player-preload');
  if (!next || !nextVideo || next.media?.mimeType === 'video/youtube') { moveToPlayableTrack(1); return; }
  const beginCrossfade = () => {
    nextVideo.currentTime = playbackTimeAt(next, 0, nextVideo.duration);
    nextVideo.classList.add('set-player-fading-in');
    video.classList.add('set-player-fading-out');
    nextVideo.muted = false;
    nextVideo.play().catch(() => {});
    setTimeout(() => { const fraction = playbackFraction(next, nextVideo.currentTime, nextVideo.duration); setQueueIndex = nextIndex; pendingSetSeek = { index: nextIndex, fraction }; playSetTrack(); }, 650);
  };
  if (nextVideo.readyState >= 1) beginCrossfade(); else nextVideo.addEventListener('loadedmetadata', beginCrossfade, { once: true });
}
function installPlayerStageNavigation() {
  const previous = document.createElement('button');
  const next = document.createElement('button');
  const reveal = document.createElement('button');
  previous.type = next.type = 'button';
  reveal.type = 'button';
  previous.className = 'set-player-swipe-zone is-previous'; next.className = 'set-player-swipe-zone is-next';
  reveal.className = 'set-player-controls-reveal';
  previous.setAttribute('aria-label', 'Previous available track'); next.setAttribute('aria-label', 'Next available track');
  reveal.setAttribute('aria-label', 'Show playback controls');
  previous.textContent = '‹'; next.textContent = '›';
  reveal.textContent = 'Show controls';
  reveal.addEventListener('click', () => revealTheatreControls());
  setPlayerStage.append(previous, next, reveal);
  [previous, next].forEach((zone) => {
    let startX = 0; let swiped = false;
    zone.addEventListener('pointerdown', (event) => { startX = event.clientX; swiped = false; zone.setPointerCapture?.(event.pointerId); });
    zone.addEventListener('pointerup', (event) => {
      const delta = event.clientX - startX;
      if (Math.abs(delta) >= 36) { swiped = true; moveToPlayableTrack(delta < 0 ? 1 : -1); }
    });
    zone.addEventListener('click', () => { if (swiped) { swiped = false; return; } moveToPlayableTrack(zone.classList.contains('is-next') ? 1 : -1); });
  });
}
function playSetTrack() {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  const entry = setQueue[setQueueIndex];
  stopYoutubeTimelinePolling();
  clearSetSourceLoadTimer();
  setFallbackPending = false;
  setTrackAdvancePending = false;
  if (!gig || !entry) { if (gig) finishSetPlayback(gig); return; }
  const song = entry.isUnknown ? { title: 'Unknown' } : gig.songs[entry.songIndex];
  setPlayer.hidden = false;
  setPlayerTitle.textContent = entry.isUnknown ? 'Unknown' : `${entry.songIndex + 1}. ${song.title}`;
  updateSetTheatreMeta(gig, entry);
  renderSetTimeline(gig);
  if (!entry.media) {
    setPlayerStage.innerHTML = `<div class="set-player-gap"><span>◇</span><strong>No video for this track</strong><small>Skipping to the next available song…</small></div>`;
    setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · gap`;
    setTimeout(() => { if (setQueue[setQueueIndex] === entry) moveToPlayableTrack(1); }, 700);
    return;
  }
  setPlayerStatus.textContent = entry.fallbackNotice ? `${setQueueIndex + 1} of ${setQueue.length} · ${entry.fallbackNotice}` : `${setQueueIndex + 1} of ${setQueue.length}${entry.sourceIndex ? ` · backup ${entry.sourceIndex}` : ''}`;
  entry.fallbackNotice = '';
  const seekFraction = pendingSetSeek?.index === setQueueIndex ? pendingSetSeek.fraction : 0;
  pendingSetSeek = { index: setQueueIndex, fraction: seekFraction };
  const youtubeIframe = activeYoutubePlayer?.getIframe?.();
  if (entry.media.mimeType === 'video/youtube' && activeYoutubePlayer && youtubeIframe?.isConnected) {
    const parsed = new URL(entry.media.url);
    const videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
    activeYoutubeVideoId = videoId;
    armSetSourceLoadTimer();
    activeYoutubePlayer.loadVideoById({ videoId, startSeconds: playbackBounds(entry).start });
    return;
  }
  if (activeYoutubePlayer) { try { activeYoutubePlayer.destroy(); } catch {} activeYoutubePlayer = null; activeYoutubeVideoId = ''; }
  const nextIndex = nextPlayableSetIndex(setQueueIndex + 1, 1);
  const next = nextIndex >= 0 ? setQueue[nextIndex] : null;
  const currentMarkup = entry.media.mimeType === 'video/youtube'
    ? `<iframe src="${youtubeEmbedUrl(entry.media.url)}" title="${escapeHtml(song.title)}" allowfullscreen></iframe>`
    : `<video class="set-player-current" src="${entry.media.url}" controls autoplay playsinline></video>`;
  const preloadMarkup = next?.media?.id === entry.media.id ? '' : next?.media?.mimeType === 'video/youtube'
    ? `<iframe class="set-player-preload" src="${youtubeEmbedUrl(next.media.url)}" title="Preloaded next track" aria-hidden="true"></iframe>`
    : next?.media ? `<video class="set-player-preload" src="${next.media.url}" preload="auto" muted playsinline></video>` : '';
  setPlayerStage.innerHTML = `${currentMarkup}${preloadMarkup}`;
  installPlayerStageNavigation();
  armSetSourceLoadTimer();
  const video = setPlayerStage.querySelector('video.set-player-current');
  if (video) video.addEventListener('loadedmetadata', () => { clearSetSourceLoadTimer(); applySetSeek(gig, seekFraction); }, { once: true });
  if (video) video.addEventListener('playing', () => { clearSetSourceLoadTimer(); scheduleTheatreControls(); });
  if (video) video.addEventListener('pause', () => revealTheatreControls({ schedule: false }));
  if (video) video.addEventListener('error', () => failSetSource('Uploaded video failed'), { once: true });
  if (video) video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const activeEntry = setQueue[setQueueIndex];
    const fraction = playbackFraction(activeEntry, video.currentTime, video.duration);
    setTimelineProgress(gig, fraction, video.currentTime, video.duration);
    savePlaybackResume(gig, fraction);
    const bounds = playbackBounds(activeEntry, video.duration);
    const activeNextIndex = nextPlayableSetIndex(setQueueIndex + 1, 1);
    if (!setTrackAdvancePending && bounds.end && video.currentTime >= bounds.end - .08) advanceUploadedSetTrack(video, activeNextIndex);
  });
  if (video) video.play().catch(() => { setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · Press play to continue`; });
  if (video) video.addEventListener('ended', () => advanceUploadedSetTrack(video, nextPlayableSetIndex(setQueueIndex + 1, 1)));
  const youtubeFrame = setPlayerStage.querySelector('iframe:not(.set-player-preload)');
  if (youtubeFrame) {
    youtubeFrame.id = `set-player-youtube-${Date.now()}`;
    loadYouTubeApi().then((YT) => {
      activeYoutubePlayer = new YT.Player(youtubeFrame.id, { events: {
        onReady: (event) => { clearSetSourceLoadTimer(); applySetSeek(gig, seekFraction); event.target.playVideo(); startYoutubeTimelinePolling(gig); },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING) { clearSetSourceLoadTimer(); if (pendingSetSeek?.index === setQueueIndex) applySetSeek(gig, pendingSetSeek.fraction); startYoutubeTimelinePolling(gig); scheduleTheatreControls(); }
          if (event.data === YT.PlayerState.PAUSED) revealTheatreControls({ schedule: false });
          if (event.data === YT.PlayerState.ENDED && !setTrackAdvancePending) { setTrackAdvancePending = true; moveToPlayableTrack(1, true); }
        },
        onError: () => failSetSource('YouTube source unavailable')
      } });
    }).catch(() => failSetSource('YouTube player unavailable'));
  }
}

playWholeSet?.addEventListener('click', () => {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  setQueue = buildSetPlaybackQueue(gig);
  if (!setQueue.some((entry) => entry.media)) { setPlayer.hidden = false; setPlayerStatus.textContent = 'Assign media to setlist tracks first.'; return; }
  const resume = readPlaybackResume(gig);
  setQueueIndex = resume?.index ?? nextPlayableSetIndex(0, 1);
  if (resume) activateSetSource(setQueue[setQueueIndex], resume.sourceIndex);
  pendingSetSeek = { index: setQueueIndex, fraction: resume?.fraction ?? 0 };
  playSetTrack();
  if (resume) setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · resumed`;
});
setPlayerNext?.addEventListener('click', () => moveToPlayableTrack(1));
setPlayerPrev.addEventListener('click', () => moveToPlayableTrack(-1));
setPlayerRestart.addEventListener('click', () => {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  if (!gig) return;
  clearPlaybackResume(gig);
  setQueue.forEach((entry) => activateSetSource(entry, 0));
  setQueueIndex = nextPlayableSetIndex(0, 1);
  pendingSetSeek = { index: setQueueIndex, fraction: 0 };
  playSetTrack();
});
async function toggleSetTheatre() {
  if (!document.fullscreenElement) await setPlayer.requestFullscreen?.();
  else await document.exitFullscreen?.();
}
setPlayerFullscreen?.addEventListener('click', toggleSetTheatre);
setPlayerControlsToggle.addEventListener('click', () => {
  if (setPlayer.classList.contains('theatre-idle')) revealTheatreControls();
  else setPlayer.classList.add('theatre-idle');
});
setPlayer.addEventListener('pointermove', () => revealTheatreControls());
setPlayer.addEventListener('pointerdown', () => revealTheatreControls());
setPlayer.addEventListener('focusin', () => revealTheatreControls({ schedule: false }));
document.addEventListener('fullscreenchange', () => {
  const inTheatre = document.fullscreenElement === setPlayer;
  revealTheatreControls();
  setPlayerFullscreen.textContent = inTheatre ? '↙ Exit theatre' : '⛶ Theatre';
  setPlayerControlsToggle.setAttribute('aria-label', inTheatre ? 'Show or hide playback controls' : 'Playback controls');
  if (inTheatre) requestSetPlaybackWakeLock(); else releaseSetPlaybackWakeLock();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.fullscreenElement === setPlayer) requestSetPlaybackWakeLock();
});
window.addEventListener('pagehide', releaseSetPlaybackWakeLock);
document.addEventListener('keydown', (event) => {
  if (setPlayer.hidden || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  const inTheatre = document.fullscreenElement === setPlayer;
  if (!inTheatre && key !== 'f') return;
  if (key === 'arrowright') { event.preventDefault(); moveToPlayableTrack(1); }
  else if (key === 'arrowleft') { event.preventDefault(); moveToPlayableTrack(-1); }
  else if (key === ' ' || key === 'k') { event.preventDefault(); toggleSetPlayback(); }
  else if (key === 'm') { event.preventDefault(); toggleSetMute(); }
  else if (key === 'f') { event.preventDefault(); toggleSetTheatre(); }
  revealTheatreControls();
});

findYouTubeSet.addEventListener('click', async () => {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  if (!gig?.songs?.length) { youtubeSearchMessage.textContent = 'Add a setlist before searching YouTube.'; return; }
  findYouTubeSet.disabled = true; findYouTubeSet.textContent = 'Searching YouTube…'; youtubeSearchMessage.textContent = ''; youtubeResults.replaceChildren();
  try {
    const payload = await fetchJson(`/api/gigs/${gig.id}/youtube-search`, { method: 'POST' });
    youtubeResults.innerHTML = payload.matches.map((match) => `<article class="youtube-match" data-song-index="${match.index}"><h3>${escapeHtml(match.title)}</h3><div class="youtube-match-options">${match.results.map((result) => `<div class="youtube-result" data-youtube-description="${escapeHtml(result.description || '')}"><img src="${escapeHtml(result.thumbnail)}" alt="" /><div><p>${escapeHtml(result.title)}</p><small>${escapeHtml(result.channel)}</small><button type="button" data-youtube-url="https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}">Add to other media</button></div></div>`).join('') || '<p>No matching videos found.</p>'}</div></article>`).join('');
    youtubeResults.querySelectorAll('[data-youtube-url]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = 'Adding…';
      const match = button.closest('.youtube-match');
      const songIndex = Number(match?.dataset.songIndex);
      const result = button.closest('.youtube-result');
      const added = await fetchJson(`/api/gigs/${gig.id}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ externalUrl: button.dataset.youtubeUrl, caption: result.querySelector('p').textContent, sourceDescription: result.dataset.youtubeDescription || '', songIndex: Number.isInteger(songIndex) ? songIndex : null }) });
      gig.media = [...(gig.media || []), added]; button.textContent = 'Added'; renderMediaGallery(document.querySelector('#show-detail-gallery'), gig.media.filter((item) => item.category !== 'artifact'), { editable: true, songs: gig.songs || [] });
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
  const localShared = gigs.filter((gig) => attendeeNames(gig).length > 1);
  const localSharedIds = new Set(localShared.flatMap((gig) => [gig.id, gig.sharedId].filter(Boolean)));
  const syncedRemoteShows = sharedShows.filter((show) => show.contributions?.length && !localSharedIds.has(show.id) && !localSharedIds.has(show.sourceGigId));
  const legacyShows = sharedShows.filter((show) => !show.contributions?.length && !localSharedIds.has(show.id) && !localSharedIds.has(show.sourceGigId));
  const totalShared = localShared.length + syncedRemoteShows.length + legacyShows.length;
  setSharedMessage(totalShared ? `${totalShared} shared show${totalShared === 1 ? '' : 's'} in this instance.` : 'Add attendees to a show to start a collaborative record.');
  if (localShared.length) {
    const heading = document.createElement('p');
    heading.className = 'eyebrow shared-list-heading';
    heading.textContent = 'Shared from this archive';
    sharedList.append(heading);
    for (const gig of localShared) {
      const card = document.createElement('article');
      card.className = 'shared-card local-shared-card';
      const names = attendeeNames(gig);
      const syncedShow = sharedShows.find((show) => show.id === gig.sharedId || show.sourceGigId === gig.id);
      const contributions = syncedShow?.contributions || [];
      card.innerHTML = `<div class="shared-card-header"><div><p class="shared-date"></p><h3></h3><p class="shared-place"></p></div><span class="shared-song-count"></span></div><div class="shared-people"></div><div class="local-shared-attendees"></div><div class="local-shared-meta"></div><div class="local-shared-actions"><a class="button button-secondary" href="/show?id=${encodeURIComponent(gig.id)}">Open show</a><a class="button button-secondary" href="/edit?id=${encodeURIComponent(gig.id)}">Edit attendees</a></div>`;
      card.querySelector('.shared-date').textContent = formatGigDate(gig.date);
      card.querySelector('h3').textContent = gig.artist;
      card.querySelector('.shared-place').textContent = `${gig.venue} · ${gig.city}`;
      card.querySelector('.shared-song-count').textContent = gig.songs?.length ? `${gig.songs.length} songs` : 'No setlist yet';
      card.querySelector('.shared-people').innerHTML = `<span>Attendees</span>${names.map((name) => `<b>${escapeHtml(name)}</b>`).join('')}`;
      card.querySelector('.local-shared-attendees').innerHTML = (gig.attendees || []).map((person) => {
        const isLocal = person.id === account?.id;
        const contribution = contributions.find((entry) => isLocal ? entry.localGigId === gig.id : entry.instanceId === person.id);
        const detail = contribution
          ? `${contribution.performanceRating ? `Performance ${contribution.performanceRating}/5` : 'Performance unrated'} · ${contribution.venueRating ? `Venue ${contribution.venueRating}/5` : 'Venue unrated'}${contribution.favorite ? ' · Favourite' : ''} · ${contribution.media?.length || 0} media`
          : isLocal ? `${gig.performanceRating ? `Performance ${gig.performanceRating}/5` : 'Performance unrated'} · ${gig.venueRating ? `Venue ${gig.venueRating}/5` : 'Venue unrated'}${gig.favorite ? ' · Favourite' : ''}` : 'Peer contribution will appear after sync';
        const notes = contribution?.performanceNotes || contribution?.venueNotes;
        return `<div><strong>${escapeHtml(contribution?.participantName || person.name || 'Attendee')}</strong><span>${escapeHtml(detail)}</span>${notes ? `<small>${escapeHtml(notes)}</small>` : ''}</div>`;
      }).join('');
      const performanceRatings = contributions.map((entry) => Number(entry.performanceRating)).filter(Boolean);
      const venueRatings = contributions.map((entry) => Number(entry.venueRating)).filter(Boolean);
      const mediaTotal = contributions.length ? contributions.reduce((sum, entry) => sum + (entry.media?.length || 0), 0) : gig.media?.length || 0;
      const performanceAverage = performanceRatings.length ? `Performance average ${(performanceRatings.reduce((sum, value) => sum + value, 0) / performanceRatings.length).toFixed(1)} / 5` : 'Performance unrated';
      const venueAverage = venueRatings.length ? `Venue average ${(venueRatings.reduce((sum, value) => sum + value, 0) / venueRatings.length).toFixed(1)} / 5` : 'Venue unrated';
      card.querySelector('.local-shared-meta').textContent = `${performanceAverage} · ${venueAverage} · ${mediaTotal} media item${mediaTotal === 1 ? '' : 's'} across attendees`;
      sharedList.append(card);
    }
  }
  if (syncedRemoteShows.length) {
    const heading = document.createElement('p');
    heading.className = 'eyebrow shared-list-heading';
    heading.textContent = 'Received from peers';
    sharedList.append(heading);
    for (const show of syncedRemoteShows) {
      const card = document.createElement('article');
      card.className = 'shared-card local-shared-card';
      const mediaTotal = show.contributions.reduce((sum, entry) => sum + (entry.media?.length || 0), 0);
      card.innerHTML = `<div class="shared-card-header"><div><p class="shared-date"></p><h3></h3><p class="shared-place"></p></div><span class="shared-song-count"></span></div><div class="local-shared-attendees"></div><div class="local-shared-meta"></div>`;
      card.querySelector('.shared-date').textContent = formatGigDate(show.date);
      card.querySelector('h3').textContent = show.artist;
      card.querySelector('.shared-place').textContent = `${show.venue} · ${show.city}`;
      card.querySelector('.shared-song-count').textContent = show.songs?.length ? `${show.songs.length} songs` : 'No setlist yet';
      card.querySelector('.local-shared-attendees').innerHTML = show.contributions.map((entry) => `<div><strong>${escapeHtml(entry.participantName || 'Peer')}</strong><span>${entry.performanceRating ? `Performance ${entry.performanceRating}/5` : 'Performance unrated'} · ${entry.venueRating ? `Venue ${entry.venueRating}/5` : 'Venue unrated'}${entry.favorite ? ' · Favourite' : ''} · ${entry.media?.length || 0} media</span>${entry.performanceNotes || entry.venueNotes ? `<small>${escapeHtml(entry.performanceNotes || entry.venueNotes)}</small>` : ''}</div>`).join('');
      card.querySelector('.local-shared-meta').textContent = `${mediaTotal} media item${mediaTotal === 1 ? '' : 's'} listed across synced instances`;
      sharedList.append(card);
    }
  }
  const profile = activeProfile();
  if (!profiles.length || !profile) {
    if (legacyShows.length) setSharedMessage('Choose your profile to create or review shared shows.', true);
    return;
  }
  if (!legacyShows.length) return;
  for (const show of legacyShows) {
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
    const result = await fetchJson('/api/peers/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    peerInviteToken.value = '';
    peerInviteMessage.textContent = result.message || 'Peer paired successfully.';
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
      showDuplicateWarning(addDuplicateWarning, formValues());
      results.querySelectorAll('.match').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      setMessage(`Setlist selected: ${selectedSetlist.songs.length} songs will be saved with this show.`);
    });
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const gig = formValues();
  if (!confirmDuplicateSave(addDuplicateWarning, gig)) return;
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
    addDuplicateWarning.hidden = true;
    setMessage(isMobileUpload && mediaFiles.length ? 'Show saved. Uploads are continuing in the queue.' : 'Show saved to The Master List.');
    renderGigs();
    await loadPersistentJobs();
    await renderDashboardStats();
  } catch (error) {
    setMessage(error.message, true);
  } finally { submitButton.disabled = false; }
});

function remoteSharedArchiveShows() {
  const localIds = new Set(gigs.flatMap((gig) => [gig.id, gig.sharedId].filter(Boolean)));
  return sharedShows.filter((show) => show.contributions?.length && !localIds.has(show.id) && !localIds.has(show.sourceGigId));
}

function setupShowMediaSection(card, media = [], options = {}) {
  const section = card.querySelector('.show-media-section');
  const gallery = section?.querySelector('.media-gallery');
  if (!section || !gallery) return;
  section.hidden = media.length === 0;
  if (!media.length) return;
  section.querySelector('summary span').textContent = media.length ? `Media · ${media.length}` : 'Media';
  renderMediaGallery(gallery, media, options);
}

function setupArtifactSection(card, gig) {
  const section = card.querySelector('.artifact-section');
  const gallery = card.querySelector('.artifact-gallery');
  if (!section || !gallery) return;
  let artifacts = (gig.media || []).filter((item) => item.category === 'artifact');
  const syncArtifactVisibility = () => {
    section.hidden = artifacts.length === 0;
  };
  const renderArtifacts = () => {
    syncArtifactVisibility();
    section.querySelector('summary span').textContent = artifacts.length ? `Artifacts · ${artifacts.length}` : 'Artifacts';
    renderMediaGallery(gallery, artifacts, { editable: true, allowCover: false, onDelete: (removed) => {
      const removedIds = new Set(removed.map((item) => item.id));
      gig.media = (gig.media || []).filter((item) => !removedIds.has(item.id));
      section.querySelector('summary span').textContent = artifacts.length ? `Artifacts · ${artifacts.length}` : 'Artifacts';
      syncArtifactVisibility();
    } });
  };
  renderArtifacts();
}

function setupArchiveArtistVisual(card, artist) {
  const article = card.querySelector('.gig-card');
  const date = card.querySelector('.gig-date');
  if (!article || !date) return;
  const visual = document.createElement('div');
  visual.className = 'gig-artist-visual';
  const link = document.createElement('a');
  link.className = 'gig-artist-image';
  link.href = `/artist?name=${encodeURIComponent(artist)}`;
  link.setAttribute('aria-label', `View ${artist}`);
  const initials = artist.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '♪';
  link.innerHTML = `<span aria-hidden="true">${escapeHtml(initials)}</span><img alt="" loading="lazy" decoding="async" hidden>`;
  visual.append(link, date);
  article.prepend(visual);
  article.dataset.artistName = artist;
}

async function artistImageForArchive(artist) {
  const key = artist.trim().toLocaleLowerCase();
  if (!archiveArtistImageCache.has(key)) {
    archiveArtistImageCache.set(key, fetchJson(`/api/artists?name=${encodeURIComponent(artist)}`)
      .then((info) => info.image || '')
      .catch(() => ''));
  }
  return archiveArtistImageCache.get(key);
}

function hydrateArchiveArtistImages() {
  const visuals = [...gigList.querySelectorAll('.gig-card[data-artist-name] .gig-artist-image')];
  const artists = new Map();
  for (const visual of visuals) {
    const artist = visual.closest('.gig-card')?.dataset.artistName;
    if (!artist) continue;
    const key = artist.trim().toLocaleLowerCase();
    if (!artists.has(key)) artists.set(key, { artist, visuals: [] });
    artists.get(key).visuals.push(visual);
  }
  for (const { artist, visuals: artistVisuals } of artists.values()) {
    artistImageForArchive(artist).then((imageUrl) => {
      if (!imageUrl) return;
      for (const visual of artistVisuals) {
        if (!visual.isConnected) continue;
        const image = visual.querySelector('img');
        image.addEventListener('load', () => visual.classList.add('has-image'), { once: true });
        image.addEventListener('error', () => {
          visual.classList.remove('has-image');
          image.hidden = true;
          image.removeAttribute('src');
        }, { once: true });
        image.hidden = false;
        image.src = imageUrl;
      }
    });
  }
}

function renderRemoteSharedGig(show) {
  const card = document.querySelector('#gig-template').content.cloneNode(true);
  const article = card.querySelector('.gig-card');
  article.id = `shared-${show.id}`;
  article.classList.add('remote-shared-gig');
  article.dataset.showDate = show.date || '';
  article.dataset.showRating = String(Math.max(0, ...show.contributions.map((entry) => Number(entry.performanceRating || 0))));
  article.dataset.showFavorite = show.contributions.some((entry) => entry.favorite) ? '1' : '0';
  setupArchiveArtistVisual(card, show.artist);
  card.querySelectorAll('.artifact-section, .add-artifact-gig').forEach((element) => element.remove());
  card.querySelector('.gig-date').textContent = formatGigDate(show.date);
  card.querySelector('h3').innerHTML = `<a class="artist-link" href="/artist?name=${encodeURIComponent(show.artist)}">${escapeHtml(show.artist)}</a>`;
  card.querySelector('.gig-place').innerHTML = `<a class="venue-link" href="/venue?name=${encodeURIComponent(show.venue)}&city=${encodeURIComponent(show.city)}">${escapeHtml(show.venue)}</a> · <a class="venue-link" href="/city?name=${encodeURIComponent(show.city)}">${escapeHtml(show.city)}</a>`;
  const participants = show.contributions.map((entry) => entry.participantName || 'Peer');
  card.querySelector('.gig-notes').textContent = `Shared by ${participants.join(', ')}`;
  const mediaTotal = show.contributions.reduce((sum, entry) => sum + (entry.media?.length || 0), 0);
  card.querySelector('.venue-notes').textContent = `${mediaTotal} media item${mediaTotal === 1 ? '' : 's'} listed on peer instances`;
  const ratings = card.querySelector('.gig-ratings');
  ratings.innerHTML = show.contributions.map((entry) => `<span class="remote-rating"><b>${escapeHtml(entry.participantName || 'Peer')}</b> · ${entry.performanceRating ? `Performance ${entry.performanceRating}/5` : 'Performance unrated'} · ${entry.venueRating ? `Venue ${entry.venueRating}/5` : 'Venue unrated'}${entry.favorite ? ' · ♥ Favourite' : ''}</span>`).join('');
  const heart = card.querySelector('.heart-toggle');
  heart.textContent = show.contributions.some((entry) => entry.favorite) ? '♥' : '♡';
  heart.disabled = true;
  heart.title = 'Favourite status belongs to the contributing peer';
  card.querySelectorAll('.show-detail-link, .play-gig, .share-gig, .edit-gig, .delete-gig').forEach((control) => control.remove());
  if (show.songs?.length) {
    setupArchiveSetlist(card.querySelector('.setlist'), show, { fetchAlbums: false });
  }
  const contributions = card.querySelector('.media-gallery');
  card.querySelector('.show-media-section').hidden = mediaTotal === 0;
  contributions.className = 'remote-contributions local-shared-attendees';
  contributions.innerHTML = show.contributions.map((entry) => `<div><strong>${escapeHtml(entry.participantName || 'Peer')}</strong><span>${entry.media?.length || 0} media · synced ${escapeHtml(new Date(entry.updatedAt).toLocaleString())}</span>${entry.performanceNotes || entry.venueNotes ? `<small>${escapeHtml(entry.performanceNotes || entry.venueNotes)}</small>` : ''}</div>`).join('');
  card.querySelector('.show-media-section summary span').textContent = `Peer media · ${mediaTotal}`;
  return card;
}

function renderGigs() {
  const remoteShows = remoteSharedArchiveShows();
  const allShows = [...gigs, ...remoteShows];
  count.textContent = `${allShows.length} show${allShows.length === 1 ? '' : 's'}`;
  archiveStats.innerHTML = `<span>${allShows.length} shows</span><span>${new Set(allShows.map((gig) => gig.artist.toLowerCase())).size} artists</span><span>${new Set(allShows.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size} venues</span><span>${gigs.filter((gig) => gig.favorite).length + remoteShows.filter((show) => show.contributions.some((entry) => entry.favorite)).length} favourites</span><span>${allShows.reduce((total, gig) => total + (gig.songs?.length || 0), 0)} songs</span>`;
  const query = showFilter?.value.trim().toLowerCase() || '';
  const year = yearFilter?.value || '';
  const sort = sortFilter?.value || 'newest';
  const compareDates = (a, b, oldestFirst = false) => {
    const first = String(a || '');
    const second = String(b || '');
    if (!first && !second) return 0;
    if (!first) return 1;
    if (!second) return -1;
    return oldestFirst ? first.localeCompare(second) : second.localeCompare(first);
  };
  const filtered = gigs.filter((gig) => (!query || [gig.artist, gig.venue, gig.city].some((value) => value.toLowerCase().includes(query))) && (!year || gig.date.startsWith(year)) && (!favouriteFilter?.checked || gig.favorite));
  const remoteFiltered = remoteShows.filter((show) => (!query || [show.artist, show.venue, show.city, ...show.contributions.map((entry) => entry.participantName || '')].some((value) => value.toLowerCase().includes(query))) && (!year || show.date.startsWith(year)) && (!favouriteFilter?.checked || show.contributions.some((entry) => entry.favorite)));
  emptyState.hidden = Boolean(filtered.length || remoteFiltered.length);
  gigList.replaceChildren();
  const orderedGigs = [...filtered].sort((a, b) => sort === 'oldest' ? compareDates(a.date, b.date, true) : sort === 'rating' ? (Number(b.performanceRating || 0) - Number(a.performanceRating || 0)) || compareDates(a.date, b.date) : compareDates(a.date, b.date));
  for (const gig of orderedGigs) {
    const card = document.querySelector('#gig-template').content.cloneNode(true);
    const article = card.querySelector('.gig-card');
    article.id = `gig-${gig.id}`;
    article.dataset.showDate = gig.date || '';
    article.dataset.showRating = String(Number(gig.performanceRating || 0));
    article.dataset.showFavorite = gig.favorite ? '1' : '0';
    setupArchiveArtistVisual(card, gig.artist);
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
    renderAttendeeSummary(card.querySelector('.gig-summary'), gig);
    const syncedShow = sharedShows.find((show) => show.id === gig.sharedId || show.sourceGigId === gig.id);
    const peerContributions = (syncedShow?.contributions || []).filter((entry) => entry.localGigId !== gig.id);
    if (peerContributions.length) {
      const details = document.createElement('details');
      details.className = 'peer-contribution-summary';
      details.innerHTML = `<summary>${peerContributions.length} peer contribution${peerContributions.length === 1 ? '' : 's'}</summary>${peerContributions.map((entry) => `<div><strong>${escapeHtml(entry.participantName || 'Peer')}</strong><span>${entry.performanceRating ? `Performance ${entry.performanceRating}/5` : 'Performance unrated'} · ${entry.venueRating ? `Venue ${entry.venueRating}/5` : 'Venue unrated'} · ${entry.media?.length || 0} media</span>${entry.performanceNotes || entry.venueNotes ? `<small>${escapeHtml(entry.performanceNotes || entry.venueNotes)}</small>` : ''}</div>`).join('')}`;
      card.querySelector('.gig-summary').append(details);
    }
    const ratings = card.querySelector('.gig-ratings');
    ratings.innerHTML = quickRating('performanceRating', 'Performance', gig.performanceRating);
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
    const setlist = card.querySelector('.setlist');
    const exports = card.querySelector('.exports');
    exports.hidden = true;
    if (gig.songs?.length) {
      setupArchiveSetlist(setlist, gig);
      exports.hidden = false;
      setupExportButtons(exports, gig);
    }
    setupShowMediaSection(card, (gig.media || []).filter((item) => item.category !== 'artifact'), { songs: gig.songs || [] });
    setupArtifactSection(card, gig);
    card.querySelector('.delete-gig').addEventListener('click', async () => {
      if (!confirm(`Remove ${gig.artist} at ${gig.venue}?`)) return;
      await fetchJson(`/api/gigs/${gig.id}`, { method: 'DELETE' });
      gigs = gigs.filter((item) => item.id !== gig.id);
      renderGigs();
    });
    gigList.append(card);
  }
  const orderedRemoteShows = [...remoteFiltered].sort((a, b) => sort === 'oldest' ? compareDates(a.date, b.date, true) : sort === 'rating' ? Math.max(...b.contributions.map((entry) => Number(entry.performanceRating || 0))) - Math.max(...a.contributions.map((entry) => Number(entry.performanceRating || 0))) || compareDates(a.date, b.date) : compareDates(a.date, b.date));
  for (const show of orderedRemoteShows) gigList.append(renderRemoteSharedGig(show));
  const cards = [...gigList.children].sort((a, b) => sort === 'oldest'
    ? compareDates(a.dataset.showDate, b.dataset.showDate, true)
    : sort === 'rating'
      ? Number(b.dataset.showRating || 0) - Number(a.dataset.showRating || 0) || compareDates(a.dataset.showDate, b.dataset.showDate)
      : compareDates(a.dataset.showDate, b.dataset.showDate));
  gigList.append(...cards);
  hydrateArchiveArtistImages();
  if (window.location.hash.startsWith('#shared-')) requestAnimationFrame(() => document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
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
  [...new Set([...gigs, ...remoteSharedArchiveShows()].map((gig) => gig.date.slice(0, 4)).filter(Boolean))].sort().reverse().forEach((year) => yearFilter.add(new Option(year, year)));
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
    button.textContent = label;
    if (!integration?.configured) {
      button.disabled = true;
      button.title = `Add ${label} credentials to .env, then restart the server.`;
      return;
    }
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

async function initializeApp() {
  if (page === 'shared') { window.location.replace('/shows'); return; }
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
    await renderEntityDirectories();
    renderTimeline();
    renderGlobalSearch();
    await renderArchiveHealth();
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
    if (account) {
      await loadPeerNotifications();
      peerPollTimer = setTimeout(pollConnectedPeers, 5_000);
    }
}

initializeApp().catch((error) => setMessage(error.message, true));
