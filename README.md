# The Master List

A personal archive for the live music shows you have attended. The first release lets you log a gig, find the matching setlist on setlist.fm, and preserve the songs with your own note.

## Run it

Requires Node.js 20 or later, FFmpeg for media processing, and the optional Python worker described below for artifact cutouts.

```sh
cp .env.example .env
# Add your setlist.fm API key to .env (optional until you use search)
npm start
```

Open [http://localhost:3000](http://localhost:3000). The first person to open a new instance creates its single owner account. Do this before exposing the service to any shared network.

## Tests and architecture

Run the regression suite with `npm test`, or include Node's built-in line/branch/function report with `npm run test:coverage`. The suite combines HTTP contract tests with port-free unit tests for migrations, authentication, backups, peer conflicts, media utilities, playback analysis and frontend shell contracts.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the current module boundaries and the safe order for further extraction.

Shows are stored locally in `data/master-list.sqlite`. On first startup, the app automatically imports an existing `data/gigs.json` archive into SQLite. The legacy JSON file is left untouched as a backup and both local data files are ignored by Git.

### Docker deployment

The included image packages Node.js, FFmpeg, SQLite support and the CPU background-removal worker. Copy the environment file, then build and run:

```sh
cp .env.example .env
docker compose up -d --build
docker compose ps
```

The app is bound to `127.0.0.1:3000` by default and all mutable state is mounted at `/data` from the local `./data` directory. The container runs without Linux capabilities, with a read-only application filesystem and a private writable data volume. Before the first production launch, set `OWNER_SETUP_TOKEN` to a long random value and generate `CONNECTIONS_ENCRYPTION_KEY` with `openssl rand -base64 32`. Enter the setup token when creating the owner account; it can be removed afterward, but the encryption key must be retained. The health check calls `/api/healthz` and verifies both SQLite and media-folder write access. Back up the entire `data` directory if you also want the original media files; scheduled snapshots cover the SQLite database only.

For LAN or VPN access, set both values explicitly before starting:

```sh
BIND_ADDRESS=0.0.0.0
APP_ORIGIN=http://192.168.1.20:3000
```

For internet access, put the app behind an HTTPS reverse proxy, set `APP_ORIGIN` to the exact public `https://` origin, set `SESSION_COOKIE_SECURE=true`, and restrict access with a VPN or an additional proxy authentication layer where possible. Never publish port 3000 directly from a router.

To update the app later:

```sh
docker compose up -d --build
```

### Scheduled backups

The Maintenance page can enable or disable database snapshots, choose the interval in hours, set how many scheduled snapshots to retain, run one immediately, and show the most recent result. Snapshots live in `data/backups`. Defaults can be supplied on first launch with `BACKUP_ENABLED`, `BACKUP_INTERVAL_HOURS`, and `BACKUP_RETENTION_COUNT`; settings saved in the app take precedence afterward.

### Artifact background removal

Artifact photos can be converted into transparent cutouts while retaining the original image. Install the optional CPU worker once, then restart the app:

```sh
npm run setup:background-removal
npm start
```

The first background-removal job downloads its selected model and can take longer than subsequent jobs. Set `REMBG_MODEL` to choose another rembg model, or `REMBG_COMMAND` if the executable lives outside the project `.venv`.

## setlist.fm

The app calls setlist.fm from the server, so your key is never sent to the browser. Create a free account, apply for a key, then add `SETLIST_FM_API_KEY` to `.env`. The search needs the artist, city, and date; select the correct match before saving.

setlist.fm's API is free for non-commercial use and requires its API key to be sent in the `x-api-key` header. Check its terms before changing the project scope: [API docs](https://api.setlist.fm/docs/1.0/index.html) and [terms](https://www.setlist.fm/help/terms).

## Automatic track detection

If `AUDD_API_TOKEN` is present in `.env`, uploaded videos are sent through a background recognition job. The server extracts a 12-second audio sample, sends it to AudD, and displays the detected title and artist in the media gallery. Exact title matches are automatically associated with the show setlist; unmatched results can still be assigned manually from the edit page. The token is kept server-side.

On the edit page, selecting a different setlist track—or selecting **Unassigned**—marks that media item as a manual override and preserves your choice.

## Playlist exports

Every saved show with a setlist has export buttons. Exports create **private** playlists and show the number of songs that could not be matched. The matching uses the setlist artist (or the credited cover artist) and song title.

Copy `.env.playlists.example` values into your local `.env`, complete the credentials, and restart the server. Do not commit `.env` or `data/connections.json`; the latter holds locally encrypted OAuth credentials.

| Service | One-time setup | What the app does |
| --- | --- | --- |
| Spotify | Create an app in the Spotify developer dashboard and add `http://127.0.0.1:3000/auth/spotify/callback` locally, or your exact HTTPS `SPOTIFY_REDIRECT_URI` when deployed. | Connect via OAuth, search each song, create a private playlist, and add matches. |
| YouTube | Enable YouTube Data API v3 in Google Cloud, create Web Application OAuth credentials, and add `${APP_ORIGIN}/auth/youtube/callback` (for example, `http://localhost:3000/auth/youtube/callback`). | Connect via OAuth, find music videos/audio, and create a private YouTube playlist. |
| Apple Music | Apple Developer Program membership, a MusicKit identifier/key, and a signed developer token. | MusicKit asks the subscriber for permission, then creates a library playlist and adds matched catalog songs. |

OAuth access and refresh tokens are encrypted with AES-256-GCM when `CONNECTIONS_ENCRYPTION_KEY` is configured, and the setting is mandatory in production. An existing plaintext `data/connections.json` is encrypted automatically on first read. Keep the key outside `/data` and back it up separately: losing it makes existing OAuth connections unrecoverable. To rotate it, move the old value to `CONNECTIONS_ENCRYPTION_KEY_PREVIOUS`, put the new value in `CONNECTIONS_ENCRYPTION_KEY`, start the app once, then remove the previous key.

## Peer collaboration

Each installation has one password-protected owner account. To collaborate, each person runs their own instance and pairs it from the Account page. Do not create multiple people on one server. Peer pairing invites expire after one week and can be accepted only once.

If both instances change the same shared show after their last common sync, the owner receives a conflict notification. Open **System → Conflicts** to keep the local or peer version, or merge notes, ratings, setlists and matching media assignments. Media files themselves are not copied by this merge; assignments are applied to matching uploads using their checksum, external URL or shared media ID.

## Privacy and external services

The archive and uploaded originals remain in the local `data` directory. Optional features send limited information to external providers:

- Setlist searches send artist, city and optionally date to setlist.fm.
- Map lookup sends venue/address text to OpenStreetMap Nominatim.
- Album, artist and venue enrichment queries Apple, MusicBrainz, Wikipedia and, when configured, Google Custom Search.
- YouTube discovery and playlist export send show and track search terms to Google/YouTube.
- When AudD is enabled, track detection extracts a 12-second MP3 sample from an uploaded video and sends that sample to AudD.

OAuth credentials are encrypted in `data/connections.json` and protected by owner-only filesystem permissions. Encryption limits exposure from a copied data volume or database backup, but not from an attacker controlling the running server. Protect `.env`, encryption keys, backups and the entire `data` directory as sensitive data.

## Licence

Copyright © 2026 Josh Trim. The Master List is free software distributed under the [GNU General Public License version 3](LICENSE).

2. Add a review screen for ambiguous song matches before each export.
3. Add photos, ratings, support acts, and filtering by artist, venue, city, or year.
