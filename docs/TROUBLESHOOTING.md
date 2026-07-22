# Troubleshooting

## The container exits immediately

Inspect its logs:

```sh
docker compose logs master-list
```

Production requires both a first-run `OWNER_SETUP_TOKEN` and a valid 32-byte `CONNECTIONS_ENCRYPTION_KEY`. Generate the latter with `openssl rand -base64 32`, paste it into `.env`, and rebuild.

## OAuth connections cannot be decrypted

The configured key does not match `data/connections.json`. Restore the original key. During deliberate rotation, set the old key as `CONNECTIONS_ENCRYPTION_KEY_PREVIOUS` and the new key as `CONNECTIONS_ENCRYPTION_KEY`.

If the key is permanently lost, preserve a backup if needed, remove the unusable connection file, and reconnect Spotify and YouTube.

## OAuth reports `redirect_uri_mismatch`

The provider callback must exactly match the configured value, including scheme, host, port and path. The default local origin and both callbacks use `127.0.0.1`. Spotify does not permit `localhost`; do not switch hostnames midway through authorization. Deployed instances should use the exact HTTPS origin configured in `APP_ORIGIN`.

If Google says the app is limited to approved testers, add the signing-in Google account under the OAuth consent screen’s test users or publish the consent configuration as appropriate.

## Phone cannot open the app

Set `BIND_ADDRESS=0.0.0.0`, `HOST=0.0.0.0`, and set `APP_ORIGIN` to the server’s real LAN IP and port. Restart the app, use that same URL on the phone, and check the host firewall. Both devices must be on a network that permits client-to-client traffic.

## `better-sqlite3` was compiled for another Node version

Switch to the repository’s Node version and reinstall native dependencies:

```sh
nvm use
npm ci
```

If dependencies must be retained, `npm rebuild better-sqlite3` can rebuild only the native module.

If Docker reports a missing `GLIBC` version for `better_sqlite3.node`, pull the current source and rebuild the image without its old dependency layers:

```sh
git pull
docker compose down
docker compose build --no-cache master-list
docker compose up -d
docker compose logs -f master-list
```

The Dockerfile compiles `better-sqlite3` against its pinned Debian runtime and verifies that the module loads while building. Do not copy a host `node_modules` directory into the image.

## FFmpeg is missing or media processing does not start

Docker includes FFmpeg. Native installations must make both `ffmpeg` and `ffprobe` available on `PATH`.

Large videos can take significant time to upload, encode, rotate or trim. Keep the page open while a browser upload is active; server-side processing can continue in the background-jobs panel afterward. Check free space when jobs fail unexpectedly.

## Artifact background removal fails

On a native installation, run `npm run setup:background-removal`. The first job downloads a model and needs network access and additional disk space. Docker includes the worker but still downloads the selected model into persistent data on first use.

## Setlist or metadata searches fail

- Confirm `SETLIST_FM_API_KEY` is present for setlist search.
- Use **System → API limits** to review recorded YouTube usage.
- Use **System → Metadata** for manual repair when external providers cannot match a track, artist, venue or address.
- Restart the server after changing `.env`.

## Uploads fail

Check `MAX_MEDIA_SIZE_GB`, `MAX_MEDIA_STORAGE_GB`, available disk space and server logs. Mobile uploads are resumable, but an unstable network can still require retrying a failed queue item. The server rejects files whose contents do not match their declared image or video type.

## Run diagnostics

Use **System → Maintenance** for SQLite integrity and media-manifest checks. From the repository, run:

```sh
npm test
```

When requesting help, include the relevant error and application version, but remove API keys, OAuth tokens, pairing invitations, passwords, personal show data and local filesystem paths.
