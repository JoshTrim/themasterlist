# Architecture

`server.js` remains the executable entry point and HTTP composition root. Infrastructure and independently testable domain behavior live under `lib/`:

- `lib/schema.js` — idempotent SQLite schema and incremental migrations.
- `lib/auth.js` — password hashing, session cookies and account lookup.
- `lib/routes/auth.js` — authentication/account HTTP endpoints.
- `lib/http.js` — JSON responses, redirects and bounded request parsing.
- `lib/backups.js` — scheduled SQLite snapshots and retention.
- `lib/conflicts.js` — peer baselines and simultaneous-edit detection.
- `lib/sync-merge.js` — deterministic conflict merge rules.
- `lib/playback.js` — chapter parsing, matching and playback-plan suggestions.
- `lib/background-jobs.js` — persistent job progress, process ownership and cancellation.
- `lib/media-repository.js` — media records, playback clips and filesystem availability.
- `lib/media-processing.js` — FFmpeg/rembg execution, progress parsing and process hooks.
- `lib/routes/media-uploads.js` — direct, resumable mobile and external-video uploads.
- `lib/media-utils.js` — media naming, categorisation and duplicate hashes.
- `lib/validation.js` — account, show, metadata and rating validation.
- `lib/env.js` — `.env` parsing without overwriting process-level settings.

The browser application is still progressively split from `public/app.js`. Shared browser-safe helpers live under `public/lib/` and load before the main application bundle.

## Testing strategy

- Pure domain tests run without a server or network port.
- Route-handler tests call handler factories directly with in-memory SQLite databases.
- `test/server.test.js` remains the end-to-end HTTP contract suite and uses a temporary database and ephemeral localhost port.
- `npm run test:coverage` uses Node's built-in coverage report; no external test runner is required.

## Next extraction boundaries

The remaining backend code should move in behavior-preserving slices: media mutation routes and recognition orchestration, peer transport/signing, external integrations, metadata providers, then the HTTP composition root. The remaining frontend should be separated by page/workflow after browser-level tests are introduced.
