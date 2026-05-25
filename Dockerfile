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
# which is unreliable under BLAS/ATLAS version variance on Render.
COPY apps/worker/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --prefer-binary --break-system-packages \
        --upgrade pip setuptools wheel \
 && pip3 install --no-cache-dir --prefer-binary --break-system-packages \
        -r /tmp/requirements.txt

# ── Node dependencies + build ──────────────────────────────────────────────────
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
RUN cd apps/backend && npm install

COPY apps/backend ./apps/backend
COPY apps/worker  ./apps/worker

RUN cd apps/backend && npm run build

# ── Runtime ────────────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000
ENV AUDIO_STORAGE_PATH=/var/audio

RUN mkdir -p /var/audio

EXPOSE 3000
CMD ["node", "apps/backend/dist/index.js"]
