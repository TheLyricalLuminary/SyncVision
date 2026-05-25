# SyncVision

**Pre-clearance risk engine for music supervisors and composers.**

A music supervisor sitting down to score a scene shouldn't be working from a spreadsheet, a Spotify playlist, and a gut feeling. SyncVision replaces that workflow with a ranked, rights-checked, audit-stamped shortlist in under five seconds — and a PDF they can hand to a director or a label.

It is **not** an AI recommendation engine. It is a deterministic scoring system. Same inputs produce the same outputs every time, and every number on the screen can be traced back to the rule that produced it.

Built by a working singer-songwriter signed to a sync music company — designed against how supervisors actually clear placements, not how a generic recommender thinks they do.

---

## Who it's for

SyncVision is built around the two people who actually decide what music ends up on screen:

- **The composer** — uploads their catalogue and gets their work scored against real scene briefs. They see exactly why a track passed or failed and what they'd need to fix to clear faster.
- **The music supervisor** — sits down with a scene to score, hits Analyze, and gets a shortlist ranked by fit, rights clarity, and metadata completeness. They walk into a director meeting with a defensible decision packet, not a Spotify playlist.

The two sides go hand-in-hand. The composer's catalogue is the supply. The supervisor's brief is the demand. SyncVision is the layer that matches them with math instead of memory.

---

## The flow — brief to PDF

The entire app is a single linear pipeline. No branching, no dead ends.

### 1. Brief

The supervisor selects a scene type (chase tension, romance intimacy, grief loss, product launch — 20 categories total) or writes a free-text description. Pacing, emotional register, and scene length are captured as structured parameters alongside the free-text brief.

### 2. Ingest

The composer uploads tracks. The Python worker runs librosa-based audio analysis to extract tempo, tonal character, energy, RMS, and spectral centroid. The backend stamps the track with its rights profile — ISRC (resolved async via AcoustID fingerprinting), writer, publisher, PRO affiliation, master ownership, one-stop status — and writes everything to Postgres.

### 3. Score

One deterministic vector, one scalar rank. No per-brief weight variants.

```
TrackVector = { scene, rights, lyrics, signal }   // all axes 0–1
WEIGHTS     = { scene: 0.45, rights: 0.25, lyrics: 0.25, signal: 0.05 }
score       = dot(vector, weights) × 100
```

Four axis constructors feed the vector:

- **Scene** — weighted mix of PAD scene fit and DSP match score
- **Rights** — starts at 1.0, deducted by clearance blockers (unidentified writer, unknown publisher, missing PRO work ID, one-stop unconfirmed, master ownership unset) and identity uncertainty
- **Lyrics** — neutral 0.5 until lyric data is available; then sentiment/mood alignment
- **Signal** — audio completeness: has audio file, has lyrics, metadata completeness

Weights are fixed constants. The architecture adjusts embeddings and normalization inputs — never the weights.

### 4. Rights pipeline

The rights layer is an 8-stage intake and verification pipeline, not a form:

1. Metadata intake
2. Writer / splits captured
3. Publisher data captured
4. One-stop confirmed
5. Sync license cleared
6. Lyric license cleared
7. Fingerprint identity resolution (AcoustID)
8. PRO cross-check

Each stage shows a live status indicator. Rights confidence is displayed as a percentage. When rights data is saved, the rights axis recomputes locally and the match score updates immediately — no page reload.

ISRC is not required at upload. Identity resolution happens asynchronously via AcoustID fingerprinting: the backend runs `fpcalc` (Chromaprint) on the audio file, queries `api.acoustid.org`, and returns a reconciliation diff of submitted metadata against the MusicBrainz registry.

### 5. Narrative

For every track-brief pairing, the engine selects one of 360 hand-authored phrases from the narrative dictionary. Selection is `sha256(trackId + briefId) % poolSize`. Same track, same brief, same phrase — every time. No LLM in the loop. Phrases are written in working music-supervisor trade language (cue sheet, one-stop, MFN, controlled comp, dialogue ducking, button ending, needle drop).

### 6. Shortlist

The supervisor sees a ranked list with the scalar SyncVision Score, match narrative, and a weighted axis bar breakdown. Bar width is proportional to axis weight; bar fill is proportional to axis value. Delta scores show how much better the top pick is than the alternatives.

### 7. PDF + Share

One click exports a decision packet — branded, signable, hash-stamped. Another click copies a share link the director can open without logging in to approve or pass on each track. Both ship with `scoringVersion` and `inputHash` baked in so the document is reproducible months later.

---

## Architecture

```
apps/
  frontend/       React + Vite — single-screen decision surface
  backend/        Node + Express — scoring engine, rights FSM, API
  worker/         Python — librosa audio analysis (spawned as subprocess)
```

- **Postgres (Neon)** — tracks, briefs, scores, rights state, audit hashes
- **Prisma** — schema management, deployed via `prisma migrate deploy`
- **Stripe** — four-tier billing (Starter / Pro / Studio / Enterprise)
- **AcoustID / Chromaprint** — async fingerprint identity resolution via `fpcalc` + `api.acoustid.org`
- **Render** — Docker-based deployment (Node 20 + Python 3.11 + Chromaprint + ffmpeg in one image)

The scoring read path is purely deterministic — a SHA-256 audit hash on every response enforces the invariant that the same inputs always produce byte-identical output.

---

## Tiers

| Tier       | Price      | Catalogue          | Features                                                                               |
|------------|------------|--------------------|----------------------------------------------------------------------------------------|
| Starter    | $149/mo    | Up to 100 tracks   | Rights FSM, scene fit scoring (20 briefs), deterministic audit hash, CSV export        |
| Pro ★      | $299/mo    | Up to 500 tracks   | Everything in Starter, confidence score ranking, ROI calculator, priority support      |
| Studio     | $499/mo    | Up to 2,000 tracks | Everything in Pro, multi-catalog management, team member access, rights report export  |
| Enterprise | $1,999/mo  | Unlimited          | Everything in Studio, API access, dedicated account manager, custom SLA / SAML SSO    |

★ Most popular

---

## Status

End-to-end pipeline operational — brief → ingest → score → shortlist → PDF running on real audio files. Rights intake and AcoustID fingerprint identity resolution live in production. Iterated based on direct feedback from an active music supervisor in the sync licensing space.

**Demo on request.** If you're a composer with a catalogue to score or a supervisor with briefs to test, reach out.

---

## Built by

Mark Amigoni — full-stack engineer and signed singer-songwriter. SyncVision is solo-built across the React frontend, Node/TypeScript backend, Python DSP worker, Postgres, and Render infrastructure. Currently in active conversations with music supervisors and sync licensing professionals.

---

## License

Copyright (c) 2026 Mark Amigoni. All rights reserved.

No part of this repository may be reproduced, distributed, or transmitted in any form without explicit written permission from the author.
