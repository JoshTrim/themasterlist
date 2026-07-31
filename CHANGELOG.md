# Changelog

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
