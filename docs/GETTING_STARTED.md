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

4. Build and start the container:

   ```sh
   docker compose up -d --build
   docker compose ps
   docker compose logs -f master-list
   ```

   Press `Ctrl-C` to stop following logs; the container continues running.

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

Find the server’s LAN address, then update `.env` with that exact address. For example:

```env
BIND_ADDRESS=0.0.0.0
HOST=0.0.0.0
APP_ORIGIN=http://192.168.1.20:3000
```

Restart the server and visit the same `APP_ORIGIN` URL from the phone. Allow incoming connections through the host firewall if prompted. Do not use `0.0.0.0` as a browser URL, and do not expose this configuration directly to the internet.

## Updating

Create a backup first. For Docker:

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
```

For a native installation:

```sh
git pull --ff-only
npm ci
npm start
```

Schema migrations run automatically at startup. Never replace or delete `data` during an update.
