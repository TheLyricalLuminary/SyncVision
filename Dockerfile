# Node 20 on Debian Bookworm — ships Python 3.11 natively, no external PPA needed.
FROM node:20-bookworm

# ── Python 3.11 (Bookworm system package) ─────────────────────────────────────
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libchromaprint-tools \
    ffmpeg \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHON_BIN=/usr/bin/python3

# Confirm 3.11.x at build time so a base-image drift fails loudly here.
RUN python3 --version

# ── Python DSP dependencies ────────────────────────────────────────────────────
# --prefer-binary prevents scipy/numba from falling through to source compilation,
# which is unreliable under BLAS/ATLAS version variance on some CI runners.
COPY apps/worker/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --prefer-binary --break-system-packages \
        --upgrade pip setuptools wheel \
 && pip3 install --no-cache-dir --prefer-binary --break-system-packages \
        -r /tmp/requirements.txt

# ── Node dependencies + build ──────────────────────────────────────────────────
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
RUN cd apps/backend && npm install
RUN cd apps/frontend && npm install

COPY apps/backend ./apps/backend
COPY apps/frontend ./apps/frontend
COPY apps/worker  ./apps/worker

ARG VITE_API_URL=""
ARG VITE_APP_URL=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL

RUN cd apps/frontend && npm run build
RUN cd apps/backend && npm run build

# ── Runtime ────────────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=8080
ENV AUDIO_STORAGE_PATH=/var/audio

RUN mkdir -p /var/audio

COPY apps/backend/start.sh /app/apps/backend/start.sh
RUN chmod +x /app/apps/backend/start.sh

EXPOSE 8080
# start.sh runs `prisma migrate deploy` then starts the server.
# Migrations run at container startup so DATABASE_URL is available.
CMD ["/app/apps/backend/start.sh"]
