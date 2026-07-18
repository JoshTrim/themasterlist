FROM node:24-bookworm-slim

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

COPY package.json package-lock.json requirements-background-removal.txt ./
RUN npm ci --omit=dev \
  && python3 -m venv /opt/rembg \
  && /opt/rembg/bin/pip install --no-cache-dir -r requirements-background-removal.txt

COPY server.js ./
COPY public ./public

RUN mkdir -p /data/media /data/backups && chown -R node:node /app /data /opt/rembg

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
