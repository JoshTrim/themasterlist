FROM node:24.16.0-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    MASTER_LIST_DATA_DIR=/data \
    REMBG_COMMAND=/opt/rembg/bin/rembg \
    U2NET_HOME=/data/.u2net \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    python3 \
    python3-venv \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-background-removal.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/rembg \
  && /opt/rembg/bin/pip install -r requirements-background-removal.txt

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev \
  && find node_modules/better-sqlite3/prebuilds -type f -delete \
  && ./node_modules/.bin/node-gyp rebuild --release --force_build=1 --directory node_modules/better-sqlite3 \
  && npm prune --omit=dev \
  && node -e "const Database = require('better-sqlite3'); const database = new Database(':memory:'); database.close();"

COPY server.js ./
COPY lib ./lib
COPY public ./public

RUN mkdir -p /data/media /data/backups && chown -R node:node /app /data /opt/rembg

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
