# Data and backups

All mutable state is kept below `data` by default, or `/data` inside Docker.

## Storage layout

| Path | Contents |
| --- | --- |
| `data/master-list.sqlite` | Shows, setlists, ratings, accounts, metadata, jobs and peer state |
| `data/media/` | Original uploads, playback encodes, cutouts and profile images |
| `data/connections.json` | Encrypted Spotify and YouTube OAuth connections |
| `data/geocodes.json` | Cached venue coordinates |
| `data/backups/` | Scheduled and manually created SQLite snapshots |

The app applies owner-only permissions to these paths at startup. Treat the whole directory as private even when individual files are encrypted.

## What scheduled backups include

Scheduled backups snapshot SQLite only. They do **not** contain media, OAuth connections, geocode caches, `.env` or the OAuth encryption key.

For a complete recovery, back up:

1. The entire `data` directory.
2. `.env` or a secure record of its required values.
3. `CONNECTIONS_ENCRYPTION_KEY` in a separate password manager or secret store.

Do not keep the only copy of the encryption key inside the same backup as `data`.

## Backup from the app

Open **System → Maintenance** to:

- Run a SQLite backup immediately.
- Configure snapshot frequency and retention.
- Download the current database.
- Export portable show data as JSON.
- Download a media manifest for external file verification.

The portable JSON export is useful for show records, but it is not a complete instance backup.

## Restore

The Maintenance page validates and stages an uploaded SQLite database. Restart the server to apply it. The app creates a pre-restore SQLite snapshot before replacing the current database.

After restoring on another machine, also restore media and configuration separately. If `connections.json` is restored, its matching encryption key is required. Otherwise remove that connection file and reconnect Spotify and YouTube.

## Before upgrades

Run a manual backup and ensure the media folder is covered by your external backup. Database migrations are automatic, but backups provide a recovery point for application or operating-system failures.
