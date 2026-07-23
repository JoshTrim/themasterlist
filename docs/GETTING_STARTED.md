# Getting started

This guide takes a new installation from download to its first saved show. Docker is recommended because it provides the media-processing dependencies with consistent versions.

## Before you begin

You need:

- Docker Desktop or Docker Engine with Compose; or Node.js 20+ and FFmpeg for a native installation.
- Enough free disk space for original videos and their playback copies.
- A modern browser. Mobile uploads work best while the phone and server are on a reliable local network.

API credentials are optional. You can create an account and enter shows manually before configuring setlist.fm, YouTube or playlist exports.

## Docker installation

1. Clone the repository and enter it:

   ```sh
   git clone https://github.com/JoshTrim/themasterlist.git
   cd themasterlist
   ```

2. Create the local configuration:

   ```sh
   cp .env.example .env
   ```

3. Generate an initial setup token and an OAuth encryption key:

   ```sh
   openssl rand -hex 32
   openssl rand -base64 32
   ```

   Paste the values into `OWNER_SETUP_TOKEN` and `CONNECTIONS_ENCRYPTION_KEY` in `.env`. These values must be different. The encryption key must be retained for as long as you want to use saved OAuth connections.

4. Pull the published container and start it:

   ```sh
   docker compose pull
   docker compose up -d --no-build
   docker compose ps
   docker compose logs -f master-list
   ```

   Press `Ctrl-C` to stop following logs; the container continues running.

   Published releases support Apple Silicon/ARM64 and AMD64 systems. To run an unreleased checkout or local code changes instead, use `docker compose up -d --build`.

5. Visit [http://127.0.0.1:3000](http://127.0.0.1:3000). Create the single owner account and supply the setup token when prompted. Continue using this exact hostname so local OAuth session cookies and callbacks match.

6. Remove `OWNER_SETUP_TOKEN` from `.env` after setup. Do not remove `CONNECTIONS_ENCRYPTION_KEY`.

Stop or restart the instance with:

```sh
docker compose stop
docker compose start
```

## Native Node installation

Install Node.js 24 (recommended), FFmpeg and build tools for `better-sqlite3`. Then run:

```sh
cp .env.example .env
openssl rand -base64 32
# Paste the generated value into CONNECTIONS_ENCRYPTION_KEY in .env
npm ci
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Native development does not require `OWNER_SETUP_TOKEN` unless `NODE_ENV=production`, but setting one is still safe.

For transparent artifact cutouts, install the optional Python worker:

```sh
npm run setup:background-removal
npm start
```

The first cutout job downloads its model and takes longer than later jobs.

## Your first show

1. Sign in and open **Add show**.
2. Enter an artist and city. Date is optional; adding it usually improves setlist matching.
3. If setlist.fm is configured, search and select the correct event. Otherwise enter the show manually.
4. Save the show before adding large media. Uploads and encoding continue through the background-jobs panel.
5. Open the saved show to edit tracks, assign media, add artifacts or build whole-set playback.

## Phone and LAN access

Docker binds the app to `127.0.0.1` by default, so other devices cannot reach it. Find the Mac’s current Wi-Fi address in **System Settings → Wi-Fi → Details → IP Address**, or run:

```sh
ipconfig getifaddr en0
```

Update `.env` with that exact address. For example, if the Mac is `192.168.1.20`:

```env
BIND_ADDRESS=0.0.0.0
HOST=0.0.0.0
APP_ORIGIN=http://192.168.1.20:3000
```

`BIND_ADDRESS` publishes Docker's port to the trusted local network. `HOST` controls the native Node server and is already set correctly inside the container; setting only `HOST=0.0.0.0` on a Compose command does not change Docker's host-side binding.

Recreate the container so the new binding and origin take effect:

```sh
docker compose down
docker compose up -d
docker compose ps
```

The port shown by `docker compose ps` should begin with `0.0.0.0:3000`. On a phone connected to the same Wi-Fi, visit the `APP_ORIGIN` address—for this example, `http://192.168.1.20:3000`.

Use that same LAN URL on the Mac while this configuration is active. Browser sessions belong to a specific hostname, and mutating requests such as login are accepted only from the exact configured `APP_ORIGIN`. Continuing to use `http://127.0.0.1:3000` on the Mac while `APP_ORIGIN` contains the LAN address can produce a **Cross-site request rejected** error.

If that error appears, check that `.env` has only one active `APP_ORIGIN` entry, recreate the container, and verify the value received by the application:

```sh
docker compose down
docker compose up -d
docker compose exec master-list printenv APP_ORIGIN
```

The final command must print the exact URL shown in the phone's address bar, without a trailing slash. Sign in again at the LAN URL because an existing `127.0.0.1` browser session does not carry over to the LAN hostname.

Compose's detached mode (`-d`) keeps the app running after Terminal closes, and the service's `restart: unless-stopped` policy starts it again when Docker starts. Enable **Start Docker Desktop when you sign in** if it should return after restarting the Mac.

If the phone still cannot connect, allow Docker through the macOS firewall and confirm the Wi-Fi network permits devices to communicate with one another. Guest networks commonly block this traffic. Do not use `0.0.0.0` as a browser URL, and do not expose port 3000 directly to the internet.

## Updating

Create a backup first. For Docker:

```sh
git pull --ff-only
docker compose pull
docker compose up -d --no-build
docker compose ps
```

For a deliberately pinned deployment, set `MASTER_LIST_VERSION` in `.env` to a release tag such as `v0.1.0` before pulling. Return it to `latest` only when you want to follow the newest stable release.

For a native installation:

```sh
git pull --ff-only
npm ci
npm start
```

Schema migrations run automatically at startup. Never replace or delete `data` during an update.
