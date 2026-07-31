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
- Export or import a streamed full-instance bundle.
- Export portable show data as JSON.
- Download a media manifest for external file verification.

The portable JSON export is useful for show records, but it is not a complete instance backup.

## Move or clone a full instance

Use **System → Maintenance → Full instance transfer** when moving the archive to a new installation:

1. On the source instance, choose **Download full instance**. Keep the resulting `.tml-instance` file private.
2. Configure the destination's `.env`. To retain encrypted Spotify and YouTube connections, copy the source `CONNECTIONS_ENCRYPTION_KEY` through a secure channel.
3. Start the destination, complete initial owner setup if required, and open **System → Maintenance**.
4. Choose the bundle and select **Stage full import**. The browser shows upload progress and the server verifies every file checksum, SQLite integrity, and the number of shows and media records before staging it.
5. Restart the destination. The imported account, shows, setlists, media, metadata, geocodes, peer identity and encrypted OAuth connections replace its current data.
6. Sign in with the account credentials from the source instance. The destination browser's old session belongs to the replaced identity and is no longer valid.

The transfer is streamed on export and uploaded in retryable 4 MB chunks on import, so it can handle large media libraries without putting the entire bundle in application or browser memory. If the connection briefly drops, the importer resumes from the last offset accepted by the server. It includes the live database, `data/media`, `connections.json` when present, and `geocodes.json` when present. It deliberately excludes `.env`, encryption keys, scheduled-backup files, temporary jobs and downloaded model caches.

Before applying an import, the destination moves its existing database, media and connection data to a timestamped `data/backups/pre-instance-import-*` directory. Keep that rollback copy until the imported archive has been checked.

> A clone contains the same peer identity as its source. Do not run both copies simultaneously as separate sync peers. For a permanent move, stop the old instance after verifying the new one. For an independent second archive, import the data and then reset/re-pair peer relationships before using both concurrently.

## Restore

The Maintenance page validates and stages an uploaded SQLite database. Restart the server to apply it. The app creates a pre-restore SQLite snapshot before replacing the current database.

After restoring only a SQLite database on another machine, restore media and configuration separately. For a complete migration, use the full-instance transfer above. If `connections.json` is restored, its matching encryption key is required. Otherwise remove that connection file and reconnect Spotify and YouTube.

## Before upgrades

Run a manual backup and ensure the media folder is covered by your external backup. Database migrations are automatic, but backups provide a recovery point for application or operating-system failures.
