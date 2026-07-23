# Configuration

Copy `.env.example` to `.env` and edit the copy. `.env` is ignored by Git and must never be committed. Restart the server after changing environment variables.

## Core and security

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Browser-facing port for native installs and the Docker host mapping. |
| `HOST` | `127.0.0.1` | Native server bind address. Use `0.0.0.0` only for trusted LAN/VPN access. |
| `BIND_ADDRESS` | `127.0.0.1` | Docker host bind address. It does not change the container’s internal bind address. |
| `MASTER_LIST_VERSION` | `latest` | Published GHCR image tag used by Compose. Pin a release tag for repeatable deployments. |
| `APP_ORIGIN` | `http://127.0.0.1:3000` | Exact browser origin used for callbacks and cross-site request protection. No path or trailing slash. |
| `SESSION_COOKIE_SECURE` | `false` | Set `true` when the browser always reaches the app over HTTPS. |
| `OWNER_SETUP_TOKEN` | empty | Required for first-owner setup in production. Generate with `openssl rand -hex 32`; remove after setup. |
| `CONNECTIONS_ENCRYPTION_KEY` | empty | AES-256-GCM key for OAuth tokens; required in production. Generate with `openssl rand -base64 32`. |
| `CONNECTIONS_ENCRYPTION_KEY_PREVIOUS` | empty | Previous OAuth key used once during rotation. Remove after successful migration. |
| `INSTANCE_NAME` | `The Master List instance` | Friendly name advertised to paired instances. |

`APP_ORIGIN` must be the address actually shown in the browser. When a reverse proxy terminates TLS, use its public `https://` origin and enable secure cookies.

## Providers and integrations

| Variable | Required for |
| --- | --- |
| `SETLIST_FM_API_KEY` | Searching and importing setlists from setlist.fm |
| `AUDD_API_TOKEN` | Detecting tracks in uploaded video samples |
| `GOOGLE_CUSTOM_SEARCH_API_KEY`, `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` | Additional venue metadata search results |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` | Spotify OAuth and playlist export |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | YouTube OAuth, discovery and playlist export |
| `APPLE_MUSIC_DEVELOPER_TOKEN`, `APPLE_MUSIC_STOREFRONT` | Apple Music playlist export |
| `YOUTUBE_DAILY_QUOTA_UNITS` | Displaying the project’s expected daily YouTube quota |
| `YOUTUBE_REGION_CODE` | Filtering YouTube videos unavailable in the selected country |

See [Integrations](INTEGRATIONS.md) for provider setup and callback URLs.

## Media and storage

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAX_MEDIA_SIZE_GB` | `50` | Maximum accepted size for one uploaded file. |
| `MAX_MEDIA_STORAGE_GB` | `500` | Maximum combined locally uploaded media recorded by the archive. |
| `REMBG_COMMAND` | automatic | Override the background-removal executable. |
| `REMBG_MODEL` | `u2net` | Model used for artifact background removal. |
| `MASTER_LIST_DATA_DIR` | `./data` | Advanced override for all mutable application state. Docker sets `/data`. |

Original video uploads are retained. Playback encoding can therefore require substantially more disk space than the input files alone.

## Scheduled backups

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKUP_ENABLED` | `true` | Enables periodic SQLite snapshots. |
| `BACKUP_INTERVAL_HOURS` | `24` | Minimum time between scheduled snapshots. |
| `BACKUP_RETENTION_COUNT` | `14` | Number of scheduled snapshots retained. |

Settings saved from the Maintenance page take precedence after initial setup.

## Internal and legacy settings

`NODE_ENV=production` enables production requirements. `INSTANCE_URL` is retained as a legacy public-origin fallback; new deployments should use `APP_ORIGIN`. `MASTER_LIST_SKIP_ENV` is used by tests and should not be set by ordinary installations.
