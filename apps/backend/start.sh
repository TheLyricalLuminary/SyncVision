#!/bin/sh
set -e

cd /app/apps/backend

echo "[start] running prisma migrate deploy"
if ! npx prisma migrate deploy 2>&1; then
  echo "[start] migrate deploy failed — attempting baseline for pre-existing schema"
  npx prisma migrate resolve --applied 0_init || true
  npx prisma migrate resolve --applied 20260509_add_stripe_reconciliation || true
  npx prisma migrate resolve --applied 20260523_add_rights_state_to_profile || true
  npx prisma migrate resolve --applied 20260525_add_sync_lyric_acoustid_fields || true
  npx prisma migrate resolve --applied 20260525_fix_track_schema_acoustid || true
  npx prisma migrate resolve --applied 20260531_add_iswc_workmbid_rightssources || true
  npx prisma migrate resolve --applied add_enrichment_fields_v2 || true
  npx prisma migrate resolve --applied add_enrichment_sources || true
  echo "[start] baseline complete — retrying migrate deploy"
  npx prisma migrate deploy
fi

echo "[start] starting server"
exec node /app/apps/backend/dist/index.js
