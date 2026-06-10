#!/bin/sh
# Run pending Prisma migrations against the live database, then start the server.
# This runs at container startup (not at build time) so DATABASE_URL is available.
set -e

echo "[start] running prisma migrate deploy"
cd /app/apps/backend && npx prisma migrate deploy

echo "[start] starting server"
exec node /app/apps/backend/dist/index.js
