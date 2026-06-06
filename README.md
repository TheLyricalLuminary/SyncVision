Update README.md with these specific changes only. 
Do not rewrite the whole document. Commit to main. 
No branches.

1. Update WEIGHTS in the scoring section to:
   scene: 0.45, lyrics: 0.25, audioSignal: 0.20, 
   rightsClarity: 0.10

2. Add after the scoring section:

### Clearance Complexity (separate from FitIndex)
Scored 0-100 based on one-stop status, master ownership 
percentage, publisher type (indie vs major label), PRO 
affiliation, and known writer data. Displayed separately 
from the FitIndex — creative fit ranks the tracks, 
clearance complexity informs the placement decision. 
The two are never collapsed into one number.

### Data Confidence
Displayed as a percentage separate from both FitIndex 
and Clearance Complexity. Shows how many of 8 rights 
fields are verified from registry sources.

3. Update lyric data source — replace Musixmatch 
   references with:
   Primary: LRCLib (free, full text, no key required)
   Fallback: Lyrics.ovh (free, full text, no key required)
   Three-state model: FULL / INSTRUMENTAL / UNAVAILABLE
   Neutral states (INSTRUMENTAL/UNAVAILABLE) score 0.50 
   and do not inflate or deflate ranking.

4. Update Status section — replace current text with:
   End-to-end pipeline operational. Four real independently-
   computed scoring axes live in production. Clearance 
   complexity scored and displayed separately from creative 
   fit. Lyric semantic axis live with deterministic 
   keyword-lexicon vocabulary matching against 20 brief 
   lexicons. Rights intake auto-populates from MusicBrainz, 
   Credits.fm, and fingerprint chain. 242-track lyric 
   backfill completed. Share links generate director-facing 
   decision packets with playable audio, side-by-side 
   comparison, and approve/pass workflow. 
   Currently in pilot stage.

5. Update Built by section:
   Mark Amigoni — signed singer-songwriter and solo 
   developer. Credits include a song nominated at the 
   International Christian Film Festival and a placement 
   in TV show The Uncaged Heart. SyncVision is built from 
   direct experience with the sync licensing process — 
   designed against how supervisors actually clear 
   placements. Solo-built across React frontend, 
   Node/TypeScript backend, Python DSP worker, Postgres, 
   and Render infrastructure. Currently in active pilot 
   conversations with music supervisors and sync licensing 
   professionals.

tsc --noEmit zero errors. Commit to main.
