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

The supervisor selects a scene type from **26 industry-standard categories** (chase tension, romance intimacy, grief loss, trailer promo, true crime investigative, sports highlight, kids family, faith inspirational, period historical — and more) or writes a free-text description. The classifier auto-detects the brief type from natural language; the supervisor can override it manually via a full picker grid. Pacing, emotional register (43 mood tags across 7 families), and scene length are captured as structured parameters alongside the free-text brief.

**Mood families:** Connection · Conflict · Resolution · Dark · Memory · Energy · Style

### 2. Ingest

The composer uploads tracks. Canonical track identity is resolved at ingestion using a three-tier chain:

1. **Embedded tags** — ID3 (TIT2/TPE1/TSRC), Vorbis/FLAC comments: title, artist, ISRC extracted directly
2. **Filename parsing** — strips UUID prefixes, noise words (watermarked, background vocals, official video), trailing numbers, splits on `Artist - Title` delimiter
3. **Raw filename** — last resort only

The Python worker runs librosa-based audio analysis to extract tempo, tonal character, energy, RMS, and spectral centroid. Identity resolution continues asynchronously via fingerprinting after the track is in the system.

### 3. Score

One deterministic vector, one scalar rank.

```
TrackVector = { scene, rights, lyrics, signal }   // all axes 0–1
WEIGHTS     = { scene: 0.45, rights: 0.25, lyrics: 0.25, signal: 0.05 }
score       = dot(vector, weights) × 100
```

Per-brief weight profiles fine-tune the scene/rights/metadata balance for each of the 26 scene types. High-clearance-risk briefs (trailer, broadcast, sports, kids) carry higher rights weight. Intimate/grief/romance briefs weight scene fit higher.

### 4. Rights pipeline

The rights layer is an 8-stage intake and verification pipeline:

1. Metadata intake
2. Writer / splits captured
3. Publisher data captured
4. One-stop confirmed
5. Sync license cleared
6. Lyric license cleared
7. Fingerprint identity resolution (AudD → AcoustID → MusicBrainz → Credits.fm)
8. PRO cross-check

Each stage shows a live status indicator. Rights confidence displays as a percentage. When rights data saves, the rights axis recomputes locally and the match score updates immediately — no page reload.

### 5. Identity resolution (the key workflow)

One button — "Resolve Identity" — triggers a layered lookup. Each layer has a distinct role; none overrides another. Where datasets conflict, the discrepancy is surfaced to the supervisor rather than resolved automatically.

**Layer 1 — AudD (audio recognition, primary)**
Shazam-style audio recognition against AudD's commercial catalog. Returns artist, title, ISRC, and MusicBrainz ID from the audio signal alone — works even with degraded or watermarked audio. Primary fingerprint provider.

**Layer 2 — AcoustID / Chromaprint (audio identity, fallback)**
When AudD returns no match, `fpcalc` generates a Chromaprint fingerprint and queries `api.acoustid.org`. Returns a MusicBrainz recording MBID and match confidence. Fallback identity layer.

**Layer 3 — MusicBrainz (canonical catalog)**
Given the recording MBID, fetches the full recording: ISRC, work MBID, ISWC, composer name, writer IPI. MusicBrainz is the canonical public catalog, not a rights database.

**Layer 4 — Credits.fm (entity resolution)**
Given the resolved ISRC, Credits.fm resolves identifiers across systems — linking ISRC to ISWC to IPI across MLC, CISAC, and DSP metadata. Graph resolution, not rights authority.

**Layer 5 — Musixmatch (lyrics linkage)**
ISRC or artist+title lookup returns lyrics availability, explicit flag, language, and a direct Musixmatch URL. Feeds the lyrics axis of the scoring vector.

The result: the rights intake form opens pre-populated — writer name, IPI, publisher, PRO affiliation, ISRC, ISWC — with each field tagged by its source registry. Any conflict between sources is flagged before a placement decision is made.

### 6. Narrative

For every track-brief pairing, the engine selects one of **360 hand-authored phrases** from the narrative dictionary. Selection is `sha256(trackId + briefId + verdict) % poolSize`. Same track, same brief, same phrase — every time. No LLM in the loop. Phrases are written in working music-supervisor trade language (cue sheet, one-stop, MFN, controlled comp, dialogue ducking, button ending, needle drop). Phrases describe structural fit only — no invented timestamps, no scene-specific elements the system cannot verify.

Verdict tiers: PASS_STRONG · PASS_SOFT · MAYBE_HIGH · MAYBE_LOW · FAIL_CLOSE · FAIL_HARD

### 7. Shortlist

The supervisor sees a ranked list with the scalar SyncVision Score, match narrative, and a weighted axis bar breakdown. Bar width is proportional to axis weight; bar fill is proportional to axis value. Delta scores show how much better the top pick is than the alternatives.

### 8. PDF + Share

One click exports a decision packet — branded, signable, hash-stamped. Another click copies a share link the director can open without logging in to approve or pass on each track. Both ship with `scoringVersion` and `inputHash` baked in so the document is reproducible months later.

---

## Ownership hypothesis stack

| Layer | Source | Role |
|---|---|---|
| Audio recognition | AudD | What track is this? (commercial fingerprint) |
| Audio identity | AcoustID + Chromaprint | What recording is this? (open fingerprint, fallback) |
| Canonical catalog | MusicBrainz | What officially exists in the world? |
| Entity resolution | Credits.fm | How do identifiers connect across systems? |
| Lyrics linkage | Musixmatch | Is this track lyric-safe and what language? |
| Ownership inference | PRO + publisher + label heuristics | Who likely controls what? |
| Clearance decision | SyncVision scoring engine | Safe / risky / unknown — and why |

The output is a structural likelihood, not a legal determination. SyncVision surfaces what the metadata graph implies about ownership; it does not confirm clearance. That distinction is made explicit in the UI at every stage.

---

## Architecture

```
apps/
  frontend/       React + Vite — single-screen decision surface
  backend/        Node + Express — scoring engine, rights FSM, API
  worker/         Python — librosa audio analysis (spawned as subprocess)
```

- **Postgres (Neon)** — tracks, briefs, scores, rights state, audit hashes
- **Prisma** — schema management, multiSchema (all tables in `scoring` schema)
- **Stripe** — four-tier billing (Starter / Pro / Studio / Enterprise)
- **AudD** — Shazam-style audio recognition, primary fingerprint provider
- **AcoustID / Chromaprint** — `fpcalc` fingerprinting + `api.acoustid.org` lookup (fallback)
- **MusicBrainz** — open music encyclopedia, recording and work metadata
- **Credits.fm** — entity resolution: ISRC → ISWC → IPI across MLC, CISAC, DSP metadata
- **Musixmatch** — lyrics availability, explicit flag, language detection
- **Render** — Docker-based deployment (Node 20 + Python 3.11 + Chromaprint + ffmpeg)

The scoring read path is purely deterministic — a SHA-256 audit hash on every response enforces the invariant that the same inputs always produce byte-identical output.

---

## Scene types (26)

Chase / Tension · Action / Combat · Triumph / Victory · Euphoria / Celebration · Suspense / Dread · Horror / Psychological · Drama / Confrontation · Urban / Gritty · Romance / Intimacy · Heartbreak / Separation · Grief / Loss · Contemplative / Reflective · Emotional Resolution · Comedy / Light · Quirky / Offbeat · Montage / Transition · Opening / Closing Title · Cinematic / Epic · Corporate / Aspirational · Nature / Pastoral · Sports / Highlight · True Crime / Investigative · Faith / Inspirational · Kids / Family · Trailer / Promo · Period / Historical

---

## Tiers

| Tier       | Price      | Catalogue          | Features                                                                               |
|------------|------------|--------------------|----------------------------------------------------------------------------------------|
| Starter    | $149/mo    | Up to 100 tracks   | Rights FSM, scene fit scoring (26 briefs), deterministic audit hash, CSV export        |
| Pro ★      | $299/mo    | Up to 500 tracks   | Everything in Starter, confidence score ranking, ROI calculator, priority support      |
| Studio     | $499/mo    | Up to 2,000 tracks | Everything in Pro, multi-catalog management, team member access, rights report export  |
| Enterprise | $1,999/mo  | Unlimited          | Everything in Studio, API access, dedicated account manager, custom SLA / SAML SSO    |

★ Most popular

---

## Status

End-to-end pipeline operational — brief → ingest → score → shortlist → PDF running on real audio files. Identity resolution via AudD + AcoustID + MusicBrainz + Credits.fm + Musixmatch live in production. Rights intake auto-populates from registry lookups. 26 scene types with per-brief weight profiles and a 360-phrase narrative dictionary. Iterated based on direct feedback from an active music supervisor in the sync licensing space.

**Demo on request.** If you're a composer with a catalogue to score or a supervisor with briefs to test, reach out.

---

## Built by

Mark Amigoni — full-stack engineer and signed singer-songwriter. SyncVision is solo-built across the React frontend, Node/TypeScript backend, Python DSP worker, Postgres, and Render infrastructure. Currently in active conversations with music supervisors and sync licensing professionals.

---

## License

Copyright (c) 2026 Mark Amigoni. All rights reserved.

No part of this repository may be reproduced, distributed, or transmitted in any form without explicit written permission from the author.
