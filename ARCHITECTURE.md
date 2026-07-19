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

The browser application is progressively split from `public/app.js`. Browser-safe CommonJS/UMD modules under `public/lib/` load before the main application bundle:

- `formatters.js` — display-safe escaping, dates, byte sizes and provider labels.
- `navigation.js` — active-link and mobile-menu behavior.
- `auth-state.js` — deterministic authentication view state and visibility updates.
- `jobs.js` — persistent background-job queue state and panel rendering.
- `shows.js` — archive filtering, ordering and combined local/peer statistics.
- `show-cards.js` — local and peer show-card factories, card actions and media/artifact accordion presentation.
- `playback-core.js` — playback sources, clip bounds, queue construction, gap handling and timeline interpolation.
- `playback-media.js` — YouTube/upload source presentation and player-stage markup.
- `playback-editor.js` — playback-plan validation, normalized clip payloads and suggestion presentation state.
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
- `entity-profile-page.js` — artist/venue show selection, profile statistics, metadata loading and presentation states.
- `metadata-editor.js` — artist/venue metadata forms, image previews/uploads, navigation and persistence workflow.
- `api-limits-page.js` — provider quota estimates, operation usage, recent calls and authentication-aware errors.
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

The remaining backend code should move in behavior-preserving slices: external integrations, metadata providers, then the HTTP composition root. Remaining frontend rendering can now move page-by-page behind the tested browser module boundaries.
