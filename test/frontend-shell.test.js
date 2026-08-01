const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'public/lib/app-bootstrap.js'), 'utf8');

describe('frontend shell contracts', () => {
  test('declares every navigable page before styles load to prevent a flash of all pages', () => {
    const routes = ['/overview', '/artists', '/venues', '/timeline', '/search', '/health', '/maintenance', '/activity', '/conflicts', '/api-limits', '/shows', '/artist', '/show', '/playback', '/city', '/edit', '/venue', '/add', '/map', '/account'];
    routes.forEach((route) => assert.match(html, new RegExp(`['"]${route.replace('/', '\\/')}['"]`), route));
    assert.ok(html.indexOf('document.body.dataset.page') < html.indexOf('<main>'));
  });

  test('loads shared frontend modules before the application bundle', () => {
    for (const module of ['api-client', 'page-runtime', 'formatters', 'navigation', 'auth-state', 'jobs', 'shows', 'show-cards', 'playback-core', 'playback-media', 'media-lightbox', 'app-bootstrap', 'page-controllers', 'edit-media-upload', 'youtube-player-api', 'add-media-upload', 'shell-router', 'upload-leave-guard', 'external-media-input', 'playback-editor', 'playback-editor-controller', 'playback-timeline-controller', 'set-playback-controller', 'youtube-show-search', 'profile-show-list', 'show-form-ui', 'peer-sync-poller', 'theatre', 'theatre-controller', 'media-ui', 'media-uploader', 'media-gallery', 'upload-queue', 'media-jobs', 'show-editor', 'show-form-controller', 'directory-ui', 'archive-search', 'timeline-page', 'overview-page', 'entity-profile-page', 'metadata-editor', 'api-limits-page', 'activity-page', 'conflicts-page', 'health-page', 'maintenance-page', 'directory-page', 'locations-page', 'playlist-export', 'auth-controller', 'peer-settings', 'notification-center', 'shared-shows-page', 'archive-page', 'add-show-page', 'track-list-editor', 'edit-show-page', 'setlist-presentation', 'show-detail-page', 'mobile-upload-controller', 'media-workspace-controller', 'pwa']) {
      assert.ok(html.indexOf(`/lib/${module}.js`) < html.indexOf('/app.js'), module);
    }
    for (const global of ['MasterListApiClient', 'MasterListPageRuntime', 'MasterListFormatters', 'MasterListNavigation', 'MasterListAuthState', 'MasterListJobs', 'MasterListShows', 'MasterListShowCards', 'MasterListPlaybackCore', 'MasterListPlaybackMedia', 'MasterListMediaLightbox', 'MasterListAppBootstrap', 'MasterListPageControllers', 'MasterListEditMediaUpload', 'MasterListYoutubePlayerApi', 'MasterListAddMediaUpload', 'MasterListShellRouter', 'MasterListUploadLeaveGuard', 'MasterListExternalMediaInput', 'MasterListPlaybackEditor', 'MasterListPlaybackEditorController', 'MasterListPlaybackTimelineController', 'MasterListSetPlaybackController', 'MasterListYoutubeShowSearch', 'MasterListProfileShowList', 'MasterListShowFormUi', 'MasterListPeerSyncPoller', 'MasterListTheatre', 'MasterListTheatreController', 'MasterListMediaUi', 'MasterListMediaUploader', 'MasterListMediaGallery', 'MasterListUploadQueue', 'MasterListMediaJobs', 'MasterListShowEditor', 'MasterListShowFormController', 'MasterListDirectoryUi', 'MasterListArchiveSearch', 'MasterListTimelinePage', 'MasterListOverviewPage', 'MasterListEntityProfilePage', 'MasterListMetadataEditor', 'MasterListApiLimitsPage', 'MasterListActivityPage', 'MasterListConflictsPage', 'MasterListHealthPage', 'MasterListMaintenancePage', 'MasterListDirectoryPage', 'MasterListLocationsPage', 'MasterListPlaylistExport', 'MasterListAuthController', 'MasterListPeerSettings', 'MasterListNotificationCenter', 'MasterListSharedShowsPage', 'MasterListArchivePage', 'MasterListAddShowPage', 'MasterListTrackListEditor', 'MasterListEditShowPage', 'MasterListSetlistPresentation', 'MasterListShowDetailPage', 'MasterListMobileUploadController', 'MasterListMediaWorkspaceController', 'MasterListPwa']) {
      assert.match(app, new RegExp(`window\\.${global}`), global);
    }
  });

  test('keeps critical workflow controls in the server-rendered shell', () => {
    for (const id of ['setup-form', 'login-form', 'add-page', 'edit-page', 'shows-archive', 'playback-editor-list', 'backup-schedule-form', 'conflict-list']) {
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
  });

  test('cache-busts the application and stylesheet assets', () => {
    assert.match(html, /styles\.css\?v=[^"']+/);
    assert.match(html, /app\.js\?v=[^"']+/);
  });

  test('loads Leaflet only when the map is requested', () => {
    assert.doesNotMatch(html, /<link[^>]+leaflet/);
    assert.doesNotMatch(html, /<script[^>]+src="https:\/\/unpkg\.com\/leaflet/);
    assert.match(app, /pageRuntime\.loadLeaflet/);
  });

  test('keeps the archive count populated on shell-only authenticated pages', () => {
    assert.match(bootstrap, /fetchJson\('\/api\/stats'\)/);
  });

  test('maintenance offers a privacy-safe diagnostics download', () => {
    assert.match(html, /href="\/api\/maintenance\/diagnostics"/);
    assert.match(html, /Personal show data, local paths, secrets and configuration values are excluded/);
  });

  test('maintenance includes release and database migration status', () => {
    assert.match(html, /id="check-updates"/);
    assert.match(html, /docker compose pull/);
    assert.match(html, /Updates apply database migrations automatically/);
  });

  test('maintenance keeps infrequent tools in labelled disclosure panels', () => {
    assert.match(html, /class="maintenance-quick-actions"/);
    assert.match(html, /<details class="maintenance-disclosure"/);
    assert.match(html, /Backup settings & restore/);
    assert.match(html, /Full instance transfer/);
    assert.match(html, /Deployment details/);
  });

  test('keeps application behavior behind modules instead of rebuilding it in the composition root', () => {
    assert.doesNotMatch(app, /\.addEventListener\s*\(/);
    assert.doesNotMatch(app, /document\.createElement\s*\(/);
    assert.doesNotMatch(app, /\.innerHTML\s*=/);
  });
});
