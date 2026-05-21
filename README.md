# SyncVision

**Pre-clearance risk engine for music supervisors and composers.**

SyncVision replaces the spreadsheet a music supervisor uses to vet tracks against a scene brief. Instead of weeks of phone calls, emails, and gut calls, a supervisor types in what the scene needs and gets back a ranked, rights-checked, audit-stamped shortlist in under five seconds — with a PDF they can hand to a director or a label.

It is **not** an AI recommendation engine. It is a deterministic scoring system. Same inputs produce the same outputs every time, and every number on the screen can be traced back to the rule that produced it.

-----

## Who it’s for

SyncVision is built around the two people who actually decide what music ends up on screen:

- **The composer** — uploads their catalogue (tracks, ISRC, ASCAP work ID, master ownership, stems) and gets their work scored against real scene briefs. They see exactly why a track passed or failed and what they’d need to fix to clear faster.
- **The music supervisor** — sits down with a scene to score, hits Analyze, and gets a shortlist ranked by fit, rights clarity, and metadata completeness. They walk into a director meeting with a defensible decision packet, not a Spotify playlist.

The two sides go hand-in-hand. The composer’s catalogue is the supply. The supervisor’s brief is the demand. SyncVision is the layer that matches them with math instead of memory.

-----

## The flow — brief to PDF

The entire app is a single linear pipeline. No branching, no dead ends.

### 1. Brief

The supervisor selects a scene type (chase tension, romance intimacy, grief loss, product launch — 20 categories total) or writes a free-text description. The brief defines the target PAD profile (arousal, valence, dominance) the engine will score against.

### 2. Ingest

The composer uploads tracks. The Python worker runs librosa-based audio analysis to extract the PAD timeline. The backend stamps the track with its rights profile — ISRC, ASCAP work ID, master ownership %, one-stop status — and writes everything to Postgres. A Redis Stream queues the analysis job so a paying tier never waits behind a free one.

### 3. Score

Three engines run in parallel:

- **Scene Fit** — geometric distance from the track’s PAD signature to the brief’s target box (50% of the composite)
- **Rights Clarity** — a finite-state machine walks the rights profile and lands the track in one of five states: `INGESTED`, `UNVERIFIED`, `PARTIALLY_CLEAR`, `CLEAR`, `BLOCKED` (30%)
- **Metadata Completeness** — 0–100 score based on how much manual follow-up a placement would require (20%)

Weights shift slightly per brief — grief-loss weights Scene Fit higher than corporate-aspirational does.

### 4. Narrative

For every track-brief pairing, the engine selects one of 360 hand-authored phrases from the narrative dictionary. Selection is `sha256(trackId + briefId) % poolSize`. Same track, same brief, same phrase — every time. No LLM in the loop. Phrases are written in working music-supervisor trade language (cue sheet, one-stop, MFN, controlled comp, dialogue ducking, button ending, needle drop) so the output reads like notes from a real supervisor, not AI prose.

### 5. Shortlist

The supervisor sees a ranked list with the composite SyncVision Score, the verdict tier (PASS_STRONG, PASS_SOFT, MAYBE, FAIL_SOFT, FAIL_HARD), and the narrative for each track. Delta scores show how much better the top pick is than the alternatives.

### 6. PDF + Share

One click exports a decision packet — branded, signable, hash-stamped. Another click copies a share link the director can open without logging in to approve or pass. Both ship with `scoringVersion` and `hashRanking` baked in so the document is reproducible months later.

-----

## Architecture

```
apps/
  frontend/       React + Vite — single-screen decision surface
  backend/        Node + Express — scoring engine, rights FSM, API
  worker/         Python — librosa audio analysis (spawned as subprocess)
```

- **Postgres** — tracks, briefs, scores, rights state, audit hashes
- **Redis Stream** — analysis job queue with tier-based priority
- **Stripe** — five-tier billing (Free / Artist / Composer / Supervisor / Studio) plus a $9.99 24-hour trial

CQRS-style separation between the write side (ingest + analysis) and the read side (scoring + ranking). The read side is purely deterministic — a hash check on every response enforces the invariant that the same inputs always produce byte-identical output.

-----

## Tiers

|Tier      |Price     |Catalogue     |Export         |Priority|
|----------|----------|--------------|---------------|--------|
|Free      |$0        |3 tracks      |—              |low     |
|Trial     |$9.99 once|5 tracks / 24h|—              |normal  |
|Artist    |$99/mo    |25 tracks     |—              |normal  |
|Composer  |$149/mo   |75 tracks     |PDF, CSV       |normal  |
|Supervisor|$299/mo   |300 tracks    |PDF, CSV, XLSX |high    |
|Studio    |$499/mo   |unlimited     |white-label PDF|highest |

-----

## Status

End-to-end pipeline operational — brief → ingest → score → shortlist → PDF running on real audio files. Currently in pre-launch; seeking first beta users in the composer and music supervisor space. Demo available on request.