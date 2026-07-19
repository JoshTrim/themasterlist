const form = document.querySelector('#gig-form');
const { escapeHtml, formatGigDate, formatBytes, providerName } = window.MasterListFormatters;
const playbackCore = window.MasterListPlaybackCore;
const playbackMedia = window.MasterListPlaybackMedia;
const playbackEditor = window.MasterListPlaybackEditor;
const theatreUi = window.MasterListTheatre;
const theatreControllerModule = window.MasterListTheatreController;
const mediaUi = window.MasterListMediaUi;
const mediaUploaderModule = window.MasterListMediaUploader;
const mediaGalleryModule = window.MasterListMediaGallery;
const uploadQueue = window.MasterListUploadQueue;
const mediaJobs = window.MasterListMediaJobs;
const showEditor = window.MasterListShowEditor;
const showFormController = window.MasterListShowFormController;
const directoryUi = window.MasterListDirectoryUi;
const archiveSearchModule = window.MasterListArchiveSearch;
const timelinePageModule = window.MasterListTimelinePage;
const overviewPageModule = window.MasterListOverviewPage;
const entityProfilePageModule = window.MasterListEntityProfilePage;
const metadataEditorModule = window.MasterListMetadataEditor;
const apiLimitsPageModule = window.MasterListApiLimitsPage;
const activityPageModule = window.MasterListActivityPage;
const conflictsPageModule = window.MasterListConflictsPage;
const healthPageModule = window.MasterListHealthPage;
const maintenancePageModule = window.MasterListMaintenancePage;
const directoryPageModule = window.MasterListDirectoryPage;
const locationsPageModule = window.MasterListLocationsPage;
const playlistExportModule = window.MasterListPlaylistExport;
const authControllerModule = window.MasterListAuthController;
const peerSettingsModule = window.MasterListPeerSettings;
const notificationCenterModule = window.MasterListNotificationCenter;
const pageRuntime = window.MasterListPageRuntime;
const apiClient = window.MasterListApiClient.createApiClient({ fetch: (...args) => window.fetch(...args) });
const { toggle: mobileMenuToggle, nav: siteNav } = window.MasterListNavigation.initNavigation({ document, location: window.location });
const navSignIn = document.querySelector('#nav-sign-in');
const jobUi = window.MasterListJobs.createJobQueue({ document, fetchJson, escapeHtml, hideUploads: () => isMobileUpload });
const jobQueue = jobUi.queue;
const updateJob = jobUi.update;
const loadPersistentJobs = jobUi.loadPersistent;
const notificationPanel = document.createElement('aside'); notificationPanel.className = 'peer-notifications'; notificationPanel.hidden = true; notificationPanel.innerHTML = '<p class="eyebrow">From your peers</p><div class="peer-notification-list"></div>'; document.body.append(notificationPanel);
let peerPollRunning = false;
let peerPollTimer;
window.addEventListener('beforeunload', (event) => {
  const activeJob = [...jobQueue.values()].some((job) => job.type === 'Uploading' && job.status === 'running');
  const mobileState = mobileUploadStates.get(editMediaInput);
  const queuedMobileUpload = mobileState?.items?.some((item) => ['queued', 'uploading'].includes(item.status));
  if (activeJob || queuedMobileUpload) { event.preventDefault(); event.returnValue = ''; }
});
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
const genreStats = document.querySelector('#genre-stats');
const genreStatsNote = document.querySelector('#genre-stats-note');
const genreStatsChart = document.querySelector('#genre-stats-chart');
const artistsFilter = document.querySelector('#artists-filter');
const artistsMetadataFilter = document.querySelector('#artists-metadata-filter');
const artistsSort = document.querySelector('#artists-sort');
const artistsSummary = document.querySelector('#artists-summary');
const artistsGrid = document.querySelector('#artists-grid');
const venuesFilter = document.querySelector('#venues-filter');
const venuesMetadataFilter = document.querySelector('#venues-metadata-filter');
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
const repairAllAlbums = document.querySelector('#repair-all-albums');
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
const exportArchiveButton = document.querySelector('#export-archive');
const importArchiveInput = document.querySelector('#import-archive');
const cleanupMediaButton = document.querySelector('#cleanup-media');
const maintenanceSummary = document.querySelector('#maintenance-summary');
const maintenanceMessage = document.querySelector('#maintenance-message');
const integrityList = document.querySelector('#integrity-list');
const refreshIntegrityButton = document.querySelector('#refresh-integrity');
const restoreDatabaseInput = document.querySelector('#restore-database');
const stageRestoreButton = document.querySelector('#stage-restore');
const downloadDatabaseLink = document.querySelector('#download-database');
const activityList = document.querySelector('#activity-list');
const activityFilters = document.querySelector('#activity-filters');
const activityMessage = document.querySelector('#activity-message');
const markAllActivityRead = document.querySelector('#mark-all-activity-read');
const navActivityCount = document.querySelector('#nav-activity-count');
const navConflictCount = document.querySelector('#nav-conflict-count');
const conflictList = document.querySelector('#conflict-list');
const conflictsMessage = document.querySelector('#conflicts-message');
const backupScheduleForm = document.querySelector('#backup-schedule-form');
const backupScheduleStatus = document.querySelector('#backup-schedule-status');
const backupNowButton = document.querySelector('#backup-now');
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

const page = document.body.dataset.page || 'home';
const routeSections = {
  home: ['home-page'],
  overview: ['overview-page'],
  artists: ['artists-page'],
  venues: ['venues-page'],
  timeline: ['timeline-page'],
  search: ['search-page'],
  health: ['health-page'],
  maintenance: ['maintenance-page'],
  activity: ['activity-page'],
  conflicts: ['conflicts-page'],
  'api-limits': ['api-limits-page'],
  add: ['add-page'],
  shows: ['shows-archive'],
  shared: ['shows-archive'],
  login: ['shows-shared'],
  artist: ['artist-page'],
  'artist-edit': ['artist-edit-page'],
  show: ['show-page'],
  playback: ['show-page'],
  city: ['city-page'],
  venue: ['venue-page'],
  'venue-edit': ['venue-edit-page'],
  edit: ['edit-page'],
  map: ['map-page'],
  account: ['account-page']
};
for (const id of ['home-page', 'overview-page', 'artists-page', 'venues-page', 'timeline-page', 'search-page', 'health-page', 'maintenance-page', 'activity-page', 'conflicts-page', 'api-limits-page', 'add-page', 'shows-archive', 'artist-page', 'artist-edit-page', 'show-page', 'venue-page', 'venue-edit-page', 'edit-page', 'shows-shared', 'map-page', 'city-page', 'account-page']) {
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
const artistEditLink = document.querySelector('#artist-edit-link');
const artistEditForm = document.querySelector('#artist-edit-form');
const artistEditPreview = document.querySelector('#artist-edit-preview');
const artistEditMessage = document.querySelector('#artist-edit-message');
const artistEditStepper = document.querySelector('#artist-edit-stepper');
const artistShows = document.querySelector('#artist-shows');
const artistEmpty = document.querySelector('#artist-empty');
const artistStats = document.querySelector('#artist-stats');
const editForm = document.querySelector('#edit-form');
const editMessage = document.querySelector('#edit-message');
const editMediaInput = document.querySelector('#edit-media-input');
const addAttendeePicker = document.querySelector('#add-attendee-picker');
let editAttendeePicker = document.querySelector('#edit-attendee-picker');
const pendingMedia = new WeakMap();
const mediaSelection = mediaUi.createSelection();
const mobileUploadStates = new WeakMap();
const mobileUploadRenderTimers = new WeakMap();
const isMobileUpload = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const gigMediaUploader = mediaUploaderModule.createUploader({ fetch: (...args) => window.fetch(...args), XMLHttpRequest: window.XMLHttpRequest, AbortController: window.AbortController, randomUUID: () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, updateJob, isMobile: () => isMobileUpload });
let uploadWakeLock = null;
let activeWakeLockUsers = 0;
async function retainUploadWakeLock() { if (!isMobileUpload || !navigator.wakeLock) return; activeWakeLockUsers += 1; if (uploadWakeLock) return; try { uploadWakeLock = await navigator.wakeLock.request('screen'); uploadWakeLock.addEventListener?.('release', () => { uploadWakeLock = null; }); } catch { uploadWakeLock = null; } }
function releaseUploadWakeLock() { if (!isMobileUpload) return; activeWakeLockUsers = Math.max(0, activeWakeLockUsers - 1); if (!activeWakeLockUsers && uploadWakeLock) { uploadWakeLock.release().catch(() => {}); uploadWakeLock = null; } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && activeWakeLockUsers && !uploadWakeLock) retainUploadWakeLock(); });
function mobileUploadStateFor(input, gigId = '', category = 'show') {
  let state = mobileUploadStates.get(input);
  if (!state) { state = uploadQueue.createState(category); mobileUploadStates.set(input, state); }
  if (gigId) uploadQueue.bindGig(state, gigId, category);
  else if (category) state.category = category;
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
  container.innerHTML = uploadQueue.queueMarkup(state, { escapeHtml, formatSize: formatUploadSize });
  container.querySelectorAll('.mobile-upload-retry').forEach((button) => button.addEventListener('click', () => {
    const item = uploadQueue.retry(state, button.dataset.uploadItem);
    if (!item) return;
    renderMobileUploadState(input, state);
    processMobileUploadQueue(input, state);
  }));
}
function queueMobileFiles(input, files) {
  const state = mobileUploadStateFor(input);
  const selectedFiles = files.filter((file) => file && file.size > 0);
  if (!selectedFiles.length) return;
  uploadQueue.enqueueFiles(state, selectedFiles);
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
      const item = uploadQueue.nextQueued(state);
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
  uploadQueue.bindGig(state, gigId, category);
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
function addFileClearButton(input) { if (!input) return; const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-secondary file-clear'; button.textContent = 'Clear queued files'; button.addEventListener('click', () => { input.value = ''; if (pendingMedia.has(input)) pendingMedia.set(input, []); const state = mobileUploadStates.get(input); if (state) { if (state.startTimer) { clearTimeout(state.startTimer); state.startTimer = null; } uploadQueue.clearPending(state); if (!state.items.some((item) => item.status === 'uploading')) { state.gigId = ''; state.releaseAfterDrain = false; } renderMobileUploadState(input, state); } }); input.insertAdjacentElement('afterend', button); }
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
const findAlbumInfo = document.querySelector('#find-album-info');
const albumLookupMessage = document.querySelector('#album-lookup-message');
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
let theatreController;
let setPlaybackWakeLock;
const setTimelineMedia = matchMedia('(max-width: 640px)');
let setTimelineZoom = setTimelineMedia.matches ? 3 : 5;
const formatPlaybackTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const playbackResumeKey = (gigId) => `master-list:playback:${gigId}`;
function updateSetTheatreMeta(gig, entry) {
  const source = playbackMedia.sourcePresentation(entry);
  setPlayerSourceKind.textContent = source.kind;
  setPlayerSourceLabel.textContent = source.label;
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
  theatreController?.schedule();
}
function revealTheatreControls({ schedule = true } = {}) {
  theatreController?.reveal({ schedule });
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
  return playbackCore.bounds(source, duration);
}
function playbackFraction(source, current, duration) {
  return playbackCore.fraction(source, current, duration);
}
function playbackTimeAt(source, fraction, duration) {
  return playbackCore.timeAt(source, fraction, duration);
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
function playbackTimelineModel(gig) {
  return playbackCore.timelineModel(gig, setQueue);
}
function focusedPlaybackTimelineModel(gig) {
  return playbackCore.focusedTimelineModel(gig, setQueue, setQueueIndex, setTimelineZoom);
}
function setTimelineProgress(gig, mediaFraction = 0, currentSeconds = 0, durationSeconds = 0) {
  const fullSegment = playbackTimelineModel(gig)[setQueueIndex];
  const segment = focusedPlaybackTimelineModel(gig).find((item) => item.index === setQueueIndex);
  if (!fullSegment || !segment) return;
  const fraction = Math.max(0, Math.min(1, Number(mediaFraction) || 0));
  setPlayerProgress.style.width = `${playbackCore.progressModel(segment, fraction) * 100}%`;
  setPlayerOverviewProgress.style.width = `${playbackCore.progressModel(fullSegment, fraction) * 100}%`;
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
  const target = playbackCore.seekTarget(model, ratio);
  if (!target) return;
  const { segment, fraction, ratio: bounded } = target;
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
const venueClosedBadge = document.querySelector('#venue-closed-badge');
const venueStats = document.querySelector('#venue-stats');
const venueShows = document.querySelector('#venue-shows');
const venueEmpty = document.querySelector('#venue-empty');
const venueDescription = document.querySelector('#venue-description');
const venueBio = document.querySelector('#venue-bio');
const venueImage = document.querySelector('#venue-image');
const venueSource = document.querySelector('#venue-source');
const venueEditLink = document.querySelector('#venue-edit-link');
const venueEditForm = document.querySelector('#venue-edit-form');
const venueEditPreview = document.querySelector('#venue-edit-preview');
const venueEditMessage = document.querySelector('#venue-edit-message');
const venueEditStepper = document.querySelector('#venue-edit-stepper');

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

function findDuplicateShows(values, excludeId = '') {
  return showEditor.findDuplicates(values, { gigs, sharedShows, excludeId });
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
  container.querySelector('.attendee-options').innerHTML = showEditor.attendeeMarkup(showEditor.attendeeOptions(account, peers, selected), escapeHtml);
}

function readAttendees(container) {
  if (!container) return [];
  return showEditor.selectedAttendees(container.querySelectorAll('input[type="checkbox"]'));
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
  return apiClient.json(url, options);
}

const notificationCenter = notificationCenterModule.createController({
  fetchJson, escapeHtml, getAccount: () => account,
  navigate: (href) => window.location.assign(href),
  elements: { panel: notificationPanel, activityCount: navActivityCount, conflictCount: navConflictCount }
});
function loadPeerNotifications() { return notificationCenter.load(); }
function loadConflictCount() { return notificationCenter.loadConflicts(); }

async function pollConnectedPeers() {
  if (!account || peerPollRunning) return;
  peerPollRunning = true;
  try {
    const result = await fetchJson('/api/peers/sync-all', { method: 'POST' });
    const notifications = await loadPeerNotifications();
    await loadConflictCount();
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

async function pollMediaRecognition(gigId, onMedia) {
  return mediaJobs.pollRecognition({ fetchMedia: () => fetchJson(`/api/gigs/${gigId}/media`), onUpdate: onMedia });
}

function uploadGigMedia(gigId, files, onProgress = () => {}, category = 'show') {
  return gigMediaUploader.upload(gigId, files, onProgress, category);
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
  return mediaUi.recognitionMarkup(item, songs, escapeHtml);
}

const mediaGalleryController = mediaGalleryModule.createGallery({
  escapeHtml, youtubeEmbedUrl, isMobileUpload, openMediaLightbox, mediaSelection, fetchJson,
  confirm: (...args) => window.confirm(...args), prompt: (...args) => window.prompt(...args),
  mediaJobs, updateJob, mediaRecognitionMarkup
});
function renderMediaGallery(container, media = [], options = {}) {
  return mediaGalleryController.render(container, media, options);
}
let mediaWorkspaceFilter = 'all';
let activeEditGig = null;

function mediaWorkspaceState(item) {
  return mediaUi.workspaceState(item);
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
  const totals = mediaUi.workspaceTotals(media);
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
          const status = await mediaJobs.poll({ fetchStatus: () => fetchJson(`/api/jobs/${job.jobId}`), onUpdate: (current) => updateJob(job.jobId, current) });
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
  return playbackCore.sourceLabel(item);
}

function playbackCandidates(gig) {
  return playbackCore.candidates(gig);
}

function playbackClipFor(item, songIndex) {
  return playbackCore.clipFor(item, songIndex);
}

function playbackSourcesForSong(gig, songIndex) {
  return playbackCore.sourcesForSong(gig, songIndex);
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

function playbackEditorRows(gig) {
  return [...playbackEditorList.querySelectorAll('.playback-editor-row')].map((row) => ({
    element: row, songIndex: Number(row.dataset.songIndex), primaryId: row.querySelector('.playback-source').value,
    duration: Number(row.dataset.mediaDuration) || null, previewUnavailable: row.dataset.previewUnavailable === 'true',
    sources: playbackEditorRowSources(gig, row)
  }));
}

function playbackEditorHealthCheck(gig) {
  const editorRows = playbackEditorRows(gig);
  const health = playbackEditor.validatePlan(gig.songs || [], editorRows);
  health.rows.forEach((result) => {
    const row = editorRows.find((entry) => entry.songIndex === result.songIndex).element;
    const rowHealth = row.querySelector('.playback-row-health');
    row.classList.remove('is-invalid', 'has-warning'); rowHealth.textContent = '';
    if (result.errors.length) { row.classList.add('is-invalid'); rowHealth.textContent = result.errors.join(' '); }
    else if (result.warnings.length) { row.classList.add('has-warning'); rowHealth.textContent = result.warnings.join(' '); }
  });
  playbackEditorHealth.innerHTML = `<span class="playback-health-ready">${health.assigned}/${editorRows.length} tracks assigned</span><span class="playback-health-gap">${health.gaps} gap${health.gaps === 1 ? '' : 's'}</span><span class="${health.errors.length ? 'playback-health-error' : 'playback-health-ok'}">${health.errors.length ? `${health.errors.length} issue${health.errors.length === 1 ? '' : 's'} to fix` : 'No blocking issues'}</span>${health.warnings.length ? `<span class="playback-health-warning">${health.warnings.length} warning${health.warnings.length === 1 ? '' : 's'}</span>` : ''}`;
  savePlaybackPlan.disabled = Boolean(health.errors.length); savePlaybackPlan.title = health.errors[0] || '';
  return health;
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
  return playbackEditor.suggestionConfidence(suggestion);
}
function playbackSuggestionTiming(suggestion) {
  return playbackEditor.suggestionTiming(suggestion, formatPlaybackTime);
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
      const clips = playbackEditor.clipsFromRows(playbackEditorRows(gig));
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

const artistPageController = entityProfilePageModule.createArtistController({
  page, name: artistNameFromUrl, getGigs: () => gigs, fetchJson, renderShows: renderArtistShows,
  elements: {
    heading: artistHeading, description: artistDescription, bio: artistBio,
    image: artistImage, source: artistSource, editLink: artistEditLink,
    empty: artistEmpty, stats: artistStats
  }
});
function renderArtistPage() { return artistPageController.render(); }

const metadataEditorEntries = (type) => directoryUi.editorEntries([...gigs, ...remoteSharedArchiveShows()], type);
const artistMetadataEditor = metadataEditorModule.createController({
  page, routePage: 'artist-edit', type: 'artist', name: artistNameFromUrl,
  form: artistEditForm, preview: artistEditPreview, message: artistEditMessage,
  stepper: artistEditStepper, heading: document.querySelector('#artist-edit-heading'),
  backLink: document.querySelector('#artist-edit-back'), fetchJson,
  validateImage: directoryUi.validateImage, getEntries: () => metadataEditorEntries('artist'), escapeHtml
});
artistMetadataEditor.bind();
function renderArtistEditPage() { return artistMetadataEditor.load(); }

const overviewPageController = overviewPageModule.createController({
  page, getGigs: () => gigs, getRemoteShows: remoteSharedArchiveShows,
  loadMetadata: loadDirectoryMetadata, missingFields: metadataMissingFields,
  fetchJson, escapeHtml,
  elements: { dashboard: dashboardStats, genres: genreStats, genreNote: genreStatsNote, genreChart: genreStatsChart }
});
function renderDashboardStats() { return overviewPageController.render(); }
let directoryMetadataPromise;
function loadDirectoryMetadata() {
  if (!directoryMetadataPromise) directoryMetadataPromise = fetchJson('/api/directory/metadata').catch(() => ({ artists: [], venues: [], locations: [] }));
  return directoryMetadataPromise;
}

function metadataMissingFields(type, info = {}, hasLocation = true) {
  return directoryUi.missingFields(type, info, hasLocation);
}
const directoryHydrator = directoryPageModule.createHydrator({ window, document, fetchJson, missingFields: metadataMissingFields, escapeHtml });
const directoryPageController = directoryPageModule.createController({
  page, window, getShows: () => gigs, getRemoteShows: remoteSharedArchiveShows,
  loadMetadata: loadDirectoryMetadata, directoryUi, escapeHtml, formatGigDate, hydrator: directoryHydrator,
  elements: {
    artists: { filter: artistsFilter, metadata: artistsMetadataFilter, sort: artistsSort, summary: artistsSummary, grid: artistsGrid },
    venues: { filter: venuesFilter, metadata: venuesMetadataFilter, sort: venuesSort, summary: venuesSummary, grid: venuesGrid }
  }
});
function renderEntityDirectories() { return directoryPageController.render(); }

const timelinePageController = timelinePageModule.createController({
  page, window, document, getGigs: () => gigs, getRemoteShows: remoteSharedArchiveShows,
  formatGigDate, escapeHtml,
  elements: {
    summary: timelineSummary, chart: timelineChart, detail: timelineYearDetail,
    selectedYear: timelineSelectedYear, yearChange: timelineYearChange,
    months: timelineMonths, yearShows: timelineYearShows
  }
});
function renderTimeline() { return timelinePageController.render(); }
const archiveSearchController = archiveSearchModule.createSearchController({
  page, window, getGigs: () => gigs, escapeHtml, formatGigDate,
  input: globalSearchInput, yearInput: globalSearchYear, ratingInput: globalSearchRating,
  mediaInput: globalSearchMedia, favouriteInput: globalSearchFavourite,
  summary: globalSearchSummary, results: globalSearchResults
});
function renderGlobalSearch() { return archiveSearchController.render(); }
const apiLimitsPageController = apiLimitsPageModule.createController({
  page, fetchJson, getAccount: () => account, escapeHtml,
  elements: { grid: apiLimitsGrid, note: apiLimitsNote, detail: apiUsageDetail }
});
function renderApiLimits() { return apiLimitsPageController.render(); }

const maintenancePageController = maintenancePageModule.createController({
  page, fetchJson, escapeHtml, formatBytes, confirmAction: (prompt) => confirm(prompt),
  elements: {
    summary: maintenanceSummary, message: maintenanceMessage, integrityList, cleanup: cleanupMediaButton,
    scheduleForm: backupScheduleForm, scheduleStatus: backupScheduleStatus, backupNow: backupNowButton,
    refreshIntegrity: refreshIntegrityButton, restoreInput: restoreDatabaseInput,
    stageRestore: stageRestoreButton, downloadLink: downloadDatabaseLink
  }
});
maintenancePageController.bind();
function renderMaintenance() { return maintenancePageController.render(); }

const activityPageController = activityPageModule.createController({
  page, fetchJson, escapeHtml, refreshNotifications: loadPeerNotifications,
  navigate: (href) => window.location.assign(href),
  elements: { list: activityList, filters: activityFilters, message: activityMessage, markAll: markAllActivityRead }
});
activityPageController.bind();
function renderActivity() { return activityPageController.render(); }

const conflictsPageController = conflictsPageModule.createController({
  page, getAccount: () => account, fetchJson, escapeHtml, formatGigDate,
  refreshNotifications: loadPeerNotifications,
  elements: { list: conflictList, message: conflictsMessage, navCount: navConflictCount }
});
function renderConflicts() { return conflictsPageController.render(); }

const healthPageController = healthPageModule.createController({
  page, fetchJson, escapeHtml,
  elements: { summary: healthSummary, filters: healthFilters, list: healthList, message: healthMessage, repairAll: repairAllMetadata, repairAlbums: repairAllAlbums }
});
healthPageController.bind();
function renderArchiveHealth() { return healthPageController.render(); }

function renderVenueShows(records) {
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
}

const venuePageController = entityProfilePageModule.createVenueController({
  page, name: venueNameFromUrl, city: venueCityFromUrl,
  getGigs: () => gigs, fetchJson, renderShows: renderVenueShows,
  elements: {
    heading: venueHeading, cityLabel: venuePageCity, closedBadge: venueClosedBadge,
    stats: venueStats, empty: venueEmpty, description: venueDescription, bio: venueBio,
    image: venueImage, source: venueSource, editLink: venueEditLink
  }
});
function renderVenuePage() { return venuePageController.render(); }

const venueMetadataEditor = metadataEditorModule.createController({
  page, routePage: 'venue-edit', type: 'venue', name: venueNameFromUrl, city: venueCityFromUrl,
  form: venueEditForm, preview: venueEditPreview, message: venueEditMessage,
  stepper: venueEditStepper, heading: document.querySelector('#venue-edit-heading'),
  backLink: document.querySelector('#venue-edit-back'), fetchJson,
  validateImage: directoryUi.validateImage, getEntries: () => metadataEditorEntries('venue'), escapeHtml,
  afterSave: (info) => {
    venueHeading.textContent = info.title; venueDescription.textContent = info.description; venueBio.textContent = info.bio;
    venueClosedBadge.hidden = !info.isClosed;
    venueImage.hidden = !info.image; if (info.image) { venueImage.src = info.image; venueImage.alt = `${info.title} photo`; venueImage.style.objectPosition = info.imagePosition || 'center'; }
    venueSource.hidden = !info.source; if (info.source) venueSource.href = info.source;
  }
});
venueMetadataEditor.bind();
function renderVenueEditPage() { return venueMetadataEditor.load(); }

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
    const rows = [...editSetlistTracks.querySelectorAll('.edit-track')].map((row) => ({
      title: row.querySelector('.edit-track-title').value,
      artist: row.querySelector('.edit-track-artist').value,
      album: row.querySelector('.edit-track-album').value
    }));
    tracks = showEditor.syncTracks(tracks, rows);
  };
  const clearTrackDropIndicators = () => editSetlistTracks.querySelectorAll('.edit-track').forEach((row) => row.classList.remove('is-dragging', 'drop-before', 'drop-after'));
  const moveTrack = (sourceIndex, targetIndex, placeAfter = false) => {
    syncTracksFromInputs();
    const moved = showEditor.moveTrack(tracks, sourceIndex, targetIndex, placeAfter);
    tracks = moved.tracks;
    renderTracks();
    editSetlistTracks.querySelectorAll('.edit-track-drag')[moved.index]?.focus();
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
      tracks = showEditor.removeTrack(tracks, trackIndex);
      renderTracks();
    }));
    wireTrackReordering();
  };
  renderTracks();
  addEditTrack.onclick = () => {
    syncTracksFromInputs();
    tracks = showEditor.addTrack(tracks, editForm.elements.artist.value || gig.artist);
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
      syncTracksFromInputs();
      const update = showEditor.createEditPayload(Object.fromEntries(new FormData(editForm).entries()), { attendees: readAttendees(ensureEditAttendeePicker()), songs: tracks });
      const files = pendingMedia.get(editMediaInput) || [...(editMediaInput?.files || [])];
      const { saved, media } = await showFormController.updateShow({
        gig, update, mediaFiles: files,
        saveShow: (record, payload) => fetchJson(`/api/gigs/${record.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
        uploadFiles: (record, uploads) => uploadGigMedia(record.id, uploads, (file, fraction) => { editMessage.textContent = fraction >= 1 ? `Upload complete · preparing mobile playback for ${file.name}…` : `Uploading ${file.name} · ${Math.round(fraction * 100)}%`; }),
        addExternalMedia: (record) => addYouTubeMedia(record.id, editYoutubeMediaInput),
        refreshMedia: (record) => fetchJson(`/api/gigs/${record.id}/media`)
      });
      Object.assign(gig, saved);
      gigs = gigs.map((entry) => entry.id === gig.id ? gig : entry);
      editMessage.textContent = files.length ? 'Show and media saved.' : 'Show saved.';
      editMessage.classList.remove('error');
      editMediaInput.value = '';
      renderEditMediaWorkspace(gig, media);
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
  const hasMissingAlbums = () => gig.songs?.some((song) => !String(song.album || '').trim() || /^unknown album$/i.test(String(song.album).trim()));
  findAlbumInfo.hidden = !hasMissingAlbums();
  albumLookupMessage.textContent = '';
  if (gig.songs?.length) fetchJson(`/api/gigs/${encodeURIComponent(gig.id)}/album-stats`).then((data) => { gig.songs = data.songs; showDetailSetlist.innerHTML = `<ol>${renderTrackList(gig.songs)}</ol>${renderAlbumStats(gig.songs)}`; findAlbumInfo.hidden = !hasMissingAlbums(); }).catch(() => {});
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

findAlbumInfo?.addEventListener('click', async () => {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  if (!gig?.songs?.length) return;
  findAlbumInfo.disabled = true;
  findAlbumInfo.textContent = 'Searching albums…';
  albumLookupMessage.classList.remove('error');
  albumLookupMessage.textContent = 'Searching by track title and artist…';
  try {
    const data = await fetchJson(`/api/gigs/${encodeURIComponent(gig.id)}/album-stats?refresh=1`);
    gig.songs = data.songs;
    showDetailSetlist.innerHTML = `<ol>${renderTrackList(gig.songs)}</ol>${renderAlbumStats(gig.songs)}`;
    const remaining = gig.songs.filter((song) => !String(song.album || '').trim() || /^unknown album$/i.test(String(song.album).trim())).length;
    findAlbumInfo.hidden = remaining === 0;
    albumLookupMessage.textContent = remaining ? `${remaining} track${remaining === 1 ? '' : 's'} could not be matched. You can enter those manually on the edit page.` : 'Album information updated.';
  } catch (error) {
    albumLookupMessage.textContent = error.message;
    albumLookupMessage.classList.add('error');
  } finally {
    findAlbumInfo.disabled = false;
    findAlbumInfo.textContent = 'Find album info';
  }
});

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
  return playbackCore.activateSource(entry, sourceIndex);
}
function setQueueEntryTitle(gig, entry) {
  return playbackCore.entryTitle(gig, entry);
}
function setQueueEntryKey(entry) {
  return playbackCore.entryKey(entry);
}
function buildSetPlaybackQueue(gig) {
  return playbackCore.buildQueue(gig);
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
  return playbackCore.nextPlayableIndex(setQueue, start, direction);
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
    const videoId = playbackMedia.youtubeVideoId(entry.media.url);
    activeYoutubeVideoId = videoId;
    armSetSourceLoadTimer();
    activeYoutubePlayer.loadVideoById({ videoId, startSeconds: playbackBounds(entry).start });
    return;
  }
  if (activeYoutubePlayer) { try { activeYoutubePlayer.destroy(); } catch {} activeYoutubePlayer = null; activeYoutubeVideoId = ''; }
  const nextIndex = nextPlayableSetIndex(setQueueIndex + 1, 1);
  const next = nextIndex >= 0 ? setQueue[nextIndex] : null;
  setPlayerStage.innerHTML = playbackMedia.stageMarkup({ entry, next, songTitle: song.title, escapeHtml, youtubeEmbedUrl });
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
theatreController = theatreControllerModule.createController({
  document, window, player: setPlayer, fullscreenButton: setPlayerFullscreen, controlsToggle: setPlayerControlsToggle,
  theatre: theatreUi, isPlaying: setPlaybackIsPlaying, timelineActive: () => Boolean(timelinePointer),
  requestWakeLock: requestSetPlaybackWakeLock, releaseWakeLock: releaseSetPlaybackWakeLock,
  commands: {
    next: () => moveToPlayableTrack(1), previous: () => moveToPlayableTrack(-1),
    'toggle-playback': toggleSetPlayback, 'toggle-mute': toggleSetMute,
    'toggle-theatre': () => theatreController.toggle()
  },
  setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window)
});
theatreController.bind();
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

const authController = authControllerModule.createController({
  window, fetchJson,
  elements: { panel: authPanel, profileBar, setupForm, loginForm, registerForm, message: authMessage, logoutButton, accountForm, accountMessage },
  onSignedIn: (signedIn) => { account = signedIn; activeProfileId = account.id; },
  onLoggedOut: () => { account = null; activeProfileId = ''; },
  onAccountUpdated: (updated) => { account = updated; }
});
authController.bind();
function showAuth(status) { return authController.show(status); }
const peerSettingsController = peerSettingsModule.createController({
  window, navigator, fetchJson, escapeHtml,
  elements: { instanceId, publicKey: instancePublicKey, form: peerForm, message: peerMessage, list: peerList, createInviteButton: createPeerInvite, inviteMessage: peerInviteMessage, inviteToken: peerInviteToken, importInviteButton: importPeerInvite },
  onPeers: (nextPeers) => { peers = nextPeers; },
  onSynced: async () => {
    gigs = await fetchJson('/api/gigs');
    populateYearFilter();
    renderGigs();
    await refreshCollaboration();
    await loadPeerNotifications();
  }
});
peerSettingsController.bind();
async function renderInstanceSettings() { if (account) return peerSettingsController.render(); }
inviteButton.addEventListener('click', async () => {
  try {
    const invite = await fetchJson('/api/auth/invites', { method: 'POST' });
    await navigator.clipboard.writeText(invite.inviteUrl);
    setSharedMessage('Invite link copied. It expires in seven days.');
  } catch (error) { setSharedMessage(error.message, true); }
});
exportArchiveButton?.addEventListener('click', async () => { try { const data = await fetchJson('/api/archive/export'); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `the-master-list-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); maintenanceMessage.textContent = 'Shows JSON exported.'; } catch (error) { maintenanceMessage.textContent = error.message; maintenanceMessage.classList.add('error'); } });
importArchiveInput?.addEventListener('change', async () => { const file = importArchiveInput.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()); await fetchJson('/api/archive/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); maintenanceMessage.textContent = `Imported ${data.gigs?.length || 0} shows. Reloading…`; window.location.reload(); } catch (error) { maintenanceMessage.textContent = error.message; maintenanceMessage.classList.add('error'); } finally { importArchiveInput.value = ''; } });

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
  const payload = showEditor.createAddPayload(gig, { attendees: readAttendees(addAttendeePicker), setlist: selectedSetlist });
  const submitButton = form.querySelector('button[type="submit"]');
  try {
    submitButton.disabled = true;
    const { saved, uploadsQueued } = await showFormController.createShow({
      payload, mediaFiles, mobile: isMobileUpload,
      saveShow: (body) => fetchJson('/api/gigs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      queueMobileUploads: async (record) => {
        const uploadState = mobileUploadStateFor(mediaInput, record.id);
        uploadState.releaseAfterDrain = true;
        startMobileUploadQueue(mediaInput, record.id, (item) => {
          setMessage(`${item.name} uploaded. Continuing the queue…`);
        }, async () => {
          try { await pollMediaRecognition(record.id, (refreshed) => { gigs = gigs.map((entry) => entry.id === record.id ? { ...entry, media: refreshed } : entry); renderGigs(); }); } catch { /* the upload itself already succeeded */ }
        });
      },
      uploadFiles: (record, uploads) => uploadGigMedia(record.id, uploads, (file, fraction) => setMessage(fraction >= 1 ? `Upload complete · preparing mobile playback for ${file.name}…` : `Uploading ${file.name} · ${Math.round(fraction * 100)}%`)),
      addExternalMedia: (record) => addYouTubeMedia(record.id, youtubeMediaInput)
    });
    gigs.unshift(saved);
    form.reset();
    resetReviewForm();
    selectedSetlist = null;
    results.hidden = true;
    addDuplicateWarning.hidden = true;
    setMessage(uploadsQueued ? 'Show saved. Uploads are continuing in the queue.' : 'Show saved to The Master List.');
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
  window.MasterListShowCards.setupMediaSection(card, media, options, renderMediaGallery);
}

function setupArtifactSection(card, gig) {
  window.MasterListShowCards.setupArtifactSection(card, gig, renderMediaGallery);
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
  return window.MasterListShowCards.createRemoteCard({ template: document.querySelector('#gig-template'), show, formatGigDate, escapeHtml, setupArtistVisual: setupArchiveArtistVisual, setupSetlist: setupArchiveSetlist });
}

function renderGigs() {
  const remoteShows = remoteSharedArchiveShows();
  const allShows = [...gigs, ...remoteShows];
  const stats = window.MasterListShows.archiveStats(gigs, remoteShows);
  count.textContent = `${allShows.length} show${allShows.length === 1 ? '' : 's'}`;
  archiveStats.innerHTML = `<span>${stats.shows} shows</span><span>${stats.artists} artists</span><span>${stats.venues} venues</span><span>${stats.favourites} favourites</span><span>${stats.songs} songs</span>`;
  const query = showFilter?.value.trim().toLowerCase() || '';
  const year = yearFilter?.value || '';
  const sort = sortFilter?.value || 'newest';
  const { local: orderedGigs, remote: orderedRemoteShows } = window.MasterListShows.selectArchiveShows({ gigs, remoteShows, query, year, favouritesOnly: Boolean(favouriteFilter?.checked), sort });
  const { compareDates } = window.MasterListShows;
  emptyState.hidden = Boolean(orderedGigs.length || orderedRemoteShows.length);
  gigList.replaceChildren();
  for (const gig of orderedGigs) {
    const card = window.MasterListShowCards.createLocalCard({
      document,
      template: document.querySelector('#gig-template'),
      gig,
      sharedShows,
      formatGigDate,
      escapeHtml,
      setupArtistVisual: setupArchiveArtistVisual,
      renderAttendeeSummary,
      setupSetlist: setupArchiveSetlist,
      setupExports: setupExportButtons,
      setupMedia: setupShowMediaSection,
      setupArtifacts: setupArtifactSection,
      patchGig: (id, body) => fetchJson(`/api/gigs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      deleteGig: (id) => fetchJson(`/api/gigs/${id}`, { method: 'DELETE' }),
      onUpdate: (updated) => { gigs = gigs.map((entry) => entry.id === updated.id ? updated : entry); renderGigs(); },
      onDelete: (removed) => { gigs = gigs.filter((item) => item.id !== removed.id); renderGigs(); },
      onError: (error) => setMessage(error.message, true),
      confirm: window.confirm.bind(window)
    });
    gigList.append(card);
  }
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

const cityPageController = locationsPageModule.createCityController({
  page, window, getGigs: () => gigs, escapeHtml,
  elements: { heading: document.querySelector('#city-heading'), subtitle: document.querySelector('#city-subtitle'), venues: document.querySelector('#city-venues') }
});
function renderCityPage() { return cityPageController.render(); }

function populateYearFilter() {
  if (!yearFilter) return;
  const selected = yearFilter.value;
  yearFilter.replaceChildren(new Option('All years', ''));
  [...new Set([...gigs, ...remoteSharedArchiveShows()].map((gig) => gig.date.slice(0, 4)).filter(Boolean))].sort().reverse().forEach((year) => yearFilter.add(new Option(year, year)));
  yearFilter.value = selected;
}

[showFilter, yearFilter, sortFilter, favouriteFilter].forEach((control) => control?.addEventListener('input', renderGigs));

const mapPageController = locationsPageModule.createMapController({
  page, getGigs: () => gigs, loadLeaflet: () => pageRuntime.loadLeaflet({ document, window }),
  getLeaflet: () => window.L, fetchJson, escapeHtml,
  elements: { button: loadMapButton, message: mapMessage, mapElement }
});
mapPageController.bind();

const authorizeAppleMusic = playlistExportModule.createAppleAuthorizer({ window, document });
const playlistExporter = playlistExportModule.createExporter({
  getIntegrations: () => integrations, providerName, fetchJson,
  navigate: (href) => window.location.assign(href), document, authorizeAppleMusic
});
function setupExportButtons(exports, gig) { return playlistExporter.setupButtons(exports, gig); }

async function initializeApp() {
  if (page === 'shared') { window.location.replace('/shows'); return; }
  const auth = await fetchJson('/api/auth/status');
  const authState = window.MasterListAuthState.resolveAuthState(auth, page);
  account = authState.account;
  window.MasterListAuthState.applyAuthState(authState, { navSignIn, authPanel, profileBar, inviteButton, accountName: accountForm?.elements.name });
  if (authState.redirectToLogin) { window.location.replace('/login'); return; }
  if (!authState.authenticated) {
    showAuth(auth);
    return;
  } else {
    activeProfileId = account.id;
  }
  const data = await pageRuntime.loadPageData(page, { authenticated: true, fetchJson });
  ({ gigs, integrations, profiles, sharedShows, peers } = data);
  if (pageRuntime.requirementsFor(page).includes('gigs')) {
    const total = gigs.length + (pageRuntime.requirementsFor(page).includes('sharedShows') ? remoteSharedArchiveShows().length : 0);
    count.textContent = `${total} show${total === 1 ? '' : 's'}`;
  } else {
    const stats = await fetchJson('/api/stats').catch(() => null);
    if (stats) count.textContent = `${stats.shows} show${stats.shows === 1 ? '' : 's'}`;
  }
  const controllers = {
    home: async () => {},
    login: async () => {},
    overview: renderDashboardStats,
    artists: renderEntityDirectories,
    venues: renderEntityDirectories,
    timeline: async () => renderTimeline(),
    search: async () => renderGlobalSearch(),
    health: renderArchiveHealth,
    'api-limits': renderApiLimits,
    maintenance: renderMaintenance,
    activity: renderActivity,
    conflicts: renderConflicts,
    add: async () => { renderAttendeePicker(addAttendeePicker, []); populateShowAutofill(); },
    shows: async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('connected')) setMessage(`${providerName(params.get('connected'))} connected. Choose a show to export.`);
      if (params.get('integrationError')) setMessage('Could not connect that music service. Check its configuration and try again.', true);
      populateYearFilter(); renderGigs();
    },
    artist: renderArtistPage,
    'artist-edit': renderArtistEditPage,
    show: async () => renderShowPage(),
    playback: async () => renderShowPage(),
    city: async () => renderCityPage(),
    venue: renderVenuePage,
    'venue-edit': renderVenueEditPage,
    edit: async () => { populateShowAutofill(); renderEditPage(); },
    map: () => mapPageController.render(),
    account: async () => { renderProfiles(); renderSharedShows(); await renderInstanceSettings(); }
  };
  await pageRuntime.runController(page, controllers, { account, data });
  await loadPeerNotifications();
  await loadConflictCount();
  peerPollTimer = setTimeout(pollConnectedPeers, 5_000);
}

initializeApp().catch((error) => setMessage(error.message, true));
