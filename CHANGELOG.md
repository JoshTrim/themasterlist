# Changelog

## Unreleased

### Added

- Playlist exports now run as visible background jobs with searching and insertion progress.
- Interrupted YouTube exports persist their playlist and track cursor so retrying resumes the existing playlist without duplicating confirmed items.

### Fixed

- Narrow mobile layouts now keep playback headings, source labels, maintenance commands and navigation controls within the viewport.
- Playback pages no longer show the full memory artwork above the player because a broad mobile selector was overriding the compact layout.

## 0.2.4 — 2026-08-08

### Fixed

- YouTube playlist exports retry transient item-insertion failures and continue adding later songs if one video remains unavailable.

## 0.2.3 — 2026-08-08

### Fixed

- YouTube playlist exports now map the shared playlist name to YouTube’s required `snippet.title` field.

## 0.2.2 — 2026-08-04

### Added

- Shows can track opening acts and co-headliners, including separate imported or manually entered setlists.
- Selecting a dated setlist can discover other setlist.fm performances at the same venue and date for explicit role confirmation.

## 0.2.1 — 2026-08-02

### Added

- The System page can compare the installed version with the latest GitHub release and show backup and database-migration readiness alongside safe Docker Compose update commands.
- Maintenance tools are grouped into compact quick actions and expandable backup, transfer, integrity and deployment sections.
- Maintenance now reports media usage by type, the largest files and shows, configurable capacity warnings, storage locations, and safe playback-copy cleanup and regeneration controls.
- Peer synchronization now runs server-side, persists failures and retry schedules, retries unreachable instances with bounded backoff, deduplicates overlapping exchanges, and exposes recovery details on each peer card.
- Shared-show photos and videos can now stream securely from their owner instance with byte-range playback; owners can queue a checksum-verified local copy when they want to retain one.

### Changed

- Show-card artist artwork now loads from one cacheable manifest, while immutable local profile photos remain in the browser cache.

### Fixed

- The show archive remains available if its optional artwork manifest fails.
- Public external artist and venue artwork is cached on profile and directory pages.

## 0.2.0 — 2026-08-01

### Added

- Installable PWA identity and improved mobile show-card presentation.
- Owner-only support diagnostics containing versions, feature flags, storage totals and sanitized error codes without secrets, local paths or personal show data.
- A populated v0.1 database upgrade regression that preserves shows, setlists, media associations and owner credentials.
- A two-instance Docker smoke test covering first-owner setup, authentication, show creation, media storage, full export, staged import, restart and post-import login.

### Changed

- AMD64 and ARM64 release images now build concurrently on native GitHub runners and are verified before the multi-architecture manifest is published.
- Maintenance and instance-transfer guidance now makes release verification and support-data collection clearer.

## 0.1.2 — 2026-07-31

### Fixed

- Release regression tests now verify the health endpoint against the package version instead of a hard-coded release number.

## 0.1.1 — 2026-07-31

### Fixed

- Full-instance imports now upload in resumable 4 MB chunks instead of one long request.
- Interrupted imports retry automatically and reconcile progress with the last byte accepted by the server.
- Import progress distinguishes uploading from server-side validation.

## 0.1.0 — 2026-07-28

The first packaged release of The Master List.

### Highlights

- Personal live-show archive with setlist.fm search, ratings, favourites, artist and venue profiles, maps, timeline statistics and metadata repair tools.
- Spotify, YouTube and Apple Music playlist exports, plus whole-set playback assembled from uploaded and embedded media.
- Resumable mobile uploads, H.264 playback copies, FFmpeg editing jobs, audio recognition and artifact background removal.
- Single-owner accounts, encrypted OAuth storage, peer pairing, shared shows, notifications and conflict resolution.
- SQLite backups, archive integrity checks, scheduled snapshots and streamed full-instance import/export with rollback protection.
- Docker deployment with FFmpeg and background-removal dependencies, health checks, multi-architecture release automation and documented Caddy support.

### Deployment notes

- Docker production deployments require `OWNER_SETUP_TOKEN` for first-owner setup and `CONNECTIONS_ENCRYPTION_KEY` for encrypted integrations.
- `APP_ORIGIN` must exactly match the browser origin. Set `SESSION_COOKIE_SECURE=true` when HTTPS terminates at a reverse proxy.
- Mutable state remains in `/data` inside Docker and must be mounted persistently.
