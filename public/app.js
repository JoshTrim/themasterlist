const form = document.querySelector('#gig-form');
const { escapeHtml, formatGigDate, formatBytes, providerName } = window.MasterListFormatters;
const playbackCore = window.MasterListPlaybackCore;
const playbackMedia = window.MasterListPlaybackMedia;
const playbackEditor = window.MasterListPlaybackEditor;
const playbackEditorControllerModule = window.MasterListPlaybackEditorController;
const playbackTimelineControllerModule = window.MasterListPlaybackTimelineController;
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
const sharedShowsPageModule = window.MasterListSharedShowsPage;
const archivePageModule = window.MasterListArchivePage;
const addShowPageModule = window.MasterListAddShowPage;
const trackListEditorModule = window.MasterListTrackListEditor;
const editShowPageModule = window.MasterListEditShowPage;
const setlistPresentationModule = window.MasterListSetlistPresentation;
const showDetailPageModule = window.MasterListShowDetailPage;
const mobileUploadControllerModule = window.MasterListMobileUploadController;
const formatUploadSize = mobileUploadControllerModule.formatSize;
const mediaWorkspaceControllerModule = window.MasterListMediaWorkspaceController;
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
  const queuedMobileUpload = mobileUploadController.isBusy(editMediaInput);
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
let gigs = [];
let integrations = {};
let profiles = [];
let peers = [];
let sharedShows = [];
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
const isMobileUpload = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const gigMediaUploader = mediaUploaderModule.createUploader({ fetch: (...args) => window.fetch(...args), XMLHttpRequest: window.XMLHttpRequest, AbortController: window.AbortController, randomUUID: () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, updateJob, isMobile: () => isMobileUpload });
const mobileUploadController = mobileUploadControllerModule.createController({
  document, navigator, isMobile: () => isMobileUpload, queue: uploadQueue,
  uploadFiles: (gigId, files, onProgress, category) => uploadGigMedia(gigId, files, onProgress, category),
  pendingFiles: pendingMedia, escapeHtml
});
mobileUploadController.bind();
mobileUploadController.setup(mediaInput);
mobileUploadController.setup(editMediaInput);
mobileUploadController.addClearButton(mediaInput);
mobileUploadController.addClearButton(editMediaInput);
function mobileUploadStateFor(input, gigId = '', category = 'show') { return mobileUploadController.stateFor(input, gigId, category); }
function startMobileUploadQueue(input, gigId, onUploaded, onDrained, category = 'show') { return mobileUploadController.start(input, gigId, onUploaded, onDrained, category); }

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
const playbackTimelineController = playbackTimelineControllerModule.createController({
  core: playbackCore, escapeHtml, formatPlaybackTime,
  getGig: () => gigs.find((entry) => entry.id === showDetailId), getQueue: () => setQueue,
  getIndex: () => setQueueIndex, setIndex: (index) => { setQueueIndex = index; },
  getZoom: () => setTimelineZoom, setZoom: (zoom) => { setTimelineZoom = zoom; },
  entryTitle: setQueueEntryTitle, bounds: playbackBounds, timeAt: playbackTimeAt,
  playTrack: () => playSetTrack(), setPendingSeek: (seek) => { pendingSetSeek = seek; },
  getYoutubePlayer: () => activeYoutubePlayer,
  elements: {
    player: setPlayer, stage: setPlayerStage, timeline: setPlayerTimeline, progress: setPlayerProgress,
    markers: setPlayerMarkers, overview: setPlayerOverview, overviewProgress: setPlayerOverviewProgress,
    overviewMarkers: setPlayerOverviewMarkers, elapsed: setPlayerElapsed, total: setPlayerTotal, mediaQuery: setTimelineMedia
  }
});
playbackTimelineController.bind();
function setTimelineProgress(gig, mediaFraction = 0, currentSeconds = 0, durationSeconds = 0) { return playbackTimelineController.setProgress(gig, mediaFraction, currentSeconds, durationSeconds); }
function renderSetTimeline(gig) { return playbackTimelineController.render(gig); }
function applySetSeek(gig, fraction) { return playbackTimelineController.applySeek(gig, fraction); }
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
const mediaWorkspaceController = mediaWorkspaceControllerModule.createController({
  document, fetchJson, escapeHtml, formatSize: formatUploadSize, mediaUi, mediaJobs, updateJob,
  pollRecognition: pollMediaRecognition, renderGallery: renderMediaGallery, renderPlaybackEditor,
  elements: { gallery: editGallery, stats: mediaWorkspaceStats, filters: mediaWorkspaceFilters, empty: mediaWorkspaceEmpty, refreshButton: mediaWorkspaceRefresh }
});
mediaWorkspaceController.bind();
function refreshEditMediaWorkspace(gig) { return mediaWorkspaceController.refresh(gig); }
function renderEditMediaWorkspace(gig, media = []) { return mediaWorkspaceController.render(gig, media); }

const playbackEditorController = playbackEditorControllerModule.createController({
  document, fetchJson, escapeHtml, formatPlaybackTime, youtubeEmbedUrl, loadYouTubeApi,
  playbackCore, playbackEditor, getGigs: () => gigs, onGigs: (nextGigs) => { gigs = nextGigs; },
  editGigId, EventClass: Event, setIntervalFn: setInterval, clearIntervalFn: clearInterval,
  elements: {
    list: playbackEditorList, health: playbackEditorHealth, suggestions: playbackEditorSuggestions,
    message: playbackEditorMessage, suggestButton: autoBuildPlaybackPlan, saveButton: savePlaybackPlan
  }
});
function renderPlaybackEditor(gig) { return playbackEditorController.render(gig); }
function attendeeNames(gig) {
  return sharedShowsPageModule.attendeeNames(gig);
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
  page, fetchJson, escapeHtml, formatBytes, confirmAction: (prompt) => confirm(prompt), document,
  BlobClass: Blob, URLApi: URL, reload: () => window.location.reload(),
  elements: {
    summary: maintenanceSummary, message: maintenanceMessage, integrityList, cleanup: cleanupMediaButton,
    scheduleForm: backupScheduleForm, scheduleStatus: backupScheduleStatus, backupNow: backupNowButton,
    refreshIntegrity: refreshIntegrityButton, restoreInput: restoreDatabaseInput,
    stageRestore: stageRestoreButton, downloadLink: downloadDatabaseLink,
    exportArchive: exportArchiveButton, importArchive: importArchiveInput
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

const editTrackListController = trackListEditorModule.createController({
  document, editor: showEditor, escapeHtml, container: editSetlistTracks, addButton: addEditTrack,
  getDefaultArtist: () => editForm.elements.artist.value
});
editTrackListController.bind();

const editShowPageController = editShowPageModule.createController({
  page, gigId: editGigId, FormDataClass: FormData, fetchJson, editor: showEditor, workflow: showFormController, trackEditor: editTrackListController,
  getGigs: () => gigs, onGigs: (nextGigs) => { gigs = nextGigs; },
  setupImmediateUpload: (gig) => {
    if (editMediaInput.dataset.immediateUpload) return;
    editMediaInput.dataset.immediateUpload = 'true';
    if (isMobileUpload) {
      const state = mobileUploadStateFor(editMediaInput, gig.id);
      state.onUploaded = (item) => { editMessage.textContent = `${item.name} uploaded.`; editMessage.classList.remove('error'); };
      state.onDrained = async () => { await pollMediaRecognition(gig.id, (refreshed) => renderEditMediaWorkspace(gig, refreshed)); };
      startMobileUploadQueue(editMediaInput, gig.id, state.onUploaded, state.onDrained);
    } else editMediaInput.addEventListener('change', async () => {
      const files = pendingMedia.get(editMediaInput) || [...(editMediaInput.files || [])];
      if (!files.length) return;
      editMessage.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`;
      try {
        await uploadGigMedia(gig.id, files, (file, fraction) => { editMessage.textContent = `Uploading ${file.name} · ${Math.round(fraction * 100)}%`; });
        pendingMedia.set(editMediaInput, []);
        editMediaInput.value = '';
        editMessage.textContent = 'Media uploaded.';
        renderEditMediaWorkspace(gig, await fetchJson(`/api/gigs/${gig.id}/media`));
      } catch (error) { editMessage.textContent = error.message; editMessage.classList.add('error'); }
    });
  },
  showDuplicateWarning, confirmDuplicateSave, ensureAttendeePicker: ensureEditAttendeePicker,
  renderAttendees: renderAttendeePicker, readAttendees,
  renderMediaWorkspace: renderEditMediaWorkspace,
  getMediaFiles: () => pendingMedia.get(editMediaInput) || [...(editMediaInput?.files || [])],
  uploadFiles: (record, uploads) => uploadGigMedia(record.id, uploads, (file, fraction) => { editMessage.textContent = fraction >= 1 ? `Upload complete · preparing mobile playback for ${file.name}…` : `Uploading ${file.name} · ${Math.round(fraction * 100)}%`; }),
  addExternalMedia: (record) => addYouTubeMedia(record.id, editYoutubeMediaInput),
  renderArchive: renderGigs,
  elements: { form: editForm, message: editMessage, mediaInput: editMediaInput, duplicateWarning: editDuplicateWarning }
});
editShowPageController.bind();
function renderEditPage() { return editShowPageController.render(); }

function renderShowPage() { return showDetailPageController.render(); }
const setlistPresenter = setlistPresentationModule.createController({ document, fetchJson, escapeHtml });
setlistPresenter.bindTooltips();
function renderAlbumStats(songs) { return setlistPresenter.albumStats(songs); }
function renderTrackList(songs, albumFallback = 'Album data unavailable') { return setlistPresenter.trackList(songs, albumFallback); }
function setupArchiveSetlist(setlist, gig, options = {}) { return setlistPresenter.setupArchive(setlist, gig, options); }

const showDetailPageController = showDetailPageModule.createController({
  page, window, URLSearchParamsClass: URLSearchParams, setTimeoutFn: setTimeout,
  showId: showDetailId, getGigs: () => gigs, fetchJson, escapeHtml, formatDate: formatGigDate, attendeeNames,
  hasMissingAlbums: setlistPresentationModule.hasMissingAlbums, renderTrackList, renderAlbumStats, renderMediaGallery,
  startPlayback: () => playWholeSet?.click(),
  elements: {
    heading: showDetailHeading, place: showDetailPlace, date: showDetailDate, notes: showDetailNotes,
    venueNotes: showDetailVenueNotes, attendees: document.querySelector('#show-detail-attendees'), ratings: showDetailRatings,
    setlist: showDetailSetlist, editLink: showEditLink, noMedia: showDetailNoMedia, noArtifacts: showDetailNoArtifacts,
    navTrackCount: showNavTrackCount, navMediaCount: showNavMediaCount, navArtifactCount: showNavArtifactCount,
    facts: showMemoryFacts, gallery: showDetailGallery, artifactGallery: showDetailArtifacts,
    findAlbums: findAlbumInfo, albumMessage: albumLookupMessage
  }
});
showDetailPageController.bind();

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
  theatre: theatreUi, isPlaying: setPlaybackIsPlaying, timelineActive: playbackTimelineController.isActive,
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

const sharedShowsController = sharedShowsPageModule.createController({
  document, OptionClass: Option, navigator, fetchJson, escapeHtml, formatDate: formatGigDate,
  getState: () => ({ gigs, sharedShows, profiles, activeProfileId, account }),
  onActiveProfile: (id) => { activeProfileId = id; },
  onData: (data) => { profiles = data.profiles; sharedShows = data.sharedShows; },
  elements: { profileSelect, message: sharedMessage, list: sharedList, template: document.querySelector('#shared-template'), inviteButton }
});
sharedShowsController.bind();
function renderProfiles() { return sharedShowsController.renderProfiles(); }
function renderSharedShows() { return sharedShowsController.render(); }
function refreshCollaboration() { return sharedShowsController.refresh(); }

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
const addShowPageController = addShowPageModule.createController({
  URLSearchParamsClass: URLSearchParams, FormDataClass: FormData, fetchJson, escapeHtml,
  editor: showEditor, workflow: showFormController,
  getAttendees: () => readAttendees(addAttendeePicker),
  getMediaFiles: () => pendingMedia.get(mediaInput) || [...(mediaInput?.files || [])],
  isMobile: () => isMobileUpload,
  confirmDuplicateSave, showDuplicateWarning,
  queueMobileUploads: async (record) => {
    const uploadState = mobileUploadStateFor(mediaInput, record.id);
    uploadState.releaseAfterDrain = true;
    startMobileUploadQueue(mediaInput, record.id, (item) => setMessage(`${item.name} uploaded. Continuing the queue…`), async () => {
      try { await pollMediaRecognition(record.id, (refreshed) => { gigs = gigs.map((entry) => entry.id === record.id ? { ...entry, media: refreshed } : entry); renderGigs(); }); } catch { /* the upload itself already succeeded */ }
    });
  },
  uploadFiles: (record, uploads) => uploadGigMedia(record.id, uploads, (file, fraction) => setMessage(fraction >= 1 ? `Upload complete · preparing mobile playback for ${file.name}…` : `Uploading ${file.name} · ${Math.round(fraction * 100)}%`)),
  addExternalMedia: (record) => addYouTubeMedia(record.id, youtubeMediaInput),
  onSaved: (saved) => { gigs.unshift(saved); },
  afterSaved: async () => { renderGigs(); await loadPersistentJobs(); await renderDashboardStats(); },
  resetReviewForm,
  elements: { form, results, message, duplicateWarning: addDuplicateWarning, findButton: document.querySelector('#find-setlist') }
});
addShowPageController.bind();

const archivePageController = archivePageModule.createController({
  window, document, OptionClass: Option, fetchJson, escapeHtml, formatDate: formatGigDate,
  showsModule: window.MasterListShows, cardsModule: window.MasterListShowCards,
  getState: () => ({ gigs, sharedShows }), onGigs: (nextGigs) => { gigs = nextGigs; }, setMessage,
  renderAttendeeSummary, setupSetlist: setupArchiveSetlist, setupExports: setupExportButtons, renderMediaGallery,
  elements: { count, stats: archiveStats, list: gigList, empty: emptyState, queryInput: showFilter, yearInput: yearFilter, sortInput: sortFilter, favouriteInput: favouriteFilter, template: document.querySelector('#gig-template') }
});
archivePageController.bind();
function remoteSharedArchiveShows() { return archivePageController.remoteShows(); }
function setupShowMediaSection(card, media = [], options = {}) { return archivePageController.setupMedia(card, media, options); }
function setupArtifactSection(card, gig) { return archivePageController.setupArtifacts(card, gig); }
function setupArchiveArtistVisual(card, artist) { return archivePageController.setupArtistVisual(card, artist); }

function renderGigs() { return archivePageController.render(); }

const cityPageController = locationsPageModule.createCityController({
  page, window, getGigs: () => gigs, escapeHtml,
  elements: { heading: document.querySelector('#city-heading'), subtitle: document.querySelector('#city-subtitle'), venues: document.querySelector('#city-venues') }
});
function renderCityPage() { return cityPageController.render(); }

function populateYearFilter() {
  return archivePageController.populateYears();
}

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
