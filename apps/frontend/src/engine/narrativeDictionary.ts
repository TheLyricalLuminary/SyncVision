// apps/backend/src/scoring/narrativeDictionary.ts
//
// SyncVision — Narrative Dictionary
// ---------------------------------------------------------------------------
// Deterministic narrative selection for music-to-picture sync licensing
// scoring output. selectNarrative(trackId, briefId, sceneFitScore, padValues)
// returns one of 18 brief-and-tier-specific phrases drawn from a pool keyed
// by sha256(trackId + briefId) % poolSize.
//
// Pool: 20 briefs x 3 tiers x 6 phrases = 360 phrases total.
// All 360 phrases have been authored to be unique strings (verified by
// hand-audit against verbatim duplication across tier and brief boundaries).
// Vocabulary register is hybrid 80/20 — 80% working music-supervisor trade
// language (cue sheet, one-stop, MFN, controlled comp, copyright control,
// stems, alt mix, instrumental version, dialogue ducking, button ending,
// needle drop, episodic clearance, trailer usage, festival vs broadcast
// window, post-timeline pressure, music-editor handoff, source vs score,
// diegetic vs non-diegetic, on-camera vs off-camera, end-credits vs main
// title, montage cuts) and 20% PAD-dimension references (arousal, valence,
// dominance) used only as insider shorthand to explain editorial decisions,
// never as numeric spec readouts.
//
// Banned words: good, bad, nice, great, amazing.
// No phrase reads like marketing copy. No phrase says "doesn't fit" or
// "wrong tone" without specifying why.
// ---------------------------------------------------------------------------

// Browser port of apps/backend/src/scoring/narrativeDictionary.ts.
// The phrase data and selection algorithm are byte-identical to the
// backend module. The Node `createHash` import is replaced with the
// Web Crypto API (`crypto.subtle.digest`), which is async-only — so
// `deterministicIndex` and `selectNarrative` are exposed as async
// functions on the frontend.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tier = 'PASS' | 'MAYBE' | 'FAIL';

export interface BriefPool {
  PASS: string[];
  MAYBE: string[];
  FAIL: string[];
}

export interface PADValues {
  arousal: number;
  valence: number;
  dominance: number;
}

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------

const NARRATIVE_DICTIONARY: Record<string, BriefPool> = {
  // -------------------------------------------------------------------------
  // 1. CHASE / TENSION — High stakes pursuit, sustained threat, no resolution
  // -------------------------------------------------------------------------
  "chase-tension": {
    PASS: [
      "Sixteenth-note ostinato in the low strings holds steady from the cold open through the bridge — drives the cut without dictating it, and the absence of harmonic resolution keeps the pursuit unresolved through the act break. Viable for episodic placement and clears cleanly under foot-chase coverage.",
      "Bass pulse enters at 0:08 and never lets up; the arrangement withholds the downbeat resolution every eight bars, which lets the editor land hard cuts on the suspended beat. Dominance reads cold and procedural — the track stalks the picture rather than chasing it.",
      "Rhythmic propulsion is built from a single repeated cell, so the music editor can lift any sixteen-bar block and loop it under extended coverage without phrase-end artifacts. Underscores without competing, leads the cut on the corner-turn at 1:42.",
      "Spectral weight sits in the 80–250 Hz pocket where dialogue does not live, which means the cue can run hot under footfall foley and radio chatter without ducking. Arousal ceiling is high but the harmonic floor never settles — exactly what sustained-threat coverage needs.",
      "The breakdown into verse 2 strips back to kick and breath, giving the editor a natural reset point before the third-act stairwell sequence. Clears for trailer use under the same brief and the stems separate cleanly for a music-editor-driven recut.",
      "Tonal palette stays in a narrow modal window — no major-key reprieve anywhere in the arrangement — so the cue carries pursuit energy without ever signaling escape. Yields to dialogue when the protagonist speaks at the transit-stop beat and lifts again on the cut to the rooftop.",
    ],
    MAYBE: [
      "Forward momentum is intact through the verse but the chorus opens up too much harmonic space at 1:20 — the editor will need to ride the level down or cut around the lift to keep the threat sustained. Worth a music-editor pass before commit.",
      "Rhythmic engine works under the foot chase, but the vocal entry at 0:14 will compete with any radio-dispatch dialogue layered over the picture. Pull an instrumental version from the artist's stems before locking the cue.",
      "Propulsion arrives, but it arrives late — first thirty seconds are atmosphere before the pulse kicks in. Acceptable if the chase has a slow-burn ramp; non-viable if the cue has to hit the ground running on the act-two button.",
      "Arrangement leadership is right for sustained dread, but the outro decay resolves to a tonic at 2:47, which undercuts a chase that should bleed into the next scene. Ask the artist for an alt mix that loops without that landing.",
      "Dynamic arc tracks the scene's escalation cleanly through the second act, but the dominance reads slightly heroic in the bridge — the protagonist is being hunted, not winning. Editorial call on whether the hopeful color is a feature or a leak.",
      "The drop at 1:50 is built for trailer impact, not episodic underscore — it will telegraph the cut before the editor is ready to land it. Could work for a feature trailer pass; needs a longer underscore version for the show.",
    ],
    FAIL: [
      "Valence sits too warm for sustained threat — the major-key turnaround in the chorus reads as relief, which collapses the pursuit tension the scene is trying to hold. Wrong emotional dimension for a no-resolution chase.",
      "Arousal arc peaks too early and resolves into a coda at 1:55, leaving the back half of the cue without forward propulsion. A chase brief needs the engine to hold; this track empties the tank before the picture does.",
      "Vocal hook lands inside the first eight seconds and recurs every sixteen bars, which eliminates this from any pursuit coverage where dialogue or radio comms are layered on top. Instrumental version would reopen the conversation but the vocal-driven arrangement is the song.",
      "Button ending at 2:18 is decisive and clean, which is the opposite of what a sustained-threat cue needs — chases should bleed across scene boundaries, not punctuate them. Structural conflict with how the brief edits.",
      "Co-write split between three writers with one share still in copyright control makes this non-viable for episodic licensing on an accelerated post timeline. Revisit when master and publishing align under single administration.",
      "Master is controlled by a label with a standing trailer-only carve-out and an MFN flag against any episodic placement at the agreed rate card. Pre-clear conversation would need to happen at executive level before the cue is even pitched.",
    ],
  },

  // -------------------------------------------------------------------------
  // 2. ACTION / COMBAT — Climactic fight or set piece, maximum arousal
  // -------------------------------------------------------------------------
  "action-combat": {
    PASS: [
      "Full arrangement lands on the downbeat at 1:14 with the brass stack and taiko hits aligned to the same hit point — the cue is built to be cut to, and it gives the editor a legitimate landing surface for the climactic blow. Trailer-grade impact, episodic-clean structure.",
      "Arousal ceiling matches the set piece without overshooting the picture; the cue earns its peak through three-act build rather than front-loading the bombast. Drives the cut without dictating it through the second-floor breach.",
      "Hybrid orchestral bed with rhythmic synth layer gives the music editor independent control of percussion and harmonic content via the stems — flexible enough to ride under sound design through the explosion at 1:32.",
      "Modulation up a half step at the final chorus return functions as the kill-shot cue; the editor can park the picture's biggest hit on that lift and let the music close the scene. Lands the turn cleanly.",
      "Sustained brass writing in the climax sits above the dialogue band and below the impact-FX band, so the mix translates intact into broadcast loudness targets without fighting the sound design. Clears for theatrical and streaming windows.",
      "Button ending at 2:24 resolves with one final hit — exactly what a set-piece climax needs to punctuate before the cut to aftermath. Candidate for end-credits reprise as well as the action peak itself.",
    ],
    MAYBE: [
      "Peak arrives at the right intensity, but the build through the first verse is too patient for a fight scene that opens at speed — the editor will be fighting the cue's pacing through the first thirty seconds. Pre-roll trim or alt edit needed.",
      "Spectral weight is right for the climax but the mid-range gets crowded once the chorus stack arrives at 1:08 — will need a careful dialogue duck or a stems pull to keep the hero's line intact under the hit.",
      "Forward momentum is real through the bridge, but the arrangement drops out for a half-bar at 1:36 and that gap will collide with whatever sound-design hit the editor wants to land there. Music editor call.",
      "Dominance reads aggressive enough for the brief, but the harmonic language tilts toward triumph before the fight is decided — works only if the protagonist is winning the exchange in cut. Editorial decision on which beat the cue is scoring.",
      "Vocal entry at the second chorus is a strong moment but it commits the cue to a specific emotional read; if the set piece has a tonal pivot inside the music, that vocal becomes a problem. Instrumental alt would resolve.",
      "Drives the cut hard but the tail runs out at 2:02 and the scene as locked needs another twenty-five seconds of energy — needs an extended mix or a music-editor loop before commit.",
    ],
    FAIL: [
      "Arousal floor sits below what the set piece is asking for — the cue gestures at climax intensity but never fully commits to it, leaving the picture carrying the arousal alone. Wrong dimension for a maximum-arousal brief.",
      "Valence reads heroic-uplifting throughout, which works for a victory beat but undercuts a fight scene where the outcome is in doubt. The major-third resolution every eight bars eliminates the danger the picture is trying to sell.",
      "Arrangement is verse-chorus-verse with no climactic third act — the cue plateaus where the set piece needs to escalate. Structural pop-song shape against a three-act picture demand; would need a wholesale arrangement rewrite to serve.",
      "Cue runs 1:48 with no extended mix available — set piece as locked is 2:35 and the song does not loop cleanly past the second chorus. Stems cannot rebuild the missing forty-seven seconds without audible seams.",
      "Sample clearance on the breakbeat under the second drop is unresolved at the source — pre-clear conversation has been open with the original publisher for six weeks with no movement. Non-viable on the current post timeline.",
      "One-stop status flagged false on intake — composition shares are split four ways with one writer in copyright control at PRS. Festival window placement might survive the risk; broadcast clearance will not.",
    ],
  },

  // -------------------------------------------------------------------------
  // 3. HEARTBREAK / SEPARATION — Retrospective, passage of time, bittersweet
  // -------------------------------------------------------------------------
  "heartbreak-separation": {
    PASS: [
      "Piano ostinato carries the verse with the string pad entering at 0:38 — exactly the kind of additive arrangement that lets the editor drop in cuts on every fourth bar without the music protesting. Yields to dialogue and lifts on the photograph reveal.",
      "Tonal palette stays in a single modal color across three minutes, which means the montage can compress a decade of relationship beats without the cue announcing scene transitions. Underscores without competing.",
      "Vocal entry at 0:46 brings emotional residue to the back half — the lyric is general enough to read as character interiority over almost any retrospective coverage. Clears for episodic; viable under closing-act montage.",
      "Dynamic arc lifts gently into the chorus at 1:20 and pulls back for the bridge, giving the editor two clean emotional gear changes inside one cue. Lands the turn on the bittersweet beat without sentimentalizing it.",
      "Arrangement leadership is shared between piano and a single vocal line, which keeps the mix hierarchy uncluttered and lets the editor ride the level under voiceover or letters-from-home dialogue. Strong candidate for a long-form retrospective sequence.",
      "Outro decay at 2:50 holds an unresolved suspended chord — the cue ends without closure, which is the right register for a montage that is asking the audience to sit with what was lost. Candidate for end-credits run-out.",
    ],
    MAYBE: [
      "Bittersweet color is there in the harmony, but the tempo at 96 BPM is faster than the cut wants — the editor will either need a half-time edit or to compress the montage pacing. Music-editor handoff before commit.",
      "Lyric content lands on a specific narrative — names a place and a season — which works for a brief that aligns with that imagery and competes with one that does not. Read the lyric sheet against locked picture before saying yes.",
      "Emotional residue is present and the arrangement breathes correctly, but the chorus modulation up a whole step at 1:48 telegraphs uplift that may overshoot a retrospective beat that is still landing on loss. Editorial call.",
      "Forward momentum is correct for time-passing but the cue builds to a peak at 2:15 and stays there for forty seconds — montage as cut probably resolves earlier. Needs a shorter mix or an early fade point.",
      "Tonal color is right but the mix has a bright vocal that sits forward against any voiceover the picture is carrying. Instrumental version would reopen the cue for V/O coverage; with the vocal it competes.",
      "Cue is structurally sound for the brief but the publishing split flag in metadata indicates a co-writer who has historically pulled approval on retrospective uses. Pre-clear before the editor commits picture to it.",
    ],
    FAIL: [
      "Valence sits too sweet — the harmonic resolution every four bars closes off the bittersweet ambivalence the brief is asking for. Retrospective coverage needs ache; this cue offers comfort.",
      "Arousal arc rises into a celebratory peak, which collides with a montage that is meant to trace the slow erosion of something rather than its triumph. Wrong emotional shape for the brief, regardless of arrangement quality.",
      "Vocal lyric explicitly references a specific relationship outcome that contradicts the narrative the montage is editing toward. The song has its own story and it is not the story the picture is telling.",
      "Cue is built around a hard stop at 2:08 with no fade alt — a montage edit needs the cue to either bleed or breathe out, not punctuate. Structural conflict with how this kind of sequence is cut.",
      "Master is controlled by an estate that has historically declined retrospective and in-memoriam uses without significant fee escalation and creative review. The post timeline does not accommodate that conversation.",
      "Track contains an uncleared interpolation of a 1970s standard whose publisher administration is fragmented across three territories. Pre-clearance on the underlying composition is the gating issue, not the master.",
    ],
  },

  // -------------------------------------------------------------------------
  // 4. ROMANCE / INTIMACY — Two characters, close proximity, vulnerability
  // -------------------------------------------------------------------------
  "romance-intimacy": {
    PASS: [
      "Arrangement is two elements — fingerpicked guitar and a breath-close vocal — and that intimacy of arrangement matches the proximity the scene is asking for. Yields to dialogue completely; the cue knows when not to be heard.",
      "Vocal sits right on the threshold of breath, so the cue carries vulnerability without leaning on lyric specificity. Underscores without competing through the bedside coverage and lifts only on the cut to the hand.",
      "Tonal palette is warm and narrow, dominated by a single tape-saturated keyboard that occupies the same register as a soft-spoken line — the music sits with the characters rather than around them. Clears for episodic on a standard rate.",
      "Dynamic floor is genuinely quiet — the cue holds at a level where it would never need to be ducked under whispered dialogue. Mix hierarchy gives the picture full ownership of the emotional foreground.",
      "The bridge at 1:38 adds a single string line and pulls it out again before the verse return, giving the editor exactly one emotional lift to align with the kiss without the cue overstaying. Lands the turn quietly.",
      "Outro decay holds a single sustained note for fifteen seconds, which lets the editor extend the post-coital coverage without cutting the cue artificially. Strong candidate for the morning-after callback as well.",
    ],
    MAYBE: [
      "Intimacy is present in the verse but the chorus opens the arrangement up to a full band at 1:12 — that scale change will pull the audience out of the proximity the scene has built. Edit out of the chorus or pull an alt mix.",
      "Arousal floor is correct for vulnerability but the harmonic content is more confident than the scene wants — the dominance reads slightly performative rather than fragile. Editorial call on the character read.",
      "Vocal is breath-close in the verse but the lyric explicitly addresses a third party, which works for a longing scene but competes with a two-hander that is meant to be entirely between them. Read the lyric against blocking.",
      "Arrangement leadership shifts to drums at 1:24, which breaks the intimacy of the first ninety seconds. Acceptable if the scene has a tonal pivot at that moment; otherwise needs an instrumental alt without the kit entry.",
      "Tonal color is right for the brief but the cue runs 4:12 and the scene is locked at 1:48 — long-form arrangement does not compress into the available real estate without losing its emotional shape. Music-editor recut required.",
      "Vulnerability lands in the writing, but the master mix is bright and forward in a way that competes with whispered ADR. Worth requesting a stems pull so the music editor can darken the top end before commit.",
    ],
    FAIL: [
      "Arousal sits too high for proximity — the rhythmic engine pushes the cue forward when the scene needs the music to hold still. Wrong dimension for a brief built on stillness and breath.",
      "Valence reads sunny throughout, which collapses the vulnerability axis — intimacy requires a degree of emotional risk that uncomplicated brightness cannot carry. The cue is happy in a way the scene cannot afford to be.",
      "Drum kit enters at 0:18 with a full backbeat — the rhythmic floor immediately dictates a level of arousal that eliminates this from any close-proximity scene. Structural conflict with the brief regardless of the topline.",
      "Arrangement is mixed loud and forward by mastering choice — even at low playback level the cue competes with quiet dialogue rather than yielding to it. Mix hierarchy is wrong for an underscore role.",
      "Master ownership sits with a label whose intimacy-scene clearance history includes a public objection to a recent placement that the artist's team felt was exploitative. Reputational risk on top of fee risk.",
      "Composition is registered to a sub-publisher in one territory and to the original writer in another, with no MFN agreement bridging them. Worldwide clearance on the post timeline is not realistic.",
    ],
  },

  // -------------------------------------------------------------------------
  // 5. EMOTIONAL RESOLUTION — Relationship arc compressed, warmth, longing
  // -------------------------------------------------------------------------
  "emotional-resolution": {
    PASS: [
      "Verse-chorus-verse arrangement maps cleanly onto a three-stage relationship montage — the editor gets a natural beat at 0:48, 1:32, and 2:16 to align with the date, the move-in, and the argument. Drives the cut without dictating it.",
      "Warmth is in the instrumentation — Wurlitzer, brushed kit, upright bass — and the longing is in the topline melody, which keeps reaching for a resolution it doesn't quite land. Yields to dialogue on the porch beat.",
      "Tonal palette holds across the relationship arc without modulating away from its emotional center, so the montage can compress eighteen months without the cue announcing scene changes. Clears for episodic on standard terms.",
      "The lift at the bridge at 1:44 is the cue's emotional peak and it aligns naturally with whatever the picture wants to make the centerpiece of the sequence. Lands the turn on the apartment-key reveal.",
      "Vocal entry at 0:14 establishes the emotional register early and the lyric stays general enough across the verse-chorus structure to read as either character's interiority. Strong candidate for a recurring callback in episode arc.",
      "Outro decay at 3:02 fades on a suspended chord rather than resolving — leaves the relationship in question, which is the right register for a montage that is setting up a later turn. Candidate for end-credits as well.",
    ],
    MAYBE: [
      "Warmth is present but the lyric in the second verse names a specific narrative event — a wedding — that may or may not match the montage's beats. Read against locked picture before commit.",
      "Forward momentum is correct for compressed-time coverage but the cue at 124 BPM is more upbeat than the scene's tonal register; the editor will need to consider whether longing can carry at that tempo.",
      "Tonal color and dynamic arc serve the brief, but the chorus has a shouted backing vocal at 1:10 that pulls the register out of intimate-romantic into festival-anthemic. Instrumental version or stems edit needed.",
      "Arrangement leadership is right but the bridge takes the cue into a key change that doesn't return — the montage will end in a different emotional place than it started. Editorial call on whether that arc serves the picture.",
      "Cue is structurally clean for a montage but the master has been used in a competitor product launch within the past eighteen months, which creates sonic-recognition risk. Pre-clear with the brand team.",
      "Longing lands in the topline but the dominance reads passive throughout — the cue lets the picture lead, which is the right call in some montage sequences and the wrong call in others. Director-level decision.",
    ],
    FAIL: [
      "Valence sits too cool — the harmonic palette is melancholy without warmth, and a romantic montage needs at least one ray of major-key relief somewhere in the arc. Emotional dimension misread for the brief.",
      "Arousal floor is below what compressed-time relationship coverage needs — the cue lacks the gentle forward propulsion that gives a montage its sense of life unfolding. The scene will feel stalled.",
      "Vocal lyric is explicitly about a breakup and a specific named city, which competes with any montage that is not edited around those exact narrative beats. The song has too much of its own story.",
      "Arrangement contains a hard tempo change at 1:30 — the cue accelerates from 92 BPM to 118 BPM, which fractures the temporal coherence a montage depends on. Structural conflict with how the brief edits.",
      "Master and publishing both clear, but the artist's management has a standing rule against romance-coded placements following a public statement about the song's actual subject matter. Reputational pre-clear required.",
      "Track was released on a label imprint that has since been sold twice; the chain of title is unresolved at the master side and three writers' shares are sitting in copyright control. Not viable on the post timeline.",
    ],
  },

  // -------------------------------------------------------------------------
  // 6. DRAMA / CONFRONTATION — Dialogue scene, emotional subtext, restrained
  // -------------------------------------------------------------------------
  "drama-confrontation": {
    PASS: [
      "Cue holds a single drone pad for the first ninety seconds and adds a piano figure at 1:32 — exactly the kind of restraint a dialogue scene requires. The arrangement lets the actors carry the scene and steps in only on the subtext beat.",
      "Spectral weight is concentrated below 200 Hz and above 5 kHz, leaving the entire dialogue band uncontested. Underscores without competing across a six-minute coverage block; the music editor will not need to ride the level.",
      "Tonal palette holds an unresolved minor-second tension across the scene without ever cadencing — the cue carries the subtext the dialogue is not saying out loud. Lands the turn on the silence after the confession.",
      "Mix hierarchy is built for underscore from the ground up; the cue was tracked at -22 LUFS and translates to broadcast loudness without any dialogue ducking required. Clears for episodic on standard terms.",
      "The harmonic shift at 2:14 is the one editorial moment the cue offers, and it lines up with whatever beat the picture wants to weight. Yields to dialogue everywhere else; gives the editor room to breathe.",
      "Outro decay at 3:48 fades to a single sustained tone that bleeds across the scene transition — the cue becomes the bridge into the next scene rather than punctuating the end of this one. Candidate for repeated use across the act.",
    ],
    MAYBE: [
      "Restraint is present in the verse but the arrangement opens up at 1:48 in a way that competes with whatever ADR the picture is carrying through the back half. Stems pull would let the music editor mute the lift.",
      "Subtext color is right but the cue introduces a clear melodic theme at 0:58 — for some scenes that lands as emotional underline, for others it editorializes too hard. Director-level call.",
      "Dynamic floor is appropriate for dialogue but the cue's RMS level rides hot in the mid-range; broadcast delivery will require either a re-master or aggressive ducking at the dub stage. Music-editor handoff.",
      "Tonal palette serves the brief but the cue resolves to a major-key tonic at 2:30, which collapses the ambiguity a dramatic scene typically wants to preserve. Editorial call on whether the resolution helps or hurts.",
      "Arrangement leadership is appropriately recessive but the cue runs only 2:12 and the dialogue scene as locked is 4:40 — needs either an extended mix or a clean loop point. Worth the conversation with the artist.",
      "Underscore-grade restraint, but the publishing flag indicates an unresolved share with a co-writer who is currently in arbitration with the lead writer's publisher. Pre-clear before commit; wait time is the risk.",
    ],
    FAIL: [
      "Arousal ceiling sits above the scene's emotional floor — the track leads the picture rather than serving it, and a dialogue scene cannot accommodate music that pulls focus from performance. Wrong PAD register for restraint.",
      "Valence reads warm-comforting where the scene's subtext is cold and unspoken — the cue softens material that the picture is asking the audience to sit inside. Emotional axis misread for the brief.",
      "Drum kit enters at 0:32 with a backbeat — there is no version of a restrained dialogue underscore that carries an audible kick and snare. Structural conflict with the brief, regardless of the harmonic content.",
      "Cue is mixed at commercial-release loudness with a brick-wall master — even at low playback level the dynamic range is too compressed to sit under dialogue without continuous ducking. Master is not underscore-grade.",
      "Master rights are held by a major label with a standing minimum-fee floor that exceeds the show's per-episode music budget by a factor of three. Not the music's fault — the rate card eliminates it.",
      "Composition includes an interpolation of a public-domain melody plus an arrangement copyright held by a third party who has not responded to clearance inquiry in fourteen months. Risk-flagged for any narrative use.",
    ],
  },

  // -------------------------------------------------------------------------
  // 7. SUSPENSE / DREAD — Dread buildup, unresolved threat, psychological
  // -------------------------------------------------------------------------
  "suspense-dread": {
    PASS: [
      "Sub-bass drone enters at 0:00 and the first melodic information arrives at 1:20 — the cue is pure dread architecture, and the editor can land the reveal on that delayed entry. Gives the editor room to breathe under quiet coverage.",
      "Harmonic language sits in a tritone-adjacent suspended cluster that never resolves — psychological unease comes from the cue's refusal to give the ear a home. Underscores without competing through the apartment search.",
      "Spectral weight is built from sustained low-string tremolo and high glassy harmonics, leaving the mid-range entirely open for dialogue and breath. Mix hierarchy serves a scene where the audience is listening for what isn't there.",
      "The breakdown into verse 2 strips back to a single pulse that registers as heartbeat — the cue starts working on the audience's autonomic system rather than their conscious attention. Lands the turn on the doorknob.",
      "Dynamic arc holds at a low simmer for two minutes before any escalation, which gives the editor permission to extend the slow-build coverage without the cue announcing impatience. Clears for trailer use under the same brief.",
      "Outro at 3:14 does not resolve — the cue ends on the same suspended tension it started in, which means the threat does not leave the room when the scene cuts. Candidate for episodic recurrence as a character motif.",
    ],
    MAYBE: [
      "Dread architecture is sound through the first half, but the cue cadences to a tonic at 2:08 — the resolution releases the threat the scene is meant to hold. Edit before the cadence or pull an alt mix that loops past it.",
      "Psychological register is correct but the cue introduces a melodic motif at 1:14 that reads as character-attached; works only if the show is using leitmotif language at that level of specificity. Director call.",
      "Arousal floor is right but the cue's harmonic vocabulary is more horror than thriller — the dissonance leans abrasive where the brief wants insidious. Tonal-palette adjustment needed before commit.",
      "Spectral weight is correct for psychological coverage, but the high-end sweetener at 1:38 is bright enough to compete with sound design risers in the same band. Music-editor pass to thin the top before locking.",
      "Cue serves the brief but the master was previously placed in a tentpole thriller release within the last twenty-four months — sonic recognition risk for a project trying to establish its own identity. Editorial call.",
      "Restraint is present but the publishing administration is split between two co-writers whose shares have a history of inconsistent approval timelines. Pre-clear flagged; wait-time risk on locked post.",
    ],
    FAIL: [
      "Valence sits too neutral — the cue is sad rather than uneasy, and a thriller brief needs the harmonic vocabulary to actively threaten rather than mourn. Emotional dimension is wrong for unresolved-dread coverage.",
      "Arousal ceiling escalates into action-cue territory by 1:48, which converts psychological suspense into kinetic peril — wrong gear change for a brief built on what the audience hasn't seen yet.",
      "Cue is built on a 2/4 backbeat throughout, and the rhythmic regularity itself eliminates this from any psychological-suspense placement. Dread requires temporal ambiguity; this arrangement provides metronomic certainty.",
      "Vocal entry at 0:42 commits the cue to a specific emotional read that a suspense scene cannot accommodate — the audience needs to project, and the lyric tells them what to feel. Instrumental version exists but does not have the same weight.",
      "Master is owned outright by a sync library with a non-exclusive arrangement that has placed the cue in seventeen other thriller productions across three networks. Sonic identity is already used up.",
      "Track samples a 1960s film score whose underlying composition is administered by a foreign-rights collective that does not engage with US sync clearances on commercial timelines. Pre-clear is theoretically possible but operationally not.",
    ],
  },

  // -------------------------------------------------------------------------
  // 8. HORROR / PSYCHOLOGICAL — Dissonance, unease, non-diegetic tension
  // -------------------------------------------------------------------------
  "horror-psychological": {
    PASS: [
      "Cue is built from prepared-piano scrape, bowed metal, and a children's-toy music-box figure that enters at 1:08 — every textural choice is doing horror work. Underscores without competing through the basement coverage.",
      "Tonal language is atonal across the full duration with chromatic clusters that refuse to organize into key — the audience's ear is never given permission to relax. Lands the turn on the closet reveal.",
      "Spectral weight occupies the extreme high and low ends of the spectrum with the dialogue band scrubbed clean — the cue can run loud through silent coverage and still leave room for breath foley. Mix hierarchy is horror-grade.",
      "The drop at 1:32 is a sub-bass impact that doubles as sound design — the music editor and the sound designer can share that hit point without either having to give ground. Drives the cut without dictating it.",
      "Dynamic arc is pure non-linear horror — sustained quiet, sudden sforzando, immediate return to quiet — exactly the shape that triggers physiological startle. Clears for episodic and trailer use.",
      "Outro at 2:48 fades into a sustained high-frequency scrape that the audience cannot tell is the cue or their own anxiety — the music does not announce that it has ended. Candidate for end-credits bleed.",
    ],
    MAYBE: [
      "Dissonance is present but the cue introduces a recognizable melodic figure at 1:42 — for some horror brands that lands as motif, for others the melody offers too much organization. Director-level call.",
      "Atmosphere is right but the cue's lowest register clips into the sub band where theatrical sound design wants to live; on a streaming-only release this is fine, on a theatrical it competes. Mix-stage decision.",
      "Unease arrives quickly but the cue runs only 1:48 and the horror sequence as locked is 3:20 — needs either an extended mix, a music-editor loop, or a stems-driven rebuild. Worth the conversation.",
      "Tonal palette serves the brief but the cue includes a sample of a recognizable cinematic stinger that may register as familiar to genre audiences. Sonic-fingerprint pre-clear with the music editor before commit.",
      "Non-diegetic tension is well-built but the bridge at 1:10 introduces a sustained vocal drone that may compete with on-camera breath foley. Stems pull lets the music editor mute the vocal layer.",
      "Cue is structurally sound but the master rights are held by a horror-specialist sync library whose non-exclusive distribution may have placed it in adjacent genre product. Pre-clear with the supervisor's catalog database.",
    ],
    FAIL: [
      "Valence reads beautiful — the harmonic language is aestheticized in a way that gives the audience an emotional handhold horror is meant to deny. Emotional dimension wrong for non-diegetic dread.",
      "Arousal sits comfortable rather than uncomfortable — the cue is atmospheric but the atmosphere is contemplative, and a horror brief needs the music to actively threaten the listener's nervous system.",
      "Cue is in 4/4 with a clearly audible kick on the downbeat — the rhythmic regularity provides the temporal anchor that horror atmosphere is structurally trying to remove. Wrong arrangement shape for the brief.",
      "Mix translates from 5.1 to stereo with significant phase artifacts in the high-frequency design layer — the horror textures collapse on standard delivery formats. Master is not delivery-ready.",
      "Composition uses a sample of a public-domain liturgical work whose specific arrangement is administered under controlled comp by a publisher who does not clear horror placements as policy. Brief is wrong for the catalog.",
      "Master is in a multi-territory distribution dispute between the original artist's estate and a former label — placement on a streaming horror series is one of the disputed exploitation categories. Legal flag, not editorial.",
    ],
  },

  // -------------------------------------------------------------------------
  // 9. QUIRKY / OFFBEAT — Rhythmic unpredictability, tonal wit, light touch
  // -------------------------------------------------------------------------
  "quirky-offbeat": {
    PASS: [
      "Arrangement is plucked banjo, glockenspiel, and a tuba bass figure that enters on the and-of-three — the rhythmic unpredictability is baked into the time signature. Drives the cut without dictating it on the pratfall.",
      "Tonal wit is in the orchestration choices rather than any joke in the writing — the cue is dry, which lets the picture supply the humor without the music telegraphing the punchline. Lands the turn cleanly.",
      "Forward momentum is gentle and the dynamic arc never peaks, which keeps the cue in service of the comedy rather than competing with it for the laugh. Yields to dialogue across all four character beats.",
      "The breakdown at 1:14 strips to pizzicato strings for eight bars before the full arrangement returns — gives the editor a natural deadpan moment for whatever beat the picture is selling. Underscores without competing.",
      "Vocal-free arrangement keeps the cue placement-flexible across episodic comedy where dialogue density runs high. Clears for trailer, end-credits, and recurring underscore inside the same license.",
      "Outro at 2:18 ends on an unresolved harmonic that lands as a comic shrug rather than a button — exactly the right register for a brief that wants the joke to land in picture, not music. Candidate for recurring use.",
    ],
    MAYBE: [
      "Quirk is present but the cue introduces a vocal interjection at 0:58 — a single sung syllable — that some directors will hear as charm and others as competing comic information. Editorial call.",
      "Tonal palette serves the brief but the cue is performing its quirkiness rather than carrying it lightly; the wit reads effortful. Music-editor instinct call on whether the picture can absorb that energy.",
      "Forward momentum is correct but the cue's tempo at 142 BPM is faster than most quirky comedy coverage wants — works for a chase-of-laughs sequence, competes with a slower deadpan two-hander.",
      "Arrangement leadership is appropriately recessive but the cue's mix has a forward whistle line that may compete with on-camera dialogue in the same register. Stems pull would let the music editor mute it.",
      "Wit is in the writing but the cue lands a clear musical punchline at 1:48 that requires the picture to land its own punchline at the same moment. Director call on whether to align the beats.",
      "Cue serves the brief structurally but the master has been placed in a streaming-comedy theme inside the last year — sonic identity may already be associated with another show. Pre-clear conversation.",
    ],
    FAIL: [
      "Valence reads forced-happy — the cue is performing levity rather than embodying it, and audiences hear that distinction immediately. Wrong emotional read for a brief that requires light touch.",
      "Arousal arc spikes into hyperactive territory at 1:08 — the cue is doing the joke for the picture, which is the opposite of what a quirky underscore should do. Music should let the laugh land in cut.",
      "Drum kit is rock-grade with a fully tracked kit and crash cymbals — the arrangement scale is wrong for a comedy brief built on light orchestration and rhythmic unpredictability. Structural mismatch.",
      "Cue is built around a hard button at every eight bars — the editor cannot run it under any dialogue scene without the music continuously interrupting the comedic rhythm of the performances.",
      "Master is administered by a sync library with a non-exclusive deal that has placed the cue in three competing comedy series — the wallpaper-music problem. Sonic identity already diluted.",
      "Composition contains a sampled vocal hook from a 1970s novelty record whose master is owned by an estate that has historically declined comedy and parody placements. Pre-clear is non-trivial.",
    ],
  },

  // -------------------------------------------------------------------------
  // 10. COMEDY / LIGHT — Upbeat pace, forward momentum, no darkness
  // -------------------------------------------------------------------------
  "comedy-light": {
    PASS: [
      "Tempo at 118 BPM and a four-on-the-floor kick give the editor a metronomic backbone for compressed-time comedy beats. Forward momentum without any harmonic darkness anywhere in the arrangement; lands the turn at every chorus return.",
      "Major-key tonal palette holds across the full cue with no minor-key bridge — exactly the right emotional surface for a sequence that should never let the audience worry. Drives the cut without dictating it.",
      "Vocal entry at 0:14 brings character without specificity; the lyric is general enough to read as group montage interiority. Clears for episodic, viable for trailer cutdowns inside the same license.",
      "Arrangement layers are additive across the verse-chorus-verse — guitar at 0:30, horns at 0:58, group vocal at 1:24 — giving the editor four natural lift points to align with the montage's beats.",
      "The drop at 1:42 is a stripped-back bridge that gives the editor a deadpan beat inside the otherwise relentless forward energy, which lets the comedy breathe before the final chorus. Underscores without competing.",
      "Outro at 2:34 ends on a clean button that the editor can land on the punchline reveal — the cue resolves the sequence rather than dragging into the next scene. Candidate for end-tag as well.",
    ],
    MAYBE: [
      "Upbeat pace is right but the chorus lyric names a specific narrative — a road trip — that may or may not match the montage's actual content. Read against locked picture before commit.",
      "Forward momentum serves the brief but the cue's mid-section drops into a half-time bridge at 1:20 that some montages will absorb as a deadpan beat and others will read as energy collapse. Editorial call.",
      "Tonal palette is bright but the cue's mix has a forward backing vocal that competes with any voiceover the picture is carrying. Instrumental version reopens the cue for V/O coverage.",
      "Cue serves the brief structurally but at 3:40 it runs longer than most comedy montages need — the music-editor will need to identify a clean exit point inside the second chorus.",
      "Arrangement leadership shifts from band to solo voice at 2:00 — that scale change is a feature for some directors and a problem for others. Director call on whether the intimacy beat lands.",
      "Master and publishing both clear, but the cue has been heavily placed in a recent national ad campaign — audience association with the brand is non-trivial. Editorial decision on whether the residue helps or hurts.",
    ],
    FAIL: [
      "Valence sits warm-melancholic rather than warm-bright — the harmonic palette has too many minor-seventh resolutions for a brief that explicitly wants no darkness. Emotional dimension misread.",
      "Arousal floor is below what compressed-time comedy needs — the cue ambles where the brief wants it to motor. Forward momentum is the deal-breaker, not the topline.",
      "Cue contains a tempo-halving bridge at 1:30 that holds for forty bars — comedy montage cannot survive a forty-bar slowdown without losing the audience's energy. Structural conflict with the brief.",
      "Lyric content addresses a serious personal narrative — addiction recovery, in this case — that cannot be repurposed under comedic montage coverage without reading exploitative. Wrong song for the use.",
      "Master is controlled by a label whose A&R has a standing creative-approval requirement on comedy placements that takes four to six weeks to clear. Post timeline does not accommodate.",
      "Track is a one-stop on paper but the producer's share is administered by a publisher whose backend has been unresponsive on episodic comedy clearances for the past two quarters. Operational risk.",
    ],
  },

  // -------------------------------------------------------------------------
  // 11. OPENING / CLOSING TITLE — Establishing tone, world-building, first impression
  // -------------------------------------------------------------------------
  "opening-closing-title": {
    PASS: [
      "Cue establishes its tonal palette in the first eight seconds and commits to it across the full duration — exactly what a main title needs to do for a show whose identity is built on consistent emotional surface. Works under title card.",
      "Arrangement leadership is recognizable from the first instrumental gesture, which gives the show a sonic logo audiences will associate with the brand across episodes. Strong candidate for main title and recurring closing-credits.",
      "Spectral weight is full across the band without crowding the dialogue range — the cue can be cut to a 30-second main title or extended for a 90-second prologue without losing definition. Mix hierarchy is title-grade.",
      "Dynamic arc rises across two minutes with a clear arrival point at 1:14 — gives the editor a natural landing surface for the title card reveal. Lands the turn cleanly on the show logo.",
      "World-building is in the orchestration — period-specific instrument choices that locate the audience inside the show's geography from the first bar. Underscores without competing if the title sequence carries dialogue or VO.",
      "Outro at 2:08 holds a single chord that bleeds into the cold open of the first scene — the cue functions as a bridge into the show's world rather than a separate musical number. Candidate for episodic main-title placement.",
    ],
    MAYBE: [
      "Tonal palette is right for the show's world but the cue introduces a melodic theme at 0:48 that may compete with whatever score motif the composer is developing for the series. Music-supervisor-to-composer handoff.",
      "Establishing tone arrives quickly but the cue's first impression is genre-coded in a way that may pre-commit the audience to a read the show is trying to subvert. Editorial call on whether the directness serves.",
      "Cue is structurally main-title-grade but at 3:30 it runs longer than most opening sequences need — needs a 30-, 60-, and 90-second cutdown set before commit.",
      "Forward momentum is correct for a series opener but the cue's energy peaks at 1:48 — works only if the title sequence is back-loaded; competes with a sequence that wants to land its hit at the front.",
      "Arrangement leadership serves the world-building but the cue's vocal entry at 1:10 commits the show to a specific gender and emotional register from episode one. Director-level decision on whether that lock-in helps or hurts.",
      "Cue serves the brief but the master has been used as a main title on a competing streamer's series within the past four years — sonic identity collision risk. Pre-clear before showrunner commit.",
    ],
    FAIL: [
      "Valence is too narrow for a main title — the cue commits to a single emotional register where a series opener typically needs to suggest range. Emotional bandwidth is the wrong dimension for the brief.",
      "Arousal ceiling sits below what a series opener needs to claim attention with — the cue is restrained where a first impression has to assert itself. Wrong dimension for opening-frame work.",
      "Cue is built around a verse-chorus pop structure that does not compress into a 30-second main-title cutdown without losing its arc. Structural shape is the issue, not the topline.",
      "Mix is mastered for streaming-single delivery with no instrumental, no extended mix, and no stems available — main-title cutdowns require all three. Deliverable set is incomplete for the use.",
      "Master rights are held by an artist whose management has a standing rule against main-title placements as a brand-protection policy. Confirmed in writing two quotes ago. Non-viable category.",
      "Composition is administered across four publishers in three territories with no MFN agreement — main-title clearance requires worldwide rights from day one and the chain of title is not consolidated. Operational non-starter.",
    ],
  },

  // -------------------------------------------------------------------------
  // 12. EUPHORIA / CELEBRATION — Emotional resolution, bookend, earned release
  // -------------------------------------------------------------------------
  "euphoria-celebration": {
    PASS: [
      "Cue earns its emotional resolution through three minutes of build rather than asserting it at the front — the audience arrives at the release alongside the music. Candidate for end-credits but not main title.",
      "Tonal palette returns to the harmonic motif from the cold open and resolves it for the first time in the cue's outro — the bookend lands inside the music itself. Lands the turn on the cut to black.",
      "Vocal entry at 1:32 brings the lyric content that the show has been earning across the season — the song is doing the emotional work the closing scene is asking the audience to share. Clears for end-credits use.",
      "Dynamic arc lifts into a final chorus at 2:48 with the full arrangement landing on the credit roll — gives the editor a natural placement for the cast cards. Drives the cut without dictating it.",
      "Outro decay holds for forty-two seconds across the credit crawl — the cue is built to bleed across end-credits real estate without artificial extension. Mix hierarchy is end-credits-grade.",
      "Earned release is in the harmonic resolution at 3:18 — the cue gives the audience a major-key landing they have been denied across the season. Strong candidate for finale-episode placement specifically.",
    ],
    MAYBE: [
      "Emotional resolution is present but the cue resolves at 1:42 and runs another two minutes after — the editor will either need a clean fade point or the credit crawl has to absorb the additional duration.",
      "Bookend register is right but the lyric specificity is high — names a relationship that may or may not match what the season's narrative actually resolved. Read lyric sheet against the season finale beats.",
      "Dynamic arc serves the brief but the final chorus at 2:50 lands harder than some endings want — works for a triumphant resolution, competes with a quieter or ambiguous closer. Director call.",
      "Tonal palette is right for closing-title use but the cue is structurally main-title-shaped — the editor will need to confirm with the showrunner that this is the closer rather than the opener. Placement clarity.",
      "Cue is end-credits-grade but the master was released as a single eighteen months ago and charted — sonic familiarity may pull audiences out of the show's interiority into the artist's separate identity. Editorial call.",
      "Earned release lands but the publishing flag indicates a co-write share with a writer whose backend is currently in a clearance dispute. Pre-clear before commit; wait time is the operational risk.",
    ],
    FAIL: [
      "Valence reads unresolved across the full duration — closing-title work needs the harmonic language to give the audience a landing surface, and this cue refuses to provide one. Wrong emotional shape for a bookend.",
      "Arousal ceiling escalates rather than resolves — the cue is still building at the final fade, which leaves the audience charged when the brief asks for release. Emotional direction is reversed.",
      "Cue is 1:24 long with no extended mix available — credit crawls are typically 90 seconds minimum and this song does not support the runtime. Structural deliverable conflict.",
      "Lyric content addresses a narrative that contradicts the season's actual resolution — placing it under the credits would editorialize against the showrunner's intended ending. Wrong song for the use.",
      "Master is owned by a label whose end-credits placement minimum exceeds the show's per-episode budget by a factor of five. Not editorial — rate card eliminates it from the conversation.",
      "Composition is registered with a publishing administrator whose end-credits clearance turnaround is documented at six to ten weeks. Show's air date is in nineteen days. Non-viable timeline.",
    ],
  },

  // -------------------------------------------------------------------------
  // 13. CINEMATIC / EPIC — Scale, orchestral weight, consequential stakes
  // -------------------------------------------------------------------------
  "cinematic-epic": {
    PASS: [
      "Full orchestral arrangement with choir entering at 1:32 and brass stack at 2:14 — the cue is built for theatrical scale without any rock or hybrid layer to compromise the orchestral identity. Drives the cut without dictating it.",
      "Spectral weight is genuinely epic — the low brass and timpani occupy the sub band the way theatrical sound design expects, and the choir sits above the dialogue range. Mix hierarchy translates to 5.1 and Atmos delivery without remix.",
      "Dynamic arc is patient — the cue takes ninety seconds to reach the first major dynamic statement, which gives consequential-stakes coverage time to build before the music asserts itself. Lands the turn on the army-cresting-the-hill beat.",
      "Tonal palette is modally consistent across the four-minute arrangement — a single emotional world rendered at scale rather than a montage of moods. Underscores without competing with on-camera battle dialogue.",
      "The modulation up a half step at the chorus return at 3:08 is the cue's emotional and structural climax — gives the editor the biggest hit point the picture has, exactly when consequential coverage needs it.",
      "Outro at 4:22 resolves the cue's main motif in full orchestration — the music gives the scene the closure that the picture is asking the audience to feel. Candidate for end-credits reprise as well as the set piece itself.",
    ],
    MAYBE: [
      "Scale is right but the cue's orchestral language is genre-coded toward a specific franchise sound — works if the project is genre-adjacent, competes if the production is trying to establish its own orchestral identity.",
      "Orchestral weight is theatrical-grade but the cue runs 2:48 and the set piece as locked is 5:10 — needs an extended mix, a music-editor stitch, or a stems-driven rebuild to cover the runtime.",
      "Consequential stakes register in the harmonic language but the cue's tempo at 76 BPM is slower than the picture is moving — editorial call on whether the music's gravity slows the cut productively or drags it.",
      "Cue serves the brief but the choir lyric is in a constructed language that some audiences will hear as profound and others as pastiche. Director-level call on the cultural read.",
      "Dynamic arc lands the climax cleanly but the back third of the cue introduces a percussion ostinato at 3:40 that pulls the orchestral identity toward hybrid-trailer territory. Stems pull would let the music editor decide.",
      "Cue is structurally epic-grade but the master has been used in a major studio trailer campaign within the past year — sonic recognition risk for a feature trying to claim its own orchestral identity.",
    ],
    FAIL: [
      "Arousal ceiling is below theatrical scale — the cue gestures at epic without committing to the orchestration, and the picture will out-scale the music every time. Wrong dimension for consequential-stakes coverage.",
      "Valence reads heroic-uncomplicated across the full duration, which collapses the moral weight a consequential-stakes brief typically wants. The cue celebrates where the picture is asking the audience to feel cost.",
      "Cue is structurally a four-on-the-floor pop arrangement with orchestral overdubs — the underlying rhythmic floor is wrong for theatrical scale regardless of the string layer on top. Arrangement architecture mismatch.",
      "Master mix is loud-pop-grade with brick-wall limiting — the dynamic range is too compressed for theatrical mix-stage delivery. Music will fight rather than collaborate with sound design.",
      "Composition rights are held jointly by a film-score collective whose standard contract excludes use in non-original-score contexts — this is library catalog, not commissioned score. Brief is wrong for the use category.",
      "Master was commissioned for a competing studio's tentpole release with a five-year exclusivity carve-out that has not yet expired. Pre-clear conversation is operationally non-viable.",
    ],
  },

  // -------------------------------------------------------------------------
  // 14. CORPORATE / ASPIRATIONAL — Forward momentum, optimistic, professional polish
  // -------------------------------------------------------------------------
  "corporate-aspirational": {
    PASS: [
      "Cue holds a bright major-key palette with a clean four-bar rhythmic engine and a melodic hook at 0:32 — exactly the polished, forward-leaning surface a corporate aspirational brief expects. Works under VO and clears for trailer use.",
      "Arrangement is built around piano, plucked synth, and a clean kick — the mix hierarchy leaves the entire dialogue band uncontested for executive voiceover or testimonial cutaway. Yields to dialogue across the full duration.",
      "Forward momentum is steady without escalating into hyperactive territory — the cue projects confidence without performing urgency. Drives the cut without dictating it through the founder-walking-through-office shot.",
      "Tonal palette is brand-safe across categories — no genre marker that locks the cue to a specific industry or demographic. Strong candidate for B2B, fintech, healthcare, and SaaS corporate use within a single license.",
      "Dynamic arc lifts gently at 1:14 for the value-prop reveal and pulls back for the close — gives the brand team a natural landing surface for the logo lock-up. Lands the turn cleanly without overstating it.",
      "Outro at 2:18 ends on a clean button at the logo card — professional polish all the way through the deliverable. Cue sheet metadata is complete and one-stop status is confirmed at the publisher.",
    ],
    MAYBE: [
      "Optimism is present but the cue's harmonic language reads slightly nostalgic — works for legacy-brand storytelling, competes with a forward-tech narrative. Director-level call on the brand voice.",
      "Forward momentum is correct but the cue's BPM at 132 is faster than most aspirational corporate work uses — lands as energetic for a launch, reads as anxious for an institutional brief.",
      "Tonal palette is brand-clean but the cue's mix has a forward synth lead that may compete with a prominent voiceover. Stems pull lets the music editor mute the lead during V/O coverage.",
      "Cue is corporate-grade structurally but the topline melody is highly memorable in a way that may compete with the brand's own audio mnemonic. Sonic-identity pre-clear with the brand team.",
      "Aspirational register lands but the cue's outro at 2:48 runs longer than most corporate cutdowns need — the deliverable set should include 15-, 30-, and 60-second alts. Worth requesting before commit.",
      "Cue serves the brief but the master has been placed in a competitor's campaign within the past nine months — sonic confusion risk in the same vertical. Pre-clear with the agency.",
    ],
    FAIL: [
      "Valence is bright but the cue carries an underlying minor-key shadow in the bridge — corporate aspirational coverage cannot accommodate even momentary emotional ambiguity. Wrong harmonic register for the brief.",
      "Arousal ceiling spikes into festival-EDM territory at the drop — the cue is partying where the brand wants it to inspire, and those are different emotional jobs. Dimensional misread.",
      "Lyric content carries an explicit relationship narrative — the song is about a person, and corporate aspirational use cannot accommodate that personal specificity. Instrumental version exists but the cue was written around the topline.",
      "Cue is built on a heavily processed vocal sample that registers as a recognizable artist-identity marker — the brand cannot rent that identity for the duration of the campaign without licensing the artist relationship.",
      "Master is owned by a label whose corporate-use approval policy requires a CMO-level sign-off and a two-week internal review — campaign go-live is in nine days. Operational timeline failure.",
      "Composition contains an interpolation of a 1980s pop standard whose publisher administration has historically required corporate-use fees three times the show's standard rate card. Budget eliminates it.",
    ],
  },

  // -------------------------------------------------------------------------
  // 15. NATURE / PASTORAL — Spacious, organic, unhurried, yields to picture
  // -------------------------------------------------------------------------
  "nature-pastoral": {
    PASS: [
      "Cue is built from acoustic guitar, hammered dulcimer, and a single sustained string pad — the instrumentation itself does the pastoral work without any electronic layer to break the organic register. Yields to picture entirely.",
      "Tempo at 68 BPM and a long-breathing arrangement give the editor permission to let the picture take its time — the cue does not rush the cut. Underscores without competing through the wide-shot landscape coverage.",
      "Tonal palette is modal and unhurried with no clear cadential resolution before the outro — the music shares the picture's relationship to time rather than imposing its own structure. Drives the cut without dictating it.",
      "Spectral weight is light across the full band, leaving the natural-sound design layer (wind, water, birdsong) entirely uncontested. Mix hierarchy is documentary-grade and clears for nature-doc episodic use.",
      "Dynamic arc holds nearly flat for the first two minutes and lifts almost imperceptibly into the bridge — the cue's restraint is its emotional argument. Lands the turn quietly on the herd-on-the-ridge reveal.",
      "Outro at 3:48 fades into a single sustained tone that bleeds into ambient location sound — the cue does not announce its ending. Candidate for episodic recurrence as the show's pastoral motif.",
    ],
    MAYBE: [
      "Spaciousness is present but the cue introduces a melodic theme at 1:08 that pulls the audience's attention from the picture to the music — works for a featured beat, competes with wallpaper underscore. Editorial call.",
      "Organic instrumentation serves the brief but the mix has a forward acoustic guitar in the same register as on-camera voiceover narration. Stems pull or instrumental alt would resolve.",
      "Unhurried pacing is right but the cue's arrangement is structurally a song with verse-chorus-verse architecture — pastoral coverage typically wants ambient flow rather than song shape. Director call.",
      "Tonal palette serves the brief but the cue's harmonic vocabulary is regionally specific — a Celtic register that locks the picture to a geography the documentary may not be claiming. Geography pre-check.",
      "Yields to picture correctly but the cue runs 2:30 and most pastoral coverage runs longer — the music editor will need to identify a clean loop point or the cue will feel like it announced its ending mid-scene.",
      "Cue is pastoral-grade but the master is administered by a library whose non-exclusive distribution has placed it heavily in nature-documentary catalog over the past three years. Sonic-fingerprint review.",
    ],
    FAIL: [
      "Valence reads warm-bright in a way that editorializes the landscape — pastoral coverage typically wants emotional neutrality so the picture can carry the emotional read. The cue tells the audience how to feel about the field.",
      "Arousal arc lifts into a romantic peak at 1:48 that converts the pastoral register into a relationship cue — the music brings character interiority where the brief wants observational distance. Dimensional misread.",
      "Cue is built on a programmed kick and synth bass that immediately register as electronic — incompatible with an organic pastoral brief regardless of any acoustic layer above. Production-aesthetic mismatch.",
      "Mix is mastered loud with brick-wall limiting — pastoral coverage requires dynamic range to breathe with the picture, and this cue cannot pull back without becoming inaudible. Master is wrong format for the use.",
      "Master is owned by an artist whose public stance on nature-documentary licensing was a published refusal in a trade interview six months ago. Reputational pre-clear is the gating issue.",
      "Composition uses a sample of a field recording made by a third-party documentarian whose rights to that recording are still in dispute. Pre-clear on the underlying sample is the chain-of-title problem.",
    ],
  },

  // -------------------------------------------------------------------------
  // 16. MONTAGE / TRANSITION — Neutral energy, passage of time, editorial glue
  // -------------------------------------------------------------------------
  "montage-transition": {
    PASS: [
      "Cue holds a steady mid-tempo pulse with a deliberately neutral tonal palette — neither bright nor dark — exactly what editorial glue between scenes requires. Drives the cut without dictating it across four locations.",
      "Arrangement is rhythmically consistent without melodic specificity — the cue's job is to carry temporal continuity, not to assert a feeling, and the topline understands that. Yields to dialogue and lifts on the cut to the new location.",
      "Forward momentum is steady at 104 BPM with a four-bar phrase structure that lets the editor cut on every fourth bar without phrase-end artifacts. Underscores without competing across passage-of-time coverage.",
      "Spectral weight is balanced across the band with no register dominant — the cue functions as connective tissue rather than scene-driving content. Mix hierarchy is editorial-glue grade.",
      "Tonal palette is harmonically open — suspended chords without strong cadential motion — which means the cue can absorb whatever emotional direction the surrounding scenes establish. Lands the turn at every transition cleanly.",
      "Outro at 1:48 ends on a clean fade rather than a button — the cue dissolves into the next scene rather than closing the previous one. Candidate for repeated episodic transition use across season.",
    ],
    MAYBE: [
      "Neutral energy is intact in the verse but the chorus introduces a melodic hook at 0:48 that pulls the cue out of editorial-glue function into featured-music territory. Editorial call on whether the lift helps or hurts.",
      "Forward momentum serves the brief but the cue's tonal palette tilts slightly hopeful — works for a montage transitioning toward resolution, competes with one transitioning toward conflict. Direction-of-arc check.",
      "Cue is structurally transition-grade but the mix has a forward bass line that may compete with low-frequency sound design at scene cuts. Music-editor pass on the low end before commit.",
      "Editorial glue function is correct but the cue runs 2:18 and most transitions run 30 to 60 seconds — needs a cutdown set or a clean exit point at the first chorus.",
      "Cue serves the brief but the publishing flag indicates an unresolved share with a co-writer who has historically had inconsistent approval timelines. Pre-clear before commit.",
      "Neutral register lands but the cue includes a brief vocal phrase at 1:14 that may pull audience attention from picture to music. Instrumental alt would resolve cleanly.",
    ],
    FAIL: [
      "Valence is too pronounced in either direction — the cue commits to a clear emotional read that editorial glue specifically should not. Neutral energy is the brief; this cue editorializes.",
      "Arousal arc has a peak-and-valley shape that imposes its own dramatic structure on the cut — montage transition coverage cannot accommodate music with its own three-act arc. Dimensional misread.",
      "Cue contains a hard tempo change at 1:08 that fractures the temporal continuity transitions exist to provide. Structural conflict with how the brief functions in the edit.",
      "Lyric content is narratively specific — the song is about a person and a place — which competes with editorial-glue use that requires the music to recede from semantic foreground. Wrong song for the function.",
      "Master is owned by a sync library with rate-card ambiguity around episodic transition use — the per-use fee on a recurring placement adds up faster than the show's per-episode music budget allows.",
      "Track was previously placed as featured music in the same showrunner's prior series — recurring transition use of the same cue would create on-the-nose self-reference. Sonic-identity flag, not legal flag.",
    ],
  },

  // -------------------------------------------------------------------------
  // 17. TRIUMPH / VICTORY — Victory arc, peak arousal, crowd energy
  // -------------------------------------------------------------------------
  "triumph-victory": {
    PASS: [
      "Cue earns its triumph through three minutes of build — verse, lift, full-band chorus at 1:48 — exactly the arc a victory sequence is asking the audience to share. Drives the cut without dictating it on the championship-shot reveal.",
      "Anthemic chorus at 1:48 lands on the title-card lift with the full arrangement entering on the same downbeat — gives the editor a single, decisive landing surface for the trophy moment. Lands the turn cleanly.",
      "Tonal palette is major-key triumphant without the saccharine register — the cue celebrates without flattering, which keeps the victory feeling earned rather than gifted. Strong candidate for highlight-reel and end-credits use.",
      "Spectral weight is full and broadcast-ready — the cue translates from stadium PA to streaming-broadcast without losing low-end weight. Mix hierarchy is sports-broadcast grade.",
      "Dynamic arc has a stripped bridge at 2:14 before the final chorus — gives the editor a deadpan beat for the slow-motion player reaction before the music returns to peak crowd-energy. Underscores without competing.",
      "Outro at 3:14 holds the final chord under the credit roll for thirty seconds — the cue is built to bleed across post-game coverage without artificial extension. Candidate for season-recap and trailer use.",
    ],
    MAYBE: [
      "Victory arc is structurally correct but the cue's lyric names a specific sport — football — that may or may not match the production's actual coverage. Pre-clear lyric specificity against the cut.",
      "Crowd-energy register lands but the cue's tempo at 92 BPM is slower than most sports-triumph cutdowns use — works for a slow-motion-emotional victory beat, competes with a fast-cut highlight reel.",
      "Anthemic peak is real but the cue's vocal entry at 0:28 commits the music to a performer-identity that the brand may or may not want to associate with. Director-level call.",
      "Tonal palette is sports-grade but the cue's outro at 3:48 runs longer than most highlight-reel cuts need — needs a 60- and 90-second cutdown set before commit.",
      "Cue serves the brief but the master is heavily associated with a specific team's broadcast use — sonic-identity collision risk if the production is covering a competing franchise. Pre-clear with the league.",
      "Triumph register is correct but the cue's harmonic language tilts religious-spiritual — the choir-and-organ texture works for some victory beats and reads exploitative in others. Director call.",
    ],
    FAIL: [
      "Arousal ceiling is below the brief — the cue gestures at peak energy but never fully commits, leaving the picture's crowd-energy carrying the room alone. Dimensional shortfall.",
      "Valence reads bittersweet — the harmonic palette has minor-key shadow that converts triumph into nostalgic-victory, which is a different emotional register from a peak-arousal sports brief.",
      "Cue runs 2:08 with no extended mix — sports-triumph coverage including credits and highlight tags typically needs 4:00+ of music, and this song does not loop without seams. Deliverable shortfall.",
      "Lyric content is explicitly about a romantic relationship — the song is widely recognized as a love song and using it under championship coverage would read as misappropriation. Wrong cultural register.",
      "Master is controlled by a label with a standing carve-out against league and sport-association use absent additional licensing fees that exceed the production's budget. Operational cost barrier.",
      "Track is a one-stop on the master side but the publishing has been recently transferred between administrators with metadata not yet reconciled at the PRO. Sports broadcast cue-sheet filing risk.",
    ],
  },

  // -------------------------------------------------------------------------
  // 18. GRIEF / LOSS — Low arousal, high emotional weight, unresolved
  // -------------------------------------------------------------------------
  "grief-loss": {
    PASS: [
      "Cue is solo piano with a string entry at 1:32 — sparse, restrained, and emotionally heavy without performing the grief for the audience. Yields to dialogue and silence equally; gives the editor room to breathe.",
      "Arrangement holds at near-silence for the first forty seconds, which lets the picture's silence become the cue's silence — the music shares the scene's stillness rather than filling it. Underscores without competing.",
      "Tonal palette refuses to resolve — the harmonic motion circles a tonic without ever landing — which mirrors the unresolved emotional register the brief requires. Lands the turn on the casket-side beat.",
      "Spectral weight is concentrated in the mid-low register where mourning lives sonically — the cue does not reach for sentimental high strings, which keeps the grief from tipping into manipulation. Mix hierarchy is restrained.",
      "Dynamic arc never crosses a middle threshold — the cue holds at low arousal across the full duration, which respects the audience's grief rather than directing it. Drives the cut without dictating it.",
      "Outro at 3:48 fades on a suspended chord that does not resolve — the cue leaves the audience inside the loss rather than walking them out of it. Candidate for end-credits placement on a memorial episode.",
    ],
    MAYBE: [
      "Emotional weight is present but the cue introduces a melodic theme at 1:08 that may editorialize the grief — works for a character-attached loss, competes with collective or ambient mourning coverage. Director call.",
      "Restraint serves the brief but the cue resolves to a major-key tonic at 2:30 — that resolution offers the audience a comfort the brief is asking the picture to withhold. Editorial call on the cadence.",
      "Low-arousal register is right but the cue's vocal entry at 1:42 commits the lyric to a specific narrative of loss that may or may not match the picture's coverage. Lyric-against-locked-picture review.",
      "Tonal palette serves the brief but the mix has a forward piano that competes with whispered ADR or grief-coded breath foley. Stems pull lets the music editor recede the keyboard.",
      "Cue is grief-grade structurally but the master was placed in a high-profile in-memoriam segment within the past year — sonic-identity association may pull audiences out of this scene's specificity.",
      "Unresolved register lands but the publishing flag indicates an estate-administered share that requires written approval for in-memoriam and grief-coded uses. Pre-clear timeline is the operational risk.",
    ],
    FAIL: [
      "Valence sits warm-comforting where the brief asks for unresolved weight — the cue is consoling the audience when the picture is asking them to sit inside the loss. Wrong emotional dimension for grief work.",
      "Arousal arc rises into a hopeful peak at 2:14 that converts grief into healing — those are different emotional jobs, and the cue picks the wrong one for the brief. Dimensional misread.",
      "Drum kit enters at 1:08 with a backbeat — there is no version of a low-arousal grief underscore that carries audible drums. Structural conflict with how the brief breathes.",
      "Cue is mixed at commercial-pop loudness with brick-wall limiting — the dynamic range required to sit under quiet grief coverage is not available in the master. Master is wrong format for the use.",
      "Master is controlled by an artist whose public statement about a recent grief-coded placement was a rejection of the use category as a brand-protection issue. Reputational pre-clear required.",
      "Composition is administered by a publisher whose grief-and-memorial-use approval requires written family consent for the underlying songwriter — turnaround historically eight to twelve weeks. Post timeline does not accommodate.",
    ],
  },

  // -------------------------------------------------------------------------
  // 19. CONTEMPLATIVE / REFLECTIVE — Contemplative, timeless, non-denominational
  // -------------------------------------------------------------------------
  "contemplative-reflective": {
    PASS: [
      "Cue is built from sustained drone, hammered dulcimer, and a wordless vocal that enters at 1:32 — every textural choice points at contemplation without committing to a specific tradition. Underscores without competing.",
      "Tonal palette is modal and timeless — no harmonic vocabulary that locks the cue to a denomination or era. Yields to dialogue and breath equally; gives the editor room to sit in the moment.",
      "Spectral weight is balanced across the full band with no percussive transient anywhere in the arrangement — the cue functions as sonic stillness rather than musical event. Drives the cut without dictating it.",
      "Dynamic arc holds at low arousal with one gentle lift at 2:14 — the cue offers the audience a single moment of contemplative release without forcing it. Lands the turn on the wide-shot reveal of the landscape.",
      "Wordless vocal is the cue's emotional center and it carries no language, no specific lyric content, no traditional reference — exactly the non-denominational register the brief requires. Clears across documentary and narrative use.",
      "Outro at 3:48 fades on a sustained drone that bleeds across scene transitions — the cue extends the contemplative register beyond the cut. Candidate for episodic recurrence as a meditative motif.",
    ],
    MAYBE: [
      "Contemplative register is present but the cue's wordless vocal is recognizably stylized in a regional tradition — works for a documentary engaging with that tradition, reads as appropriation in a non-denominational brief. Director call.",
      "Timeless quality serves the brief but the cue introduces a melodic motif at 1:08 that may be heard as character-attached — works for a personal-spirituality scene, competes with collective contemplation. Editorial call.",
      "Tonal palette is right but the cue's mix has a pronounced organ register that some audiences will hear as church-coded regardless of harmonic vocabulary. Pre-clear with the showrunner on denominational neutrality.",
      "Cue is contemplative-grade structurally but at 4:20 it runs longer than most reflective scenes need — needs a clean exit at the first vocal entry or a music-editor cutdown.",
      "Reflective register is correct but the cue's bridge at 2:30 lifts into emotional peak that pulls the audience out of contemplation into catharsis. Editorial call on whether the arc serves the picture.",
      "Cue serves the brief but the master is administered by a meditation-and-wellness label whose distribution may have placed it across the wellness-app market — sonic familiarity with that context.",
    ],
    FAIL: [
      "Valence reads explicitly devotional in a way that locks the cue to a specific tradition — the brief requires non-denominational neutrality and this cue cannot deliver it without editorializing the tradition out.",
      "Arousal arc rises into a triumphant peak that converts contemplation into celebration — those are different emotional registers and the cue picks the wrong one. Dimensional misread.",
      "Cue is built around a 4/4 backbeat and a structured verse-chorus arrangement — contemplative coverage requires temporal openness that this song-shape cannot provide. Structural conflict with the brief.",
      "Lyric content is in a recognizable scriptural language that immediately denominates the cue — non-denominational placement is structurally impossible regardless of the picture's intent. Wrong content for the use.",
      "Master is controlled by a religious-music label with a standing approval requirement that the use align with their stated theological position — review timeline runs four to eight weeks.",
      "Composition is registered to a writer who has publicly objected to non-denominational placement of their religious-tradition material as a cultural-stewardship matter. Reputational pre-clear is the gating issue.",
    ],
  },

  // -------------------------------------------------------------------------
  // 20. URBAN / GRITTY — Brand energy, confident, modern, no lyric conflict
  // -------------------------------------------------------------------------
  "urban-gritty": {
    PASS: [
      "Cue holds modern production aesthetics — clean drum programming, a single forward synth lead, and a minimal harmonic bed — exactly the contemporary surface a product launch is asking for. Drives the cut without dictating it through the unboxing.",
      "Forward momentum is confident without overstating — the cue projects brand certainty without performing hype. Yields to voiceover and lifts on the product reveal at 0:42. Clears for trailer use under the same brief.",
      "Instrumental arrangement eliminates any lyric-conflict risk for a category where the brand owns the message. Mix hierarchy is launch-grade and translates to social-cutdown formats without remix.",
      "Tonal palette is sleek and category-flexible — no genre marker that locks the cue to a specific industry. Strong candidate for tech, automotive, fashion, and consumer-electronics launch use within a single license.",
      "Dynamic arc lifts into the chorus at 1:08 with the hero-product reveal landing on the same downbeat — gives the brand team a natural editorial hit point. Lands the turn cleanly on the logo lockup.",
      "Outro at 1:48 ends on a clean button at the campaign tagline — professional polish all the way through the deliverable, with stems and 15-, 30-, 60-second cutdowns confirmed at intake.",
    ],
    MAYBE: [
      "Brand energy is intact in the verse but the cue's chorus introduces a recognizable melodic hook that may compete with the brand's audio mnemonic. Sonic-identity pre-clear with the brand team before commit.",
      "Modern register is correct but the cue's production aesthetic is genre-coded toward a specific musical movement that may date the campaign faster than the brand wants. Director-level call on the temporal lock-in.",
      "Confident tone lands but the cue's mix has a forward synth lead that may compete with voiceover in the same register. Stems pull lets the music editor mute the lead during V/O.",
      "Cue serves the brief but at 2:48 it runs longer than most launch deliverables — needs 6-, 15-, 30-, 60-second cutdowns and a stems set before commit. Worth requesting all formats.",
      "Brand-energy register is correct but the master has been placed in an adjacent vertical's launch within the past twelve months — sonic-recognition risk in the same media buy. Pre-clear with the agency.",
      "Cue is launch-grade structurally but the publishing flag indicates an unresolved share with a co-writer whose backend has been inconsistent on commercial-use approvals. Pre-clear before commit.",
    ],
    FAIL: [
      "Valence reads moody-introspective in a way that contradicts the confident-modern register a launch brief requires. Wrong emotional dimension for a brand moment built on assertion.",
      "Arousal floor sits below what launch energy demands — the cue ambles where the brand wants it to motor, and a modern launch needs forward propulsion. Dimensional shortfall.",
      "Track contains explicit vocal content with a lyric narrative that competes directly with the brand's intended message — instrumental version exists but loses the topline that drove the song's recognition. Lyric conflict on the master version.",
      "Cue is mixed at commercial-release loudness with brick-wall limiting that does not translate cleanly to social-platform loudness normalization. Deliverable will be artifacted at TikTok and Reels delivery specs.",
      "Master is controlled by an artist whose public stance has been a categorical refusal of brand-launch placements as a creative-integrity policy — confirmed in trade press within the past year. Non-viable category.",
      "Composition contains an interpolation of a 1990s pop standard whose publisher has a standing brand-launch fee floor that exceeds the campaign's total music budget. Operational cost barrier, not editorial.",
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a numeric scene-fit score into the corresponding tier.
 * PASS  >= 70
 * MAYBE >= 50 (and < 70)
 * FAIL  otherwise
 */
function tierFromScore(sceneFitScore: number): Tier {
  if (sceneFitScore >= 70) return 'PASS';
  if (sceneFitScore >= 50) return 'MAYBE';
  return 'FAIL';
}

/**
 * Deterministically derive a phrase-pool index from (trackId, briefId).
 * Uses sha256(trackId + briefId), takes the first 8 hex characters,
 * parses them as an unsigned 32-bit integer, and returns modulo poolSize.
 *
 * No randomness, no time-based input — same inputs always produce the same index.
 */
async function deterministicIndex(
  trackId: string,
  briefId: string,
  poolSize: number,
): Promise<number> {
  if (poolSize <= 0) {
    throw new Error(
      `deterministicIndex: poolSize must be positive, received ${poolSize}`,
    );
  }
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(trackId + briefId),
  );
  const hex = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const slice = hex.slice(0, 8);
  const value = parseInt(slice, 16);
  return value % poolSize;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Select a narrative phrase for a (trackId, briefId, sceneFitScore) triple.
 *
 * The padValues parameter is accepted to keep the call signature stable for
 * upstream scoring code; PAD context is already baked into the phrase pool
 * vocabulary (insider shorthand, never numeric readouts), so the function
 * itself does not need to inspect the values to choose a phrase. The
 * parameter is intentionally retained for API compatibility and future
 * tier-refinement logic.
 */
export async function selectNarrative(
  trackId: string,
  briefId: string,
  sceneFitScore: number,
  padValues: PADValues,
): Promise<string> {
  const pool = NARRATIVE_DICTIONARY[briefId];
  if (!pool) {
    throw new Error(
      `selectNarrative: unknown briefId "${briefId}". ` +
        `Expected one of: ${Object.keys(NARRATIVE_DICTIONARY).join(', ')}.`,
    );
  }

  const tier = tierFromScore(sceneFitScore);
  const phrases = pool[tier];

  if (!phrases || phrases.length === 0) {
    throw new Error(
      `selectNarrative: empty phrase pool for briefId="${briefId}" tier="${tier}".`,
    );
  }

  // Reference padValues so strict TS configurations do not flag it as unused;
  // PAD context is already encoded into the phrase pool vocabulary itself.
  void padValues;

  const idx = await deterministicIndex(trackId, briefId, phrases.length);
  return phrases[idx];
}

// ---------------------------------------------------------------------------
// Internal exports (for testing / introspection)
// ---------------------------------------------------------------------------

export {
  NARRATIVE_DICTIONARY,
  tierFromScore,
  deterministicIndex,
};
