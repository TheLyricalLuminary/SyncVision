# SyncVision

**Sync licensing intelligence for music supervisors and composers.**

A music supervisor scoring a scene shouldn't be working from a spreadsheet, a Spotify playlist, and a gut feeling. SyncVision compresses that workload into a ranked, rights-checked shortlist in under five seconds — and a PDF they can hand to a director or a label.

It is not an AI recommendation engine. It is a deterministic scoring system that surfaces what you need to decide, faster. Same inputs produce the same outputs every time. Every number on screen traces back to the rule that produced it. The system filters and ranks; the supervisor decides.

Built by a working singer-songwriter signed to a sync music company — designed against how supervisors actually clear placements, not how a generic recommender thinks they do.

---

## Who it's for

SyncVision is built around the two people who actually decide what music ends up on screen.

**The composer** uploads their catalogue and gets their work scored against real scene briefs. They see exactly why a track placed or didn't, and what needs fixing to clear faster.

**The music supervisor** enters a scene description, hits Analyze, and gets a shortlist ranked by fit, rights exposure, and metadata completeness. They walk into a director meeting with a defensible decision packet — not a playlist.

The two sides go hand-in-hand. The composer's catalogue is the supply. The supervisor's brief is the demand. SyncVision is the matching layer — math instead of memory, structure instead of instinct.

---

## What it produces

SyncVision outputs are labeled to reflect what they are: compressed signals for human judgment, not verdicts.

| Output | What it means |
|---|---|
| **Fit Index** | Dot product of four weighted axes — not a pass/fail decision |
| **Sync assessment** | Deterministic, audit-stable phrase from a 360-entry dictionary — structural fit only |
| **Rights exposure** | How much clearance risk is visible given current metadata completeness |
| **Best fit in shortlist** | Highest-scoring track under current constraints — not a recommendation |
| **−N pts separation** | Score gap between top track and alternatives — ordering is informational, not prescriptive |

The system makes no claim to editorial taste, cultural context, or legal determination. It compresses what the metadata graph implies; the supervisor decides what it means.

---

## The flow — brief to PDF

### 1. Brief

The supervisor selects a scene type from **26 industry-standard categories** (chase tension, romance intimacy, grief loss, trailer promo, true crime investigative, sports highlight, kids family, faith inspirational, period historical — and more) or writes a free-text description. The classifier auto-detects the brief type from natural language; the supervisor can override it manually via a full picker grid. Pacing, emotional register (43 mood tags across 7 families), and scene length are captured as structured parameters.

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
FitIndex    = dot(vector, weights) × 100
```

Per-brief weight profiles fine-tune the scene/rights/metadata balance for each of the 26 scene types. High-clearance-risk briefs (trailer, broadcast, sports, kids) carry higher rights weight. Intimate/grief/romance briefs weight scene fit higher.

The axis bar visualization makes the compression explicit: bar width is proportional to axis weight, bar fill is proportional to axis value. The legend reads: *bar width = weight · bar fill = axis value*.

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

Each stage shows a live status indicator. Rights exposure displays as a percentage of pipeline stages complete. When rights data saves, the rights axis recomputes locally and the Fit Index updates immediately — no page reload.

### 5. Identity resolution

One button — "Resolve Identity" — triggers a layered lookup. Each layer has a distinct role; none overrides another. Where datasets conflict, the discrepancy is surfaced to the supervisor rather than resolved automatically.

**Layer 1 — AudD (audio recognition, primary)**
Shazam-style audio recognition against AudD's commercial catalog. Returns artist, title, ISRC, and MusicBrainz ID from the audio signal alone — works even with degraded or watermarked audio.

**Layer 2 — AcoustID / Chromaprint (audio identity, fallback)**
When AudD returns no match, `fpcalc` generates a Chromaprint fingerprint and queries `api.acoustid.org`. Returns a MusicBrainz recording MBID and match confidence.

**Layer 3 — MusicBrainz (canonical catalog)**
Given the recording MBID, fetches the full recording: ISRC, work MBID, ISWC, composer name, writer IPI. Canonical public catalog, not a rights database.

**Layer 4 — Credits.fm (entity resolution)**
Given the resolved ISRC, Credits.fm resolves identifiers across systems — linking ISRC to ISWC to IPI across MLC, CISAC, and DSP metadata. Graph resolution, not rights authority.

**Layer 5 — Musixmatch (lyrics linkage)**
ISRC or artist+title lookup returns lyrics availability, explicit flag, language, and a direct Musixmatch URL. Feeds the lyrics axis of the scoring vector.

The result: the rights intake form opens pre-populated — writer name, IPI, publisher, PRO affiliation, ISRC, ISWC — with each field tagged by its source registry. Any conflict between sources is flagged before a placement decision is made.

### 6. Narrative

For every track-brief pairing, the engine selects one of **360 hand-authored phrases** from the narrative dictionary. Selection is `sha256(trackId + briefId + verdict) % poolSize`. Same track, same brief, same phrase — every time. No LLM in the loop.

Phrases are written in working music-supervisor trade language (cue sheet, one-stop, MFN, controlled comp, dialogue ducking, button ending, needle drop). Phrases describe structural fit only — no invented timestamps, no scene-specific elements the system cannot verify. The label reads *deterministic · audit-stable* because that is what it is: a reproducible summary tag, not a justification.

Verdict tiers: PASS_STRONG · PASS_SOFT · MAYBE_HIGH · MAYBE_LOW · FAIL_CLOSE · FAIL_HARD

### 7. Shortlist

The supervisor sees a ranked list with the Fit Index, sync assessment, and a weighted axis bar breakdown. The top track is labeled *Best fit in shortlist*. Other tracks show *−N pts separation* — how far behind the leader they are. Both labels are informational. The shortlist is a compressed input to a decision, not the decision itself.

### 8. PDF + Share

One click exports a decision packet — branded, signable, hash-stamped. Another click copies a share link the director can open without logging in. Both ship with `scoringVersion` and `inputHash` baked in so the document is reproducible months later.

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
| Fit scoring | SyncVision engine | Compressed signal for human judgment |

The output is a structural likelihood, not a legal determination. SyncVision surfaces what the metadata graph implies about ownership; it does not confirm clearance. That distinction is explicit in the UI at every stage.

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
| Pro ★      | $299/mo    | Up to 500 tracks   | Everything in Starter, Fit Index ranking, ROI calculator, priority support             |
| Studio     | $499/mo    | Up to 2,000 tracks | Everything in Pro, multi-catalog management, team member access, rights report export  |
| Enterprise | $1,999/mo  | Unlimited          | Everything in Studio, API access, dedicated account manager, custom SLA / SAML SSO    |

★ Most popular

---

## Status

End-to-end pipeline operational — brief → ingest → score → shortlist → PDF running on real audio files. Identity resolution via AudD + AcoustID + MusicBrainz + Credits.fm + Musixmatch live in production. Rights intake auto-populates from registry lookups. 26 scene types with per-brief weight profiles and a 360-phrase narrative dictionary. Output labels reflect the correct epistemic model: compressed signals for human judgment, not verdicts. Iterated based on direct feedback from an active music supervisor in the sync licensing space.

**Demo on request.** If you're a composer with a catalogue to score or a supervisor with briefs to test, reach out.

---

## Built by

Mark Amigoni — full-stack engineer and signed singer-songwriter. SyncVision is solo-built across the React frontend, Node/TypeScript backend, Python DSP worker, Postgres, and Render infrastructure. Currently in active conversations with music supervisors and sync licensing professionals.

---

## License

Copyright (c) 2026 Mark Amigoni. All rights reserved.

No part of this repository may be reproduced, distributed, or transmitted in any form without explicit written permission from the author.
