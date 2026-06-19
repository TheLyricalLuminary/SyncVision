CREATE TABLE IF NOT EXISTS scoring.decision_packets (
  id               TEXT        NOT NULL PRIMARY KEY,
  "packetVersion"  TEXT        NOT NULL DEFAULT '1',
  "scoringVersion" TEXT        NOT NULL,
  "briefId"        TEXT        NOT NULL,
  "briefText"      TEXT        NOT NULL,
  "sceneParams"    JSONB       NOT NULL,
  tracks           JSONB       NOT NULL,
  "packetHash"     TEXT        NOT NULL,
  "expiresAt"      TIMESTAMPTZ NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  director_decisions JSONB
);
