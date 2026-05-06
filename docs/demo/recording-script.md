# Screen Recording Script — Trey Milner / City Gate Demo
## Target length: 3–5 minutes

---

### BEFORE YOU HIT RECORD

- Open browser to localhost:5173 (or deployed URL)
- Have `Endless Sky` WAV ready in the upload dialog
- Terminal open in `apps/backend/` if you want to show the demo CLI at the end
- Font size bumped — at least 18px in browser and terminal

---

### SEGMENT 1 — Upload (0:00–0:45)

**What you do:** Drag `Endless Sky.wav` into the upload zone.

**What you say:**
> "This is the intake. I drag a track in, the system detects the ISRC from the
> file metadata, and it starts processing. While it's analyzing — that's the
> Python DSP worker running librosa on the audio — I fill in the rights chain."

Fill in while it processes:
- Master Owner: Mark William Amigoni
- Ownership Type: Self-Owned
- ASCAP Work ID: 930472120
- One-Stop: checked

> "One-stop means I control both master and publishing. A supervisor can license
> this in a single conversation. No label approval, no co-publisher split sheets."

---

### SEGMENT 2 — Queue and Analysis (0:45–1:30)

**What you do:** Hit "Queue Track." Watch status flip to `analyzed`.

**What you say:**
> "The queue calls the same DSP worker the demo CLI uses. It's extracting
> valence, arousal, and dominance from the audio signal — not from genre tags,
> not from mood keywords I typed in. The PAD values come from the waveform."

Once analyzed:
> "Rights state is now CLEAR. That means ASCAP work ID on file, one-stop
> confirmed, master ownership type documented and timestamped. The state machine
> ran automatically — I didn't click a clearance button."

---

### SEGMENT 3 — Brief Selection (1:30–2:30)

**What you do:** Navigate to scene selection. Choose **Cinematic / Epic**.

**What you say:**
> "Twenty briefs. Each one has a PAD target range — the emotional coordinates
> a supervisor is actually looking for — and a weight profile that reflects
> how much clearance matters for that placement type."

Point at the weights in the response (or explain verbally):
> "Cinematic and Epic is weighted 40% on rights clarity. That's the highest
> of any brief in the system. Trailer supervisors don't audition tracks that
> aren't cleared. So rights clarity is gating, not secondary."

---

### SEGMENT 4 — Ranked Results + Narrative (2:30–3:30)

**What you do:** Show the ranked matches. Expand the top result.

**What you say:**
> "The match score is a dot product — scene fit times its weight, rights clarity
> times its weight, metadata times its weight. You can verify it with a calculator.
> Nothing is a black box."

Point at the narrative:
> "This copy is written for supervisors, not engineers. 'Cinematic scale is
> convincing throughout. The formal composition holds across the track.' That's
> the brief narrative — it's telling you *why* this track ranks here, not just
> that it does."

Point at the hash:
> "This is the verification hash. It covers the feature vector, the rights state,
> the brief weights, and the model version. Same inputs always produce the same
> hash. If a track's score changes, the hash changes — and you know something
> in the system changed."

---

### SEGMENT 5 — Rights Report (optional, 3:30–4:00)

**What you do:** Open a new tab to:
`/api/tracks/[id]/rights-report`

**What you say:**
> "One API call produces the full rights chain — every field, the state machine
> verdict, the ASCAP work ID, the ownership type and timestamp. This is what
> goes on the one-page clearance document I send with the pitch."

---

### SEGMENT 6 — Demo CLI (optional, 4:00–4:30)

**What you do:** Switch to terminal. Run:
```
npm run demo -- audio/cb70bcb8_WhereWeBelong.wav
```

**What you say:**
> "This is the demo path — direct worker call, no queue, no database.
> Four seconds. That's the analysis time. Brief match, score, narrative,
> hash. This is what I'd run in a pitch meeting on a track I'm considering
> licensing to you."

---

### CLOSE

> "Phases one through ten are done. The system works end to end.
> What I want to talk about is what you're working on — and whether
> there are placements where cleared, emotionally-targeted music
> would move the conversation forward."

---

## THINGS TO NOT SAY

- Don't say "AI" unless asked. Say "DSP analysis" or "audio signal processing."
- Don't say "algorithm." Say "scoring function" or "weighted match."
- Don't over-explain the PAD model. If they ask, explain it as
  "the three axes a film music supervisor actually uses to describe
  what they want — emotional direction, energy level, and assertiveness."
- Don't apologize for anything being unfinished. Phases 1–10 are production.
