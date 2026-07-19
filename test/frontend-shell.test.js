const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

describe('frontend shell contracts', () => {
  test('declares every navigable page before styles load to prevent a flash of all pages', () => {
    const routes = ['/overview', '/artists', '/venues', '/timeline', '/search', '/health', '/maintenance', '/activity', '/conflicts', '/api-limits', '/shows', '/artist', '/show', '/playback', '/city', '/edit', '/venue', '/add', '/map', '/account'];
    routes.forEach((route) => assert.match(html, new RegExp(`['"]${route.replace('/', '\\/')}['"]`), route));
    assert.ok(html.indexOf('document.body.dataset.page') < html.indexOf('<main>'));
  });

  test('loads shared frontend modules before the application bundle', () => {
    for (const module of ['api-client', 'page-runtime', 'formatters', 'navigation', 'auth-state', 'jobs', 'shows', 'show-cards', 'playback-core', 'playback-media', 'playback-editor', 'theatre', 'theatre-controller', 'media-ui', 'media-uploader', 'media-gallery', 'upload-queue', 'media-jobs', 'show-editor', 'show-form-controller', 'directory-ui', 'archive-search', 'timeline-page', 'overview-page', 'entity-profile-page']) {
      assert.ok(html.indexOf(`/lib/${module}.js`) < html.indexOf('/app.js'), module);
    }
    for (const global of ['MasterListApiClient', 'MasterListPageRuntime', 'MasterListFormatters', 'MasterListNavigation', 'MasterListAuthState', 'MasterListJobs', 'MasterListShows', 'MasterListShowCards', 'MasterListPlaybackCore', 'MasterListPlaybackMedia', 'MasterListPlaybackEditor', 'MasterListTheatre', 'MasterListTheatreController', 'MasterListMediaUi', 'MasterListMediaUploader', 'MasterListMediaGallery', 'MasterListUploadQueue', 'MasterListMediaJobs', 'MasterListShowEditor', 'MasterListShowFormController', 'MasterListDirectoryUi', 'MasterListArchiveSearch', 'MasterListTimelinePage', 'MasterListOverviewPage', 'MasterListEntityProfilePage']) {
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
    assert.match(app, /fetchJson\('\/api\/stats'\)/);
  });
});
