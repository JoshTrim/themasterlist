# Architecture

`server.js` remains the executable entry point and HTTP composition root. Infrastructure and independently testable domain behavior live under `lib/`:

- `lib/schema.js` — idempotent SQLite schema and incremental migrations.
- `lib/auth.js` — password hashing, session cookies and account lookup.
- `lib/routes/auth.js` — authentication/account HTTP endpoints.
- `lib/http.js` — JSON responses, redirects and bounded request parsing.
- `lib/backups.js` — scheduled SQLite snapshots and retention.
- `lib/conflicts.js` — peer baselines and simultaneous-edit detection.
- `lib/sync-merge.js` — deterministic conflict merge rules.
- `lib/peer-identity.js` — instance keys, invites, signatures, freshness and replay protection.
- `lib/peer-transport.js` — authenticated peer requests, timeouts and transient retries.
- `lib/peer-sync.js` — shared-show snapshots, contributions and peer notifications.
- `lib/routes/peers.js` — pairing, health, synchronization and account-facing peer endpoints.
- `lib/playback.js` — chapter parsing, matching and playback-plan suggestions.
- `lib/background-jobs.js` — persistent job progress, process ownership and cancellation.
- `lib/media-repository.js` — media records, playback clips and filesystem availability.
- `lib/media-processing.js` — FFmpeg/rembg execution, progress parsing and process hooks.
- `lib/media-encoding.js` — playback proxy orchestration and database status updates.
- `lib/media-recognition.js` — AudD sampling, matching and manual-override protection.
- `lib/media-recovery.js` — restart recovery for interrupted jobs and temporary files.
- `lib/routes/media-uploads.js` — direct, resumable mobile and external-video uploads.
- `lib/routes/media-mutations.js` — edit, delete, retry, rotate, trim and background-removal endpoints.
- `lib/media-utils.js` — media naming, categorisation and duplicate hashes.
- `lib/validation.js` — account, show, metadata and rating validation.
- `lib/env.js` — `.env` parsing without overwriting process-level settings.
- `lib/providers/setlist-fm.js` — setlist.fm request construction, retry behavior, usage accounting and response normalization.
- `lib/providers/metadata.js` — iTunes, MusicBrainz, Wikipedia and official-site metadata lookups without persistence concerns.
- `lib/providers/spotify.js` — track matching, private playlist creation and API-sized batching.
- `lib/providers/youtube.js` — playlist export, event-specific live-video search, embed checks and playback metadata.
- `lib/providers/apple-music.js` — catalog matching, library playlist creation and API-sized track batching.
- `lib/oauth.js` — provider configuration, authorization state, code exchange, connection status and token refresh.
- `lib/geocoding.js` — Nominatim lookup, request throttling, coordinate validation, persistence and map aggregation.
- `lib/archive-health.js` — deterministic missing-setlist, album, profile-photo, biography and venue-location diagnostics.
- `lib/archive-integrity.js` — media reference scans, orphan/missing/duplicate detection, SQLite checks and downloadable manifests.
- `lib/routes/maintenance.js` — owner-authorized backup settings, backup execution, integrity, manifest and restore endpoints.
- `lib/routes/shows.js` — show listing, creation, metadata-preserving edits and deletion.
- `lib/routes/setlists.js` — setlist.fm search and cached album-enrichment endpoints.
- `lib/routes/stats.js` — archive summaries, genre statistics and provider-usage reporting.
- `lib/routes/archive-transfer.js` — authenticated JSON archive export and transactional validated import.
- `lib/routes/directory.js` — artist and venue profile lookup, editing, genres, images and locations.
- `lib/routes/playback-plans.js` — playback suggestions plus validated, transactional clip assignment.
- `lib/api-usage.js` — provider normalization, quota-cost classification, request accounting and JSON response handling.

`public/app.js` is the browser composition root: it owns page-level state, looks up server-rendered elements and injects dependencies into browser-safe CommonJS/UMD modules under `public/lib/`. UI behavior, rendering and event binding remain inside those tested modules, which load before the application bundle:

- `formatters.js` — display-safe escaping, dates, byte sizes and provider labels.
- `navigation.js` — active-link and mobile-menu behavior.
- `auth-state.js` — deterministic authentication view state and visibility updates.
- `jobs.js` — persistent background-job queue state and panel rendering.
- `shows.js` — archive filtering, ordering and combined local/peer statistics.
- `show-cards.js` — local and peer show-card factories, card actions and media/artifact accordion presentation.
- `playback-core.js` — playback sources, clip bounds, queue construction, gap handling and timeline interpolation.
- `playback-media.js` — YouTube URL/embed normalization, upload source presentation and player-stage markup.
- `media-lightbox.js` — image/video lightbox source selection, captions, rotation presentation and close behavior.
- `app-bootstrap.js` — authentication gating, route data loading, archive counts, controller dispatch and post-render startup.
- `page-controllers.js` — route-to-page action registry, OAuth result messaging and page-specific initialization ordering.
- `edit-media-upload.js` — edit-page mobile/desktop upload setup, progress, recognition polling and workspace refreshes.
- `youtube-player-api.js` — deduplicated iframe API script loading, callback chaining and recoverable load failures.
- `add-media-upload.js` — add-page queued mobile uploads, save-time progress and post-upload recognition refreshes.
- `shell-router.js` — route-to-section visibility, unknown-route fallback and home chest navigation.
- `upload-leave-guard.js` — active desktop/mobile upload detection and before-unload navigation protection.
- `external-media-input.js` — validated external-video input submission and success-only field clearing.
- `playback-editor.js` — playback-plan validation, normalized clip payloads and suggestion presentation state.
- `playback-editor-controller.js` — playback previews, fallback sources, draft preservation, suggestions, validation and plan persistence.
- `playback-timeline-controller.js` — focused/full-set timeline rendering, pointer scrubbing and media-time seeking.
- `set-playback-controller.js` — whole-set queue state, transport construction, resume data, source fallback, crossfades, YouTube playback and theatre controls.
- `youtube-show-search.js` — event-specific YouTube discovery, result presentation and media attachment.
- `profile-show-list.js` — artist/venue show cards and shared-attendee summaries.
- `show-form-ui.js` — ratings, favourites, duplicate warnings, attendee selection and archive-backed form suggestions.
- `peer-sync-poller.js` — guarded peer synchronization, notification refresh and archive reloading on a recurring timer.
- `theatre.js` — fullscreen presentation, keyboard commands and control auto-hide rules.
- `theatre-controller.js` — fullscreen lifecycle, wake lock, keyboard transport and theatre control visibility wiring.
- `media-ui.js` — media recognition/workspace presentation, bulk selection and media-safe show patches.
- `media-uploader.js` — serial resumable mobile uploads, direct desktop uploads, retries, cancellation and job progress.
- `media-gallery.js` — gallery rendering and media caption, assignment, cover, cutout, trim, rotate, ordering and bulk-delete actions.
- `upload-queue.js` — serial mobile upload queue state, retry/clear transitions and progress markup.
- `media-jobs.js` — bounded polling for encoding, rotation, background removal and audio recognition.
- `show-editor.js` — shared add/edit payloads, duplicate detection, attendees and metadata-preserving track mutations.
- `show-form-controller.js` — ordered add/edit persistence, upload dispatch, external media and refresh workflows.
- `directory-ui.js` — artist/venue aggregation, metadata completeness, filtering, sorting and editor navigation.
- `archive-search.js` — search-page filtering, deduplication, category rendering and control binding.
- `timeline-page.js` — yearly archive aggregation, chart rendering, year navigation and monthly detail.
- `overview-page.js` — archive totals, rankings, metadata completion, genre charts and API fallback rendering.
- `entity-profile-page.js` — artist/venue show selection, profile statistics, metadata loading and persisted presentation states.
- `metadata-editor.js` — artist/venue metadata forms, image previews/uploads, navigation and persistence workflow.
- `api-limits-page.js` — provider quota estimates, operation usage, recent calls and authentication-aware errors.
- `activity-page.js` — peer notification filtering, unread transitions, navigation and bulk read workflow.
- `conflicts-page.js` — owner-only peer conflict comparison, merge choices and resolution persistence.
- `health-page.js` — archive diagnostics, filtering, automated repair and manual metadata/location entry.
- `maintenance-page.js` — backup scheduling, snapshots, integrity checks, orphan cleanup and staged restores.
- `directory-page.js` — cached metadata, artist/venue directory rendering, filters, metadata badges and lazy profile hydration.
- `locations-page.js` — city venue summaries, geocoding refresh and Leaflet map lifecycle/markers.
- `playlist-export.js` — provider readiness, OAuth redirects, MusicKit authorization and playlist export results.
- `auth-controller.js` — setup, login, invite registration, logout and account credential updates.
- `peer-settings.js` — paired-instance identity, invite exchange, connection tests, synchronization refresh and removal.
- `notification-center.js` — peer notification panel, navigation badges, read state and conflict counts.
- `shared-shows-page.js` — shared-show grouping, attendee contribution summaries and review rating controls.
- `archive-page.js` — show archive filtering, local/remote card orchestration, artist images and year controls.
- `add-show-page.js` — setlist search and selection, duplicate checks, show creation, uploads and form reset state.
- `track-list-editor.js` — metadata-safe setlist field editing, add/remove controls and pointer, keyboard or native drag reordering.
- `edit-show-page.js` — edit form hydration, duplicate checks, attendee/media coordination and metadata-safe show persistence.
- `setlist-presentation.js` — track tooltips, album breakdowns and lazy album hydration for archive setlists.
- `show-detail-page.js` — show-memory header, facts, setlist hydration, album repair and media/artifact presentation.
- `mobile-upload-controller.js` — sequential per-input upload queues, progress/retry state, wake locks and pending-file clearing.
- `media-workspace-controller.js` — edit-page media health summaries, filtering, retry actions, recognition and gallery refreshes.
- `api-client.js` — consistent JSON response parsing and API error objects.
- `page-runtime.js` — route-specific data requirements, controller dispatch and lazy third-party assets.

Styles retain their original cascade order through `public/styles.css`: `shell-and-forms.css`, `components.css`, `playback.css`, then page-specific `pages.css`.

## Testing strategy

- Pure domain tests run without a server or network port.
- Route-handler tests call handler factories directly with in-memory SQLite databases.
- Frontend modules are dependency-injected and tested with small DOM doubles, avoiding a browser build step or heavyweight test DOM.
- `test/server.test.js` remains the end-to-end HTTP contract suite and uses a temporary database and ephemeral localhost port.
- `npm run test:coverage` uses Node's built-in coverage report; no external test runner is required.

## Next extraction boundaries

New frontend behavior should be added to the relevant `public/lib/` controller with a focused regression test; `public/app.js` should remain wiring-only. The next refactoring area is `server.js`: extract its remaining API-usage accounting, shared-show/conflict orchestration and profile-image workflow in behavior-preserving, independently tested slices while keeping the executable file as the HTTP composition root.
