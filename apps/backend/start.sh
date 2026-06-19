#!/bin/sh
set -e

cd /app/apps/backend

echo "[start] starting server"
exec node /app/apps/backend/dist/index.js
