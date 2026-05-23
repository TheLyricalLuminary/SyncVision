-- Add rights_state and rights_last_checked_at to RightsProfile
-- Apply with: psql $DATABASE_URL -f this_file.sql
-- Or via Prisma: npx prisma db execute --file prisma/migrations/20260523_add_rights_state_to_profile/migration.sql

ALTER TABLE scoring."RightsProfile"
  ADD COLUMN IF NOT EXISTS "rightsState"         TEXT,
  ADD COLUMN IF NOT EXISTS "rightsLastCheckedAt"  TIMESTAMPTZ;
