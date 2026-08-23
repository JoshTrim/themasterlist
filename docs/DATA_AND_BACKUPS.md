# Data and backups

All mutable state is kept below `data` by default. Docker can mount its small configuration/database state, large media library and SQLite snapshots from three different host locations.

## Storage layout

| Path | Contents |
| --- | --- |
| `data/master-list.sqlite` | Shows, setlists, ratings, accounts, metadata, jobs and peer state |
| `data/media/` | Original uploads, playback encodes, cutouts and profile images |
| `data/connections.json` | Encrypted Spotify and YouTube OAuth connections |
| `data/geocodes.json` | Cached venue coordinates |
| `data/backups/` | Scheduled and manually created SQLite snapshots |

The app applies owner-only permissions to these paths at startup. Treat the whole directory as private even when individual files are encrypted.

## Split Docker storage

The Compose defaults remain backwards compatible: all three mounts resolve below `./data`. To keep large media on another disk and snapshots on network storage, set host paths in `.env`:

```dotenv
MASTER_LIST_MEDIA_PATH=/mnt/bulk/themasterlist-media
MASTER_LIST_BACKUP_PATH=/mnt/backups/themasterlist
```

Then recreate the container with `docker compose up -d --force-recreate`. The database, encrypted OAuth connections and caches remain in `./data`; media is mounted at `/media`; snapshots are mounted at `/backups`. Move existing media and backups to the configured host paths before recreating the container.

For NFS or SMB, mount the share on the Docker host first and use that mounted directory as `MASTER_LIST_BACKUP_PATH`. Ensure the container's `node` user can write there. **Do not put the live SQLite database on an ordinary network filesystem**; keep it on local storage and send only snapshots to the network share. The Maintenance page displays the resolved backup path and whether it is writable.

## What scheduled backups include

Scheduled backups snapshot SQLite only. They do **not** contain media, OAuth connections, geocode caches, `.env` or the OAuth encryption key.

For a complete recovery, back up:

1. The database/config directory and the configured media directory.
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

The transfer is streamed on export and uploaded in retryable 4 MB chunks on import, so it can handle large media libraries without putting the entire bundle in application or browser memory. If the connection briefly drops, the importer resumes from the last offset accepted by the server. It includes the live database, the configured media directory, `connections.json` when present, and `geocodes.json` when present. It deliberately excludes `.env`, encryption keys, scheduled-backup files, temporary jobs and downloaded model caches.

Before applying an import, the destination moves its existing database, media and connection data to a timestamped `data/backups/pre-instance-import-*` directory. Keep that rollback copy until the imported archive has been checked.

> A clone contains the same peer identity as its source. Do not run both copies simultaneously as separate sync peers. For a permanent move, stop the old instance after verifying the new one. For an independent second archive, import the data and then reset/re-pair peer relationships before using both concurrently.

## Restore

The Maintenance page validates and stages an uploaded SQLite database. Restart the server to apply it. The app creates a pre-restore SQLite snapshot before replacing the current database.

After restoring only a SQLite database on another machine, restore media and configuration separately. For a complete migration, use the full-instance transfer above. If `connections.json` is restored, its matching encryption key is required. Otherwise remove that connection file and reconnect Spotify and YouTube.

## Before upgrades

Run a manual backup and ensure the media folder is covered by your external backup. Database migrations are automatic, but backups provide a recovery point for application or operating-system failures.
