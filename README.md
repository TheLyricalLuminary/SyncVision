# SyncVision

**Sync licensing intelligence for music supervisors and composers.**

A music supervisor scoring a scene shouldn't be working from a 
spreadsheet, a Spotify playlist, and a gut feeling. SyncVision 
compresses that workload into a ranked, rights-checked shortlist 
in under five seconds — and a PDF they can hand to a director 
or a label.

It is not an AI recommendation engine. It is a deterministic 
scoring system that surfaces what you need to decide, faster. 
Same inputs produce the same outputs every time. Every number 
on screen traces back to the rule that produced it. The system 
filters and ranks; the supervisor decides.

Built by a working singer-songwriter signed to a sync music 
company — designed against how supervisors actually clear 
placements, not how a generic recommender thinks they do.

---

## Who it's for

SyncVision is built around the two people who actually decide 
what music ends up on screen.

**The composer** uploads their catalogue and gets their work 
scored against real scene briefs. They see exactly why a track 
placed or didn't, and what needs fixing to clear faster.

**The music supervisor** enters a scene description, hits 
Analyze, and gets a shortlist ranked by fit, rights exposure, 
and metadata completeness. They walk into a director meeting 
with a defensible decision packet — not a playlist.

The two sides go hand-in-hand. The composer's catalogue is 
the supply. The supervisor's brief is the demand. SyncVision 
is the matching layer — math instead of memory, structure 
instead of instinct.

---

## What it produces

SyncVision outputs are labeled to reflect what they are: 
compressed signals for human judgment, not verdicts.

| Output | What it means |
|---|---|
| **Fit Index** | Dot product of four weighted axes — not a pass/fail decision |
| **Sync assessment** | Deterministic, audit-stable phrase from a 360-entry dictionary — structural fit only |
| **Clearance Complexity** | How hard this track is to clear — scored separately from creative fit |
| **Data Confidence** | Percentage of 8 rights fields verified from registry sources |
| **Best fit in shortlist** | Highest-scoring track under current constraints — not a recommendation |
| **−N pts separation** | Score gap between top track and alternatives — ordering is informational, not prescriptive |

The system makes no claim to editorial taste, cultural context, 
or legal determination. It compresses what the metadata graph 
implies; the supervisor decides what it means.

---

## The flow — brief to PDF

### 1. Brief

The supervisor selects a scene type from **26 industry-standard 
categories** or writes a free-text description. The classifier 
auto-detects the brief type from natural language; the supervisor 
can override it manually via a full picker grid. Pacing, emotional 
register (43 mood tags across 7 families), and scene length are 
captured as structured parameters.

**Mood families:** Connection · Conflict · Resolution · Dark · 
Memory · Energy · Style

### 2. Ingest

The composer uploads tracks. Canonical track identity is resolved 
at ingestion using a three-tier chain:

1. **Embedded tags** — ID3 (TIT2/TPE1/TSRC), Vorbis/FLAC 
   comments: title, artist, ISRC extracted directly
2. **Filename parsing** — strips UUID prefixes, noise words 
   (watermarked, background vocals, official video), trailing 
   numbers, splits on Artist - Title delimiter
3. **Raw filename** — last resort only

The Python worker runs librosa-based audio analysis to extract 
tempo, tonal character, energy, RMS, and spectral centroid. 
Identity resolution continues asynchronously via fingerprinting 
after the track is in the system.

### 3. Score

One deterministic vector, one scalar rank.



TrackVector = { scene, lyrics, audioSignal, rightsClarity }
WEIGHTS     = { scene: 0.45, lyrics: 0.25, audioSignal: 0.20, rightsClarity: 0.10 }
FitIndex    = dot(vector, weights) × 100


Per-brief weight profiles fine-tune the balance for each of the 
26 scene types. High-clearance-risk briefs (trailer, broadcast, 
sports, kids) carry higher rights weight. Intimate/grief/romance 
briefs weight scene fit higher.

The axis bar visualization makes the compression explicit: bar 
width is proportional to axis weight, bar fill is proportional 
to axis value. The legend reads: *bar width = weight · bar fill 
= axis value*.

### 4. Clearance Complexity (separate from FitIndex)

Scored 0–100 based on:
- One-stop confirmed: +40
- Master ownership 100%: +20
- Indie/self-published: +15 (major label: +8)
- PRO affiliation known: +10
- Writer name known: +10
- Sync license cleared: +5 bonus

Displayed separately from the FitIndex. Creative fit ranks the 
tracks. Clearance complexity informs the placement decision. 
The two are never collapsed into one number.

### 5. Data Confidence

Displayed as a percentage — how many of 8 rights pipeline stages 
are verified. Shown separately from both FitIndex and Clearance 
Complexity so supervisors know how much to trust the rights 
picture before committing to a track.

### 6. Rights pipeline

The rights layer is an 8-stage intake and verification pipeline:

1. Metadata intake
2. Writer / splits captured
3. Publisher data captured
4. One-stop confirmed
5. Sync license cleared
6. Lyric license cleared
7. Fingerprint identity resolution
8. PRO cross-check

Each stage shows a live status indicator. When rights data saves, 
the rights axis recomputes locally and the Fit Index updates 
immediately — no page reload.

### 7. Lyric semantic axis

Lyrics are fetched from LRCLib (primary, free, full text, no key 
required) with Lyrics.ovh as fallback (free, full text, no key 
required). Three-state model:

- **FULL** — lyric text available, vocabulary overlap scored 
  against brief lexicon
- **INSTRUMENTAL** — confirmed no lyric content, neutral 0.50
- **UNAVAILABLE** — not in catalog, neutral 0.50

Neutral states never inflate or deflate ranking. Scoring is 
deterministic keyword-lexicon vocabulary overlap — same lyrics, 
same brief, same score every time. No LLM at scoring time.

### 8. Identity resolution

One button — "Resolve Identity" — triggers a layered lookup:

**Layer 1 — AudD** (audio recognition, primary)
Shazam-style recognition against AudD's commercial catalog. 
Returns artist, title, ISRC, and MusicBrainz ID from the audio 
signal alone.

**Layer 2 — AcoustID / Chromaprint** (fallback)
Generates a Chromaprint fingerprint and queries acoustid.org. 
Returns MusicBrainz recording MBID and match confidence.

**Layer 3 — MusicBrainz** (canonical catalog)
Fetches full recording: ISRC, work MBID, ISWC, composer name, 
writer IPI.

**Layer 4 — Credits.fm** (entity resolution)
Resolves identifiers across MLC, CISAC, and DSP metadata. 
Graph resolution, not rights authority.

The result: the rights intake form opens pre-populated — writer 
name, IPI, publisher, PRO affiliation, ISRC, ISWC — with each 
field tagged by its source registry.

### 9. Narrative

For every track-brief pairing, the engine selects one of **360 
hand-authored phrases** from the narrative dictionary. Selection 
is sha256(trackId + briefId + artistName) % poolSize. Same track, 
same brief, same phrase — every time. No LLM in the loop.

Phrases are written in working music-supervisor trade language 
(cue sheet, one-stop, MFN, controlled comp, dialogue ducking, 
button ending, needle drop). The label reads *deterministic · 
audit-stable* because that is what it is.

Verdict tiers: PASS_STRONG · PASS_SOFT · MAYBE_HIGH · MAYBE_LOW 
· FAIL_CLOSE · FAIL_HARD

### 10. Shortlist

The supervisor sees a ranked list with three clearly separated 
sections per track:

- **Scene Fit** — one-sentence explanation derived from PAD values
- **Sync Assessment** — deterministic narrative phrase
- **Clearance Complexity** — score + one-sentence explanation + 
  data confidence percentage

### 11. PDF + Share

One click exports a decision packet — branded, hash-stamped. 
Another click copies a share link the director can open without 
logging in. Both ship with scoringVersion and inputHash baked in 
so the document is reproducible months later.

The share view includes a full director workflow: approve or pass 
each track, leave notes, compare top 2 head-to-head with audio 
playing on both sides, and send all decisions to a named contact 
with one tap.

---

## Ownership hypothesis stack

| Layer | Source | Role |
|---|---|---|
| Audio recognition | AudD | What track is this? |
| Audio identity | AcoustID + Chromaprint | What recording is this? |
| Canonical catalog | MusicBrainz | What officially exists? |
| Entity resolution | Credits.fm | How do identifiers connect? |
| Lyrics | LRCLib / Lyrics.ovh | Lyric text for semantic axis |
| Ownership inference | PRO + publisher + label heuristics | Who likely controls what? |
| Fit scoring | SyncVision engine | Compressed signal for human judgment |

The output is a structural likelihood, not a legal determination. 
SyncVision surfaces what the metadata graph implies about 
ownership; it does not confirm clearance.

---

## Architecture



apps/
frontend/   React + Vite — single-screen decision surface
backend/    Node + Express — scoring engine, rights FSM, API
worker/     Python — librosa audio analysis (spawned as subprocess)


- **Postgres (Neon)** — tracks, briefs, scores, rights state, 
  audit hashes
- **Prisma** — schema management
- **Stripe** — four-tier billing
- **AudD** — audio recognition, primary fingerprint provider
- **AcoustID / Chromaprint** — fallback fingerprinting
- **MusicBrainz** — open music encyclopedia
- **Credits.fm** — entity resolution across MLC, CISAC, DSP
- **LRCLib / Lyrics.ovh** — lyric text for semantic axis
- **Render** — deployment (Node 20 + Python 3.11 + ffmpeg)

---

## Scene types (26)

Chase / Tension · Action / Combat · Triumph / Victory · 
Euphoria / Celebration · Suspense / Dread · Horror / 
Psychological · Drama / Confrontation · Urban / Gritty · 
Romance / Intimacy · Heartbreak / Separation · Grief / Loss · 
Contemplative / Reflective · Emotional Resolution · Comedy / 
Light · Quirky / Offbeat · Montage / Transition · Opening / 
Closing Title · Cinematic / Epic · Corporate / Aspirational · 
Nature / Pastoral · Sports / Highlight · True Crime / 
Investigative · Faith / Inspirational · Kids / Family · 
Trailer / Promo · Period / Historical

---

## Tiers

| Tier | Price | Catalogue | Features |
|---|---|---|---|
| Starter | $149/mo | Up to 100 tracks | Rights FSM, scene fit scoring, deterministic audit hash, CSV export |
| Pro ★ | $299/mo | Up to 500 tracks | Everything in Starter, Fit Index ranking, priority support |
| Studio | $499/mo | Up to 2,000 tracks | Everything in Pro, multi-catalog management, team access, rights report export |
| Enterprise | $1,999/mo | Unlimited | Everything in Studio, API access, dedicated account manager, custom SLA |

★ Most popular

---

## Status

End-to-end pipeline operational. Four real independently-computed 
scoring axes live in production. Clearance complexity scored and 
displayed separately from creative fit — the core architectural 
distinction from every other tool in the space. Lyric semantic 
axis live with deterministic keyword-lexicon vocabulary matching 
against 20 brief lexicons. 242-track lyric backfill completed. 
Rights intake auto-populates from MusicBrainz, Credits.fm, and 
fingerprint chain. Share links generate director-facing decision 
packets with playable audio, side-by-side comparison, and 
approve/pass workflow. Currently in pilot stage with active 
music supervisor conversations.

**Demo available.** If you're a composer with a catalogue to 
score or a supervisor with briefs to test, reach out.

---

## Built by

Mark Amigoni — signed singer-songwriter and solo developer. 
Credits include a song nominated at the International Christian 
Film Festival and a placement in TV show The Uncaged Heart. 
Signed to Rexius Records.

SyncVision is built from direct experience with the sync 
licensing process — designed against how supervisors actually 
clear placements, not how a generic recommender thinks they do. 
Solo-built across the React frontend, Node/TypeScript backend, 
Python DSP worker, Postgres, and Render infrastructure. 
Currently in active pilot conversations with music supervisors 
and sync licensing professionals.

---

## License

Copyright (c) 2026 Mark Amigoni. All rights reserved.

SyncVision — including its scoring engine, narrative dictionary, 
rights pipeline architecture, deterministic phrase selection 
system, clearance complexity scoring model, lyric semantic axis, 
and all associated source code — is proprietary software.

No part of this repository may be reproduced, distributed, 
transmitted, reverse-engineered, or used to build derivative 
works in any form without explicit written permission from 
the author.

Unauthorized commercial use, including but not limited to 
building competing products based on this architecture, is 
strictly prohibited.

For licensing inquiries contact the author directly.


Commit to main. No branches.


That's the complete README — everything from the original preserved and strengthened, all the new architecture accurately reflected, copyright locked in. Send it.
