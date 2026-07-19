const form = document.querySelector('#gig-form');
const { escapeHtml, formatGigDate, formatBytes, providerName } = window.MasterListFormatters;
const playbackCore = window.MasterListPlaybackCore;
const playbackMedia = window.MasterListPlaybackMedia;
const playbackEditor = window.MasterListPlaybackEditor;
const playbackEditorControllerModule = window.MasterListPlaybackEditorController;
const playbackTimelineControllerModule = window.MasterListPlaybackTimelineController;
const setPlaybackControllerModule = window.MasterListSetPlaybackController;
const youtubeShowSearchModule = window.MasterListYoutubeShowSearch;
const profileShowListModule = window.MasterListProfileShowList;
const showFormUiModule = window.MasterListShowFormUi;
const peerSyncPollerModule = window.MasterListPeerSyncPoller;
const mediaLightboxModule = window.MasterListMediaLightbox;
const appBootstrapModule = window.MasterListAppBootstrap;
const pageControllersModule = window.MasterListPageControllers;
const editMediaUploadModule = window.MasterListEditMediaUpload;
const youtubePlayerApiModule = window.MasterListYoutubePlayerApi;
const addMediaUploadModule = window.MasterListAddMediaUpload;
const shellRouter = window.MasterListShellRouter;
const uploadLeaveGuardModule = window.MasterListUploadLeaveGuard;
const externalMediaInputModule = window.MasterListExternalMediaInput;
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
const uploadLeaveGuard = uploadLeaveGuardModule.createGuard({ window, jobQueue, isMobileBusy: () => mobileUploadController.isBusy(editMediaInput) });
uploadLeaveGuard.bind();
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

const page = shellRouter.apply(document);
const chestButton = document.querySelector('#open-chest');
shellRouter.bindChest(window, chestButton);

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
const {
  previousButton: setPlayerPrev, restartButton: setPlayerRestart, controlsToggle: setPlayerControlsToggle
} = setPlaybackControllerModule.createTransportControls({ document, player: setPlayer, nextButton: setPlayerNext, fullscreenButton: setPlayerFullscreen });
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
const formatPlaybackTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const youtubePlayerApi = youtubePlayerApiModule.createLoader({ window, document });
function loadYouTubeApi() { return youtubePlayerApi.load(); }
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

const showFormUiController = showFormUiModule.createController({
  document, window, editor: showEditor, escapeHtml, formatGigDate,
  getGigs: () => gigs, getSharedShows: () => sharedShows, getPeers: () => peers, getAccount: () => account,
  elements: { addForm: form, favoriteChoice, message, editForm, editAttendeePicker }
});
showFormUiController.bind();
function populateShowAutofill() { return showFormUiController.populateAutofill(); }
function resetReviewForm() { return showFormUiController.resetReview(); }
function showDuplicateWarning(container, values, excludeId = '') { return showFormUiController.showDuplicateWarning(container, values, excludeId); }
function confirmDuplicateSave(container, values, excludeId = '') { return showFormUiController.confirmDuplicateSave(container, values, excludeId); }
function renderAttendeePicker(container, selected = []) { return showFormUiController.renderAttendees(container, selected); }
function readAttendees(container) { return showFormUiController.readAttendees(container); }
function ensureEditAttendeePicker() { return showFormUiController.ensureEditAttendeePicker(); }
function setMessage(text, isError = false) { return showFormUiController.setMessage(text, isError); }
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

const peerSyncPoller = peerSyncPollerModule.createPoller({
  fetchJson, getAccount: () => account, loadNotifications: loadPeerNotifications, loadConflicts: loadConflictCount,
  onArchive: ({ gigs: nextGigs, sharedShows: nextSharedShows }) => {
    gigs = nextGigs; sharedShows = nextSharedShows; populateYearFilter(); renderGigs();
  },
  setTimeoutFn: setTimeout, clearTimeoutFn: clearTimeout
});

async function pollMediaRecognition(gigId, onMedia) {
  return mediaJobs.pollRecognition({ fetchMedia: () => fetchJson(`/api/gigs/${gigId}/media`), onUpdate: onMedia });
}

function uploadGigMedia(gigId, files, onProgress = () => {}, category = 'show') {
  return gigMediaUploader.upload(gigId, files, onProgress, category);
}

const externalMediaInput = externalMediaInputModule.createController({ fetchJson });
function addYouTubeMedia(gigId, input) { return externalMediaInput.add(gigId, input); }

function youtubeEmbedUrl(url, options = {}) { return playbackMedia.youtubeEmbedUrl(url, { ...options, origin: window.location.origin }); }
const mediaLightboxController = mediaLightboxModule.createController({
  elements: { lightbox: mediaLightbox, image: mediaLightboxImage, video: mediaLightboxVideo, caption: mediaLightboxCaption, closeButton: mediaLightboxClose }
});
mediaLightboxController.bind();
function openMediaLightbox(item) { return mediaLightboxController.open(item); }

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
  return profileShowListModule.appendAttendeeSummary({ document, container, gig, attendeeNames, prefix });
}

const profileShowListRenderer = profileShowListModule.createRenderer({
  template: document.querySelector('#gig-template'), escapeHtml, formatGigDate, renderAttendeeSummary, setupMedia: setupShowMediaSection
});
function renderArtistShows(records) { return profileShowListRenderer.renderArtist(artistShows, records); }
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
const directoryMetadataLoader = directoryPageModule.createMetadataLoader({ fetchJson });
function loadDirectoryMetadata() { return directoryMetadataLoader.load(); }

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

function renderVenueShows(records) { return profileShowListRenderer.renderVenue(venueShows, records); }
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

const editMediaUploadController = editMediaUploadModule.createController({
  isMobile: () => isMobileUpload, input: editMediaInput, message: editMessage, pendingFiles: pendingMedia,
  mobileState: mobileUploadStateFor, startMobileQueue: startMobileUploadQueue,
  pollRecognition: pollMediaRecognition, renderWorkspace: renderEditMediaWorkspace,
  uploadFiles: uploadGigMedia, fetchJson
});
const editShowPageController = editShowPageModule.createController({
  page, gigId: editGigId, FormDataClass: FormData, fetchJson, editor: showEditor, workflow: showFormController, trackEditor: editTrackListController,
  getGigs: () => gigs, onGigs: (nextGigs) => { gigs = nextGigs; },
  setupImmediateUpload: editMediaUploadController.setup,
  showDuplicateWarning, confirmDuplicateSave, ensureAttendeePicker: ensureEditAttendeePicker,
  renderAttendees: renderAttendeePicker, readAttendees,
  renderMediaWorkspace: renderEditMediaWorkspace,
  getMediaFiles: editMediaUploadController.files,
  uploadFiles: editMediaUploadController.uploadForSave,
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

const setPlaybackController = setPlaybackControllerModule.createController({
  document, window, navigatorApi: navigator, storage: localStorage, getGigs: () => gigs, showId: showDetailId,
  escapeHtml, formatPlaybackTime, loadYouTubeApi, youtubeEmbedUrl, playbackCore, playbackMedia,
  timelineControllerModule: playbackTimelineControllerModule, theatreControllerModule, theatreUi,
  mediaQuery: matchMedia('(max-width: 640px)'),
  setTimeoutFn: setTimeout, clearTimeoutFn: clearTimeout, setIntervalFn: setInterval, clearIntervalFn: clearInterval,
  elements: {
    playButton: playWholeSet, player: setPlayer, title: setPlayerTitle, stage: setPlayerStage,
    nextButton: setPlayerNext, previousButton: setPlayerPrev, restartButton: setPlayerRestart,
    fullscreenButton: setPlayerFullscreen, controlsToggle: setPlayerControlsToggle, status: setPlayerStatus,
    progress: setPlayerProgress, markers: setPlayerMarkers, timeline: setPlayerTimeline, overview: setPlayerOverview,
    overviewProgress: setPlayerOverviewProgress, overviewMarkers: setPlayerOverviewMarkers,
    elapsed: setPlayerElapsed, total: setPlayerTotal, sourceKind: setPlayerSourceKind, sourceLabel: setPlayerSourceLabel,
    contextPrevious: setPlayerContextPrevious, contextCurrent: setPlayerContextCurrent, contextNext: setPlayerContextNext
  }
});
const youtubeShowSearch = youtubeShowSearchModule.createController({
  fetchJson, escapeHtml, getGigs: () => gigs, showId: showDetailId, renderMediaGallery,
  elements: { searchButton: findYouTubeSet, results: youtubeResults, message: youtubeSearchMessage, gallery: showDetailGallery }
});
youtubeShowSearch.bind();

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
const addMediaUploadController = addMediaUploadModule.createController({
  input: mediaInput, pendingFiles: pendingMedia, mobileState: mobileUploadStateFor,
  startMobileQueue: startMobileUploadQueue, pollRecognition: pollMediaRecognition,
  uploadFiles: uploadGigMedia, setMessage,
  onRecognized: (record, media) => { gigs = gigs.map((entry) => entry.id === record.id ? { ...entry, media } : entry); renderGigs(); }
});
const addShowPageController = addShowPageModule.createController({
  URLSearchParamsClass: URLSearchParams, FormDataClass: FormData, fetchJson, escapeHtml,
  editor: showEditor, workflow: showFormController,
  getAttendees: () => readAttendees(addAttendeePicker),
  getMediaFiles: addMediaUploadController.files,
  isMobile: () => isMobileUpload,
  confirmDuplicateSave, showDuplicateWarning,
  queueMobileUploads: addMediaUploadController.queueMobile,
  uploadFiles: addMediaUploadController.uploadForSave,
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

const pageControllers = pageControllersModule.createRegistry({
  window, providerName, setMessage,
  actions: {
    renderDashboard: renderDashboardStats, renderDirectories: renderEntityDirectories, renderTimeline, renderSearch: renderGlobalSearch,
    renderHealth: renderArchiveHealth, renderApiLimits, renderMaintenance, renderActivity, renderConflicts,
    renderAddAttendees: () => renderAttendeePicker(addAttendeePicker, []), populateAutofill: populateShowAutofill,
    populateYears: populateYearFilter, renderGigs, renderArtist: renderArtistPage, renderArtistEdit: renderArtistEditPage,
    renderShow: renderShowPage, renderCity: renderCityPage, renderVenue: renderVenuePage, renderVenueEdit: renderVenueEditPage,
    renderEdit: renderEditPage, renderMap: () => mapPageController.render(), renderProfiles, renderSharedShows, renderInstanceSettings
  }
});
const appBootstrap = appBootstrapModule.createBootstrap({
  window, page, fetchJson, runtime: pageRuntime, authStateModule: window.MasterListAuthState,
  authElements: { navSignIn, authPanel, profileBar, inviteButton, accountName: accountForm?.elements.name },
  showAuth, onAccount: (nextAccount) => { account = nextAccount; },
  onAuthenticated: (signedIn) => { activeProfileId = signedIn.id; },
  onData: (data) => { ({ gigs, integrations, profiles, sharedShows, peers } = data); },
  remoteShowCount: () => remoteSharedArchiveShows().length, controllers: pageControllers, countElement: count,
  afterRun: async () => { await loadPeerNotifications(); await loadConflictCount(); peerSyncPoller.start(5_000); }
});
function initializeApp() { return appBootstrap.initialize(); }

initializeApp().catch((error) => setMessage(error.message, true));
