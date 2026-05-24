/**
 * SyncVision Narrative Dictionary v1 — 360 phrases.
 *
 * 6 verdicts × 20 briefs × 3 phrase slots.
 * Verdict thresholds (sceneFit, 0–100):
 *   PASS_STRONG  ≥ 80
 *   PASS_SOFT    70–79
 *   MAYBE_HIGH   60–69
 *   MAYBE_LOW    50–59
 *   FAIL_CLOSE   40–49
 *   FAIL_HARD    < 40
 *
 * Selection is deterministic: SHA-256(trackId + briefId) mod 3.
 * No phrase may fall back to a generic template — every brief × verdict
 * combination has three purpose-written phrases.
 */

export type Verdict =
  | "PASS_STRONG"
  | "PASS_SOFT"
  | "MAYBE_HIGH"
  | "MAYBE_LOW"
  | "FAIL_CLOSE"
  | "FAIL_HARD";

export interface BriefNarrativePool {
  PASS_STRONG: [string, string, string, string];
  PASS_SOFT:   [string, string, string, string];
  MAYBE_HIGH:  [string, string, string, string];
  MAYBE_LOW:   [string, string, string, string];
  FAIL_CLOSE:  [string, string, string, string];
  FAIL_HARD:   [string, string, string, string];
}

export const NARRATIVE_DICTIONARY: Record<string, BriefNarrativePool> = {

  // ── Chase / Tension ─────────────────────────────────────────────────────────
  "chase-tension": {
    PASS_STRONG: [
      "Forward propulsion locks in across all three axes — this is the chase. Promote to first call.",
      "High kinetic arousal with restrained valence and assertive dominance: textbook pursuit cue. Recommend.",
      "Reads as threat-in-motion from first bar. Tempo and emotional centre land exactly where chase supervisors want them.",
      "Stems separate cleanly into rhythm and texture layers — the music editor can duck under critical dialogue and lift on every hard cut. Confirm one-stop before trailer commitment.",
    ],
    PASS_SOFT: [
      "Strong chase profile — arousal and dominance both inside the target, valence grazes the upper edge. Use.",
      "Drives cleanly through the chase envelope. Loses a fraction of menace at the back half but holds well enough to place.",
      "Pursuit energy is convincing. Small tonal brightening keeps it off the top tier but not off the cue sheet.",
      "Arrangement loops without audible phrase-end seam at the eight-bar mark — the editor has the footage run time without a cold restart. Keep on the short list.",
    ],
    MAYBE_HIGH: [
      "Arousal is present but valence sits warmer than the brief wants — reads as competition, not threat. Worth an edit.",
      "Chase-adjacent: rhythm section locks in, but the tonal character softens what should feel dangerous.",
      "Forward momentum is real; dominance reads a half-step too relaxed for sustained pursuit. Usable as a build-in.",
      "The vocal entry at the first chorus will compete with radio-dispatch or protagonist dialogue — pull the instrumental before evaluating further. The underlying arrangement may solve the brief; the full mix doesn't.",
    ],
    MAYBE_LOW: [
      "Energy tilts toward chase but the emotional core doesn't commit. Supervisor would need to build conviction into the edit.",
      "Sits at the margin — right tempo range, wrong emotional posture. Reserve for B-list.",
      "Rhythmically viable but the mood reads action-adjacent rather than chase-specific. Needs a tight placement window.",
      "Cue window is narrow: the thirty-second section before the first chorus carries genuine pursuit energy; the rest of the arrangement backs off. Spot it there or don't spot it.",
    ],
    FAIL_CLOSE: [
      "Tempo and arousal are present but tonal character works against the placement — warmth reads as comfort, not threat. Skip.",
      "Kinetic enough to fool the eye, but the emotional argument falls apart under the scene. Not a chase cue.",
      "Misses on dominance — too yielding for pursuit. The track pushes when the scene needs it to stalk.",
      "Button ending at the outro is a structural misfit for pursuit placement — chase cues need to bleed across the cut, not punctuate it. The arrangement closes where the brief needs it to hold.",
    ],
    FAIL_HARD: [
      "Wrong emotional territory entirely. Chase cues live in threat and forward drive; this lives somewhere else.",
      "Low arousal and warm valence contradict everything the brief asks for. Pass.",
      "Reads as resolution or romance — the opposite of pursuit. Do not place.",
      "Publishing split has three co-writers with no controlled comp clause, which would complicate episodic clearance even if the brief were right. Two problems, not one. Pass.",
    ],
  },

  // ── Action / Combat ─────────────────────────────────────────────────────────
  "action-combat": {
    PASS_STRONG: [
      "Maximum arousal, assertive dominance, valence held in the dark zone — this is the combat brief solved. Place.",
      "Hits the action target with force: high energy, aggressive tonal character, zero release. Recommend.",
      "Reads as physical stakes from bar one. Lands inside the combat envelope on all three axes.",
      "No button ending, no tonic resolution — the arrangement holds in a state of unresolved aggression across its full length, which means the editor can cut it to any fight duration without managing a structural landing.",
    ],
    PASS_SOFT: [
      "Strong action profile — hits the arousal ceiling and holds dark valence. Softens slightly in the back half but holds the placement.",
      "Combat energy is convincing throughout. Loses a degree of dominance toward the tail but remains first-call material.",
      "High-intensity with the right aggression — arousal and valence both on target, dominance a touch below the peak.",
      "Stems separate rhythm from texture — the music editor can pull the melodic layer under hit-point moments and let the rhythmic bed carry the contact choreography without losing the cue's energy.",
    ],
    MAYBE_HIGH: [
      "High energy but the tonal character reads kinetic rather than combative — more action sequence than contact moment.",
      "Arousal is maximal; valence drifts brighter than combat wants. Usable for a fast-cut montage, not a fight.",
      "Gets close on arousal and dominance; the emotional posture sits one degree too resolved for a live combat beat.",
      "Works for the approach to combat but loses the physicality on impact beats — the emotional posture reads kinetic but not violent. Spot it into the fight's setup; cut before contact.",
    ],
    MAYBE_LOW: [
      "Action-adjacent but the track doesn't commit to the aggression combat cues require. B-list at best.",
      "Energetic without being dangerous — supervisors will feel the gap when cut against contact footage.",
      "Kinetic enough to clear a temp, but the emotional specificity isn't there. Reserve for alt considerations.",
      "Clearance path is straightforward — ISRC confirmed, one-stop likely, publishing clean — but the emotional argument doesn't justify the sync investment for a live combat scene. Reserve for a lighter action context.",
    ],
    FAIL_CLOSE: [
      "Tempo suggests action; the emotional argument says chase or triumph. Doesn't land for combat.",
      "High arousal, wrong emotional posture — reads as excitement rather than aggression. Not a combat cue.",
      "Misses on valence — too bright and too positive for a fight scene. Skip.",
      "High BPM and percussive attack are present but the harmonic palette resolves too warmly for contact footage — the arrangement lands in uplift territory when the brief needs it to stay dark. Not an edit problem; a composition problem.",
    ],
    FAIL_HARD: [
      "Nowhere near the combat zone. Wrong arousal, wrong posture, wrong brief.",
      "Emotional profile contradicts the placement entirely. Do not bring this to a combat session.",
      "Reads as romantic, ambient, or contemplative. Pass hard.",
      "Melodic vocal hook recurs every sixteen bars and sits in the dialogue frequency range — combat scenes with fight calls and impact foley cannot carry this without ducking the track into uselessness. Pass hard.",
    ],
  },

  // ── Triumph / Victory ───────────────────────────────────────────────────────
  "triumph-victory": {
    PASS_STRONG: [
      "Peak arousal, maximum valence, assertive dominance — this is the victory podium. Place without hesitation.",
      "Euphoric lift with earned dominance: exactly what triumph cues demand at the peak of the sequence. Recommend.",
      "Sits at the absolute centre of the triumph brief. Bright, forward, and built for the moment of achievement.",
      "Episodic end-credits and sports broadcast are both confirmed use cases — the emotional posture holds under title cards without feeling diminished by a logo cut. Confirm one-stop before a broadcast commit.",
    ],
    PASS_SOFT: [
      "Strong triumph match — arousal and valence both inside the target, dominance sits one notch below peak. Usable.",
      "Victory energy is earned. Loses a fraction of explosive lift at the top but carries the moment convincingly.",
      "Lands inside the triumph zone on arousal and valence. Dominance dips slightly; still a clear first-call candidate.",
      "Needle drop potential is high — the track has a recognisable hook that will read as a conscious editorial choice rather than generic underscore. Confirm master ownership before a broadcast commit.",
    ],
    MAYBE_HIGH: [
      "Bright and forward but the arousal doesn't quite crest where triumph sequences peak. Works for a build, not the apex.",
      "Triumph-adjacent — valence is right, but the track plateaus before the emotional peak the brief asks for.",
      "Could carry the approach to victory; loses the required ecstasy at the summit. Worth considering for a teaser cut.",
      "Works as the beat before the triumph rather than the triumph itself — spot it into the approach sequence and cut to a stronger cue at the peak, or use this as the full-scene option for a deliberately subdued victory.",
    ],
    MAYBE_LOW: [
      "Warm and positive but the energy stays mid-range — triumph wants the ceiling. B-list for celebratory moments.",
      "The emotional direction is correct; the magnitude isn't. A subdued win, not a triumph.",
      "Sits below the triumph band on arousal. Reads more resolution than celebration.",
      "Sync fee tier is reasonable and the master clears cleanly, but the track doesn't carry the emotional weight the brief requires. The rights are easy; the placement isn't justified.",
    ],
    FAIL_CLOSE: [
      "High valence is present but arousal and dominance don't follow — feels like potential, not achievement. Skip.",
      "Bright tone works against the placement rather than for it — sounds like anticipation, not victory.",
      "Emotional profile suggests a good moment rather than a great one. Not a triumph cue.",
      "Button ending at the track's conclusion reads as deflation rather than triumph — the emotional argument collapses at exactly the moment the brief needs it to crest. Structural conflict with the placement.",
    ],
    FAIL_HARD: [
      "Dark, restrained, or understated — none of which triumph asks for. Wrong brief entirely.",
      "Valence and arousal both sit in the wrong quadrant for victory placement. Pass.",
      "Reads as grief or tension. The brief wants the opposite. Do not place.",
      "Co-writer carries a standing MFN clause against sports broadcast placement, which eliminates the primary licensing window where triumph cues earn their value. Rights barrier independent of the brief mismatch.",
    ],
  },

  // ── Euphoria / Celebration ───────────────────────────────────────────────────
  "euphoria-celebration": {
    PASS_STRONG: [
      "Maximum valence, peak arousal, confident dominance — this is the celebration cue. Place.",
      "Euphoric from first bar: bright, high-energy, unambiguous joy. Exactly what the brief asks for.",
      "Sits in the top corner of the celebration zone on all three axes. First call.",
      "Needle drop potential is high — the track has a recognisable hook that reads as a conscious editorial choice rather than generic celebration underscore. Confirm master ownership before trailer commitment.",
    ],
    PASS_SOFT: [
      "Strong celebration profile — peaks on valence and arousal, dominance sits one step below the ceiling. Usable.",
      "Euphoric energy holds across the track. Minor softening toward the back half doesn't disqualify it.",
      "Lands inside the celebration zone convincingly. Small tonal plateau at the peak keeps it off the top tier.",
      "Loops cleanly without audible phrase-end seam — the music editor can extend the celebration sequence to match picture without a hard reset. Confirm one-stop before commit.",
    ],
    MAYBE_HIGH: [
      "Celebratory in character but the arousal stays mid-range — reads more uplift than euphoria. Usable for a lighter beat.",
      "Bright and positive; the peak energy doesn't quite reach the brief's ceiling. Works for the approach, not the climax.",
      "Adjacent to euphoria — warm valence is right, but the dominance sits too assertive for uncomplicated joy.",
      "The euphoria lifts in the chorus but drops back to mid-energy in the verses — usable if the cue window catches the chorus on picture; otherwise the celebration reads as half-committed across the full scene.",
    ],
    MAYBE_LOW: [
      "Upbeat enough to register as positive but not joyful enough to read as celebration. B-list.",
      "The emotional direction is correct; the intensity falls short. Supervisor would need to lean on edit momentum.",
      "Warm but not euphoric. Sits below the celebration band on arousal.",
      "Sync fee tier is reasonable and rights clearance is straightforward, but the emotional return on the placement isn't proportional to the scene's celebratory ambition. Reserve as alt.",
    ],
    FAIL_CLOSE: [
      "Positive valence is present but the energy reads composed rather than celebratory. Doesn't earn the brief.",
      "High energy without euphoria — reads as action or triumph adjacent. Wrong placement.",
      "Sounds like it wants to celebrate but the emotional ceiling isn't there. Skip.",
      "Bright in tone but the arrangement leans on a sustained pad rather than the rhythmic propulsion celebration cues require — the energy doesn't move the picture forward at the moment the brief needs lift.",
    ],
    FAIL_HARD: [
      "Dark, cool, or low-arousal — the opposite of what celebration requires. Pass.",
      "Emotional profile sits in the wrong hemisphere entirely. Not a celebration cue.",
      "Reads as grief, suspense, or contemplation. Do not bring to a celebration session.",
      "Featured vocal carries a controlled comp clause restricting alcohol-adjacent placement — irrelevant to whether the brief lands, since the emotional argument is wrong regardless. Two reasons to pass.",
    ],
  },

  // ── Suspense / Dread ────────────────────────────────────────────────────────
  "suspense-dread": {
    PASS_STRONG: [
      "Held arousal, low valence, yielding dominance — the held-breath profile solved. Place.",
      "Reads as foreboding from the first note: cool, restrained, and threatening without release. Recommend.",
      "Sits at the centre of the dread zone on all three axes. Supervisors cut scenes to tracks like this.",
      "Stems separate cleanly into texture and pulse layers — the music editor can ride the rhythmic bed under footstep foley and let the textural layer carry the threat without competing. Confirm one-stop.",
    ],
    PASS_SOFT: [
      "Strong suspense match — cool valence and contained arousal both inside the brief. Softens slightly but holds dread.",
      "Dread posture is convincing. Minor arousal fluctuation doesn't break the tension.",
      "Lands inside the suspense zone. Loses a degree of restraint at the peak but remains a strong candidate.",
      "No melodic hook, no harmonic resolution — the arrangement holds in unresolved tension across its full length, which gives the editor an extended cue window without a forced landing.",
    ],
    MAYBE_HIGH: [
      "Cool and restrained but the arousal reads anxiety rather than dread — slightly too kinetic for the brief's stillness.",
      "Suspense-adjacent: the tonal character is right, but the track reveals itself too early. Works for a build.",
      "Adjacent to dread on valence; dominance sits too firm. Reads as menace rather than uncertainty.",
      "Reads as suspense in the opening sixteen bars and then commits to a melodic figure that resolves the tension prematurely — spot it into the build and cut before the reveal, or pass on the placement.",
    ],
    MAYBE_LOW: [
      "The emotional direction points toward suspense but the track doesn't hold the stillness the brief requires.",
      "Cool valence in place; arousal runs above the dread band. Useful if the scene has forward motion in it.",
      "Sits at the edge of the suspense zone. A tight cue window might save it; full-scene use would be a stretch.",
      "Cool valence and restrained arousal are gesturally correct, but the textural specificity feels closer to ambient underscore than to dread. Reserve as a non-diegetic background placement.",
    ],
    FAIL_CLOSE: [
      "Cool valence is present but the energy breaks the restraint suspense requires. Releases where the brief needs to hold.",
      "Moves when it should lurk. Not a dread cue.",
      "Interesting texture but the emotional argument doesn't settle into the held-breath zone. Pass.",
      "Held tones are present but the arrangement introduces a major-key motif at the midpoint — the harmonic argument breaks the dread the brief requires. Compositional misfit with suspense placement.",
    ],
    FAIL_HARD: [
      "Bright, forward, or warm — all wrong for suspense. Emotional profile contradicts the brief.",
      "Too much release for a dread cue. The tension dissipates before the scene needs it to.",
      "Reads as triumph or romance. The brief wants restraint and darkness. Pass hard.",
      "Featured vocal with intelligible lyrics — suspense cues cannot carry foreground language without surrendering the held-breath quality the brief requires. Wrong cue category for the placement.",
    ],
  },

  // ── Horror / Psychological ──────────────────────────────────────────────────
  "horror-psychological": {
    PASS_STRONG: [
      "Low arousal with deeply suppressed valence and yielding dominance — the psychological horror profile precisely. Place.",
      "Reads as dread internalized: not a jump scare, a slow unraveling. This is what psychological horror cues sound like.",
      "Sits at the darkest, most intimate corner of the brief's target. Exactly the kind of track that unsettles without announcing itself.",
      "Sub-bass content sits deep enough to be felt rather than heard — the placement will read as dread in the body before the audience can name it. Confirm master and one-stop before episodic commit.",
    ],
    PASS_SOFT: [
      "Strong horror match — dark valence and restrained arousal both on target. Loses the deepest register of dread but earns the placement.",
      "Psychological texture is convincing. The track disturbs without telegraphing — first-call territory.",
      "Lands inside the horror zone on valence and dominance. Minor arousal lift doesn't break the unease.",
      "No melodic anchor and minimal rhythmic event density — the track functions as non-diegetic atmosphere rather than scored cue, which is exactly the register psychological horror placements call for.",
    ],
    MAYBE_HIGH: [
      "Unsettling in character but the arousal runs slightly higher than psychological horror prefers — reads as suspense, not dread.",
      "Dark valence is present; the track announces its discomfort too clearly for a psychological placement. Useful for surface-level horror.",
      "Adjacent to the brief: gets the mood, doesn't quite get the internalized quality the scene needs.",
      "The textural unease holds in the opening but the arrangement introduces a recurring motif by the midpoint — reads as scored thriller rather than psychological horror. Cue window matters.",
    ],
    MAYBE_LOW: [
      "Cool enough to suggest unease but the emotional posture isn't specific enough for psychological horror. B-list.",
      "The darkness is there in fragments. Needs scene architecture to make it work.",
      "Touches the horror zone but retreats before fully committing. Reserve for a specific cue window.",
      "Sits adjacent to the horror zone on valence, but the production register is too composed — the brief wants something that sounds captured rather than mixed for streaming. Reserve as alt.",
    ],
    FAIL_CLOSE: [
      "Tonal character gestures toward darkness but the emotional argument lands as atmospheric rather than disturbing. Not a horror cue.",
      "Drifts toward suspense rather than dread. Doesn't carry the internalized quality the brief requires.",
      "Interesting texture but misses the psychological core. The scene would carry the emotion; the track wouldn't.",
      "Tonal palette gestures toward darkness but the arrangement carries a melodic figure that resolves into consonance at the close — the harmonic argument lets the audience off the hook the brief wants to keep them on.",
    ],
    FAIL_HARD: [
      "Warm, bright, or kinetic — the wrong coordinates for psychological horror entirely. Pass.",
      "Emotional profile reads as celebration or pursuit. Do not place in a horror context.",
      "Nothing in this track's posture serves the brief. Pass hard.",
      "Featured vocal with intelligible lyrics — psychological horror cues cannot carry foreground language without breaking the internalized quality the brief requires. Wrong cue category.",
    ],
  },

  // ── Drama / Confrontation ───────────────────────────────────────────────────
  "drama-confrontation": {
    PASS_STRONG: [
      "Elevated arousal with dark valence and assertive dominance: the confrontation profile solved. Place.",
      "Reads as conflict-in-the-room — high stakes, unresolved, present. Exactly what the brief asks for.",
      "Sits inside the confrontation zone on all three axes. Tense without tipping into action, dramatic without tipping into dread.",
      "Stems separate dialogue-frequency content from rhythmic bed cleanly — the music editor can ride the percussive layer under the confrontation's loudest lines and lift on the silences. Confirm one-stop.",
    ],
    PASS_SOFT: [
      "Strong drama match — arousal and dominance both inside the target, valence grazes the edge of dark. Recommend.",
      "Confrontation energy holds through the track. Small tonal softening at the tail doesn't disqualify it.",
      "Lands in the drama zone convincingly. A half-degree of dominance below peak doesn't break the brief.",
      "Arrangement holds unresolved tension across its full length — no button ending, no tonic landing, which means the editor can cut the cue to scene without managing a structural close.",
    ],
    MAYBE_HIGH: [
      "Dramatic in character but the arousal sits at the lower boundary of the confrontation zone — reads as tension building, not confrontation itself.",
      "The emotional posture is right; the track doesn't escalate enough to carry a full confrontation beat.",
      "Adjacent to drama — dark valence in place, but the dominance reads too yielding for a live argument.",
      "Reads as confrontation in the chorus and dramatic underscore in the verses — works if the cue window catches the chorus on picture; otherwise the placement softens at the moments the scene needs intensity.",
    ],
    MAYBE_LOW: [
      "Emotional direction points toward conflict but the intensity isn't there. Works for scene underscore, not for the confrontation itself.",
      "Sits below the drama band on arousal. Would support a subdued dramatic moment but not a confrontation.",
      "Tense in places but the through-line is too restrained for the brief. B-list.",
      "Sync clearance is straightforward and the rights profile is clean, but the emotional argument doesn't carry a live confrontation beat. Reserve for a quieter dramatic moment.",
    ],
    FAIL_CLOSE: [
      "Has the right valence but reads as grief or dread rather than confrontation — wrong emotional specificity.",
      "Arousal present but dominance is too low — sounds like the character is losing rather than fighting.",
      "Emotional argument doesn't land as drama. Too passive for a confrontation placement.",
      "Vocal performance carries the emotional argument the brief needs the instrumental to carry — even with vocal-down stems, the underlying arrangement reads as accompaniment rather than scored confrontation.",
    ],
    FAIL_HARD: [
      "Bright, celebratory, or ambient — nothing in this posture serves a confrontation cue. Pass.",
      "Emotional profile reads as triumph or romance. The brief wants conflict. Do not place.",
      "Wrong hemisphere entirely. Skip.",
      "Featured vocal performance with intelligible lyrics that narrate a different scene than the one being scored — wrong cue category regardless of where the PAD coordinates land. Pass hard.",
    ],
  },

  // ── Urban / Gritty ──────────────────────────────────────────────────────────
  "urban-gritty": {
    PASS_STRONG: [
      "Mid-high arousal, restrained valence, assertive dominance — exactly the urban grit profile. Place.",
      "Reads as concrete and consequence: kinetic without being euphoric, dark without being dread. First call.",
      "Sits inside the gritty urban zone on all three axes. This is what street-level drama sounds like.",
      "Production register is street-level and unpolished — the arrangement sounds captured rather than mixed for streaming, which is exactly the rough-edged quality urban grit placements require.",
    ],
    PASS_SOFT: [
      "Strong gritty urban match — arousal and dominance both on target, valence holds in the right subdued register.",
      "The track reads as urban consequence throughout. Minor tonal softening doesn't break the profile.",
      "Lands in the urban zone convincingly. A touch less dominance than the ceiling but earns the placement.",
      "Master ownership is confirmed and the clearance window is straightforward — the rights profile matches the editorial value for an episodic urban drama placement. Recommend.",
    ],
    MAYBE_HIGH: [
      "Gritty in character but valence runs brighter than the brief wants — reads as street energy rather than street weight.",
      "Kinetic and assertive, but the emotional posture sits too clean for a gritty placement. Useful for an urban action beat.",
      "Adjacent to the brief: gets the setting, loses the consequence. Usable with scene-specific context.",
      "The grit is in the production but the arrangement leans on a melodic hook that reads pop rather than street — the editor would need to cut around the hook to preserve the urban posture.",
    ],
    MAYBE_LOW: [
      "Urban-adjacent in energy but too composed for the gritty posture the brief requires. B-list.",
      "The texture is right in fragments; the sustained grit isn't there. Reserve for a light pass at the brief.",
      "Sits below the urban band on dominance. Reads more commercial than street.",
      "Adjacent to the urban zone on dominance, but the production polish is too clean for the brief — sounds mixed for radio rather than captured for picture. Reserve as alt.",
    ],
    FAIL_CLOSE: [
      "Energetic but the emotional posture reads action or chase rather than urban consequence. Misses the specificity.",
      "Wrong kind of dark — too ambient or too cinematic for street-level placement.",
      "Has the BPM but not the weight. Not a gritty urban cue.",
      "Tempo and percussive attack suggest urban energy, but the harmonic palette resolves too brightly for street-level placement — the arrangement is hopeful where the brief needs it hardened.",
    ],
    FAIL_HARD: [
      "Warm, pastoral, or euphoric — the wrong coordinates for urban grit entirely. Pass.",
      "Nothing in this track's emotional profile serves a gritty urban placement. Skip.",
      "Reads as triumph or romance. Do not place in a street-level context.",
      "Featured vocal performance carries a controlled comp clause restricting violence-adjacent contexts — directly conflicts with the editorial windows where urban grit cues actually clear. Pass hard.",
    ],
  },

  // ── Romance / Intimacy ──────────────────────────────────────────────────────
  "romance-intimacy": {
    PASS_STRONG: [
      "Warm, close, unhurried — high valence with low arousal and yielding dominance. The intimacy brief solved. Place.",
      "Reads as proximity and tenderness from bar one. Supervisors reach for tracks like this when the scene is about two people.",
      "Sits at the centre of the romance zone on all three axes. Unguarded and warm — exactly right.",
      "Master ownership is confirmed and stems break down to a single sustained line for the closest dialogue beat — the editor has the architectural flexibility intimate scenes require. Confirm one-stop before episodic commit.",
    ],
    PASS_SOFT: [
      "Strong romance match — high valence and soft arousal both on target. Energy lifts slightly in the back half but holds the intimacy.",
      "Intimate posture is convincing throughout. Small arousal fluctuation doesn't break the warmth.",
      "Lands inside the romance zone. Loses a fraction of closeness at the peak but remains a clear candidate.",
      "Vocal-down mix or instrumental version recommended for the close-scene placement — the lyric narrative competes with picture in the critical dialogue beats, but the underlying arrangement is exactly the right weight for non-diegetic underscore.",
    ],
    MAYBE_HIGH: [
      "Warm in character but the arousal runs above the intimacy zone — reads as romantic rather than intimate. Works for a date montage.",
      "Tender valence is present; the track moves when the brief asks it to stay still. Usable with a softer mix.",
      "Adjacent to romance — the warmth is there, but it's a room away from the kind of closeness this brief requires.",
      "The track earns the emotional territory in the verse and loses it in the chorus, where arousal lifts past the intimacy ceiling. Edit to a verse-only cue window or request an alt mix before committing.",
    ],
    MAYBE_LOW: [
      "Positive and warm but too composed or too cool for genuine intimacy. B-list for light romantic moments.",
      "The emotional direction points toward connection; the track doesn't lean into it far enough.",
      "Sits below the romance band on valence. Reads as friendship rather than romance.",
      "Production register is too polished for a close scene — the intimacy brief wants something that sounds like it was recorded in a room, and this sounds like it was mixed for a streaming playlist. Consider whether a stripped version exists.",
    ],
    FAIL_CLOSE: [
      "Warm enough to suggest positive emotion but the intimacy is absent — too polished, too performed for a close scene.",
      "Energy reads as upbeat rather than tender. Doesn't serve the emotional specificity the brief requires.",
      "Valence is positive but dominance is too assertive for vulnerability. Not a romance cue.",
      "Production register is mixed for streaming rather than scored for picture — the polish reads as performance, not proximity. Even a stripped alt mix would struggle to find the intimate register the brief requires.",
    ],
    FAIL_HARD: [
      "Dark, aggressive, or high-arousal — wrong coordinates for intimacy entirely. Pass.",
      "Emotional profile reads as chase or combat. The brief wants warmth and proximity. Do not place.",
      "Nothing in this track's posture serves a romance placement. Skip.",
      "Publishing administration is split across two territories with no controlled comp clause — the rights friction would be unjustified even if the brief landed, which it doesn't. Two reasons to pass.",
    ],
  },

  // ── Heartbreak / Separation ─────────────────────────────────────────────────
  "heartbreak-separation": {
    PASS_STRONG: [
      "Low arousal with suppressed valence and yielding dominance — the heartbreak profile precisely. Place.",
      "Reads as the morning after: drained, quiet, and open-wounded. Exactly the emotional territory the brief occupies.",
      "Sits in the centre of the heartbreak zone on all three axes. Supervisors don't find tracks like this often.",
      "Stems break down to a single sustained line at the bridge — the music editor can pull to that line for the close-up and rebuild for the wide. Confirm one-stop before episodic commit.",
    ],
    PASS_SOFT: [
      "Strong heartbreak match — low valence and restrained arousal both on target. A minor lift toward the end doesn't break the grief.",
      "Separation energy holds across the track. The emotional argument stays in the loss zone convincingly.",
      "Lands inside the heartbreak zone. Small dominance fluctuation doesn't disqualify it.",
      "Arrangement holds unresolved emotional weight — no button ending, no consoling tonic landing, which is exactly the structural posture the heartbreak brief requires across the cue window.",
    ],
    MAYBE_HIGH: [
      "Adjacent to heartbreak — the valence is suppressed but the arousal reads grief rather than the quiet devastation of separation.",
      "Emotionally in the right territory; the track doesn't quite achieve the depletion heartbreak requires. Usable for a grief-adjacent beat.",
      "Cool and soft in places, more emotionally active in others. Tight cue window might make it work.",
      "Reads as heartbreak in the verses but the chorus lifts past the depletion the brief calls for — spot it into a verse-only cue window or request an alt mix before placing.",
    ],
    MAYBE_LOW: [
      "Sad in a general sense but not specific enough to carry a heartbreak scene. B-list.",
      "The emotional gesture is right; the specificity isn't. A supervisor would look further.",
      "Sits below the heartbreak band on valence. Reads as wistfulness rather than loss.",
      "Sync fee tier is reasonable and master clearance is clean, but the emotional specificity falls short of what the brief requires to justify the placement. Reserve as alt.",
    ],
    FAIL_CLOSE: [
      "Low valence is present but the track is too restless for heartbreak — reads as grief in motion rather than stopped-still separation.",
      "Emotional territory is adjacent but the argument isn't specific enough for the brief.",
      "Gets the darkness, misses the intimate scale. Not a heartbreak cue.",
      "Low valence is present but the arrangement introduces a hopeful chord progression at the bridge — the harmonic argument resolves the heartbreak prematurely. Wrong landing for the brief.",
    ],
    FAIL_HARD: [
      "Bright, kinetic, or triumphant — the wrong coordinates for heartbreak entirely. Pass.",
      "Emotional profile reads as celebration or pursuit. The brief wants stillness and loss. Do not place.",
      "Wrong hemisphere. Skip.",
      "Featured vocal performance with intelligible lyrics narrating a different relationship arc than the scene depicts — the lyric content actively contradicts the picture. Pass hard.",
    ],
  },

  // ── Grief / Loss ────────────────────────────────────────────────────────────
  "grief-loss": {
    PASS_STRONG: [
      "Low arousal, cool valence, deeply yielding dominance — the grief profile with nothing left out. Place.",
      "Reads as absence: sparse, still, and dark without being dramatic. Exactly what memorial and loss cues require.",
      "Sits at the exact centre of the grief zone. Supervisors mark tracks like this as permanent catalog.",
      "Stems break down to a single sustained line — the music editor can pull to that line for the closest dialogue moment and rebuild for the wide. Confirm one-stop before episodic commitment.",
    ],
    PASS_SOFT: [
      "Strong grief match — cool valence and restrained arousal both inside the brief. Loses the deepest register of absence but earns the placement.",
      "Grief posture holds across the track. Minor energy fluctuation doesn't break the stillness.",
      "Lands in the grief zone convincingly. A degree of arousal above the floor doesn't disqualify it.",
      "Memorial and eulogy sequences specifically — the track holds space without filling it, which is the hardest thing to find in a loss cue. Confirm one-stop status before a broadcast commitment; the rights profile will determine whether this can clear on a compressed post timeline.",
    ],
    MAYBE_HIGH: [
      "Adjacent to grief on valence and dominance; the arousal reads sorrowful rather than still. Useful for a grief-in-motion beat.",
      "Cool and restrained but doesn't fully commit to the emptiness grief cues require. Usable with architecture.",
      "Emotionally in the right territory; the track is a touch too present for the absent quality grief needs.",
      "Works for the scene leading into the grief beat rather than the grief beat itself — the arousal is high enough to carry narrative momentum, which is an asset in the approach and a liability at the stillpoint. Cue in early, cut before the close-up.",
    ],
    MAYBE_LOW: [
      "Sad in register but the emotional specificity falls short of grief. B-list for loss-adjacent scenes.",
      "The darkness is there; the stillness isn't. Would need scene architecture to make the brief work.",
      "Sits below the grief band on valence. Reads as sadness, not mourning.",
      "Could underscore a scene about anticipating loss rather than experiencing it — the emotional distance is actually an asset in that specific context. Outside that window, the track doesn't carry the weight the brief requires.",
    ],
    FAIL_CLOSE: [
      "Tonal character suggests sorrow but the arousal breaks the stillness grief requires. Doesn't hold the space.",
      "Adjacent to the brief but too active to serve a grief cue.",
      "Gets the quiet; loses the loss. Not a grief cue.",
      "The track has a recurring melodic figure that sits inside the dialogue frequency range — even with aggressive ducking, the editorial gain ride would fight the picture rather than serve it. Compositional mismatch.",
    ],
    FAIL_HARD: [
      "Forward, bright, or dominant — the opposite of everything grief requires. Pass hard.",
      "Emotional profile reads as triumph or chase. The brief wants absence and stillness. Do not place.",
      "Wrong hemisphere entirely. Skip.",
      "Button ending lands on a major tonic at the close — the harmonic resolution reads as arrival, the opposite of the absence grief cues require. Wrong landing for the brief, wrong cue for the placement.",
    ],
  },

  // ── Contemplative / Reflective ──────────────────────────────────────────────
  "contemplative-reflective": {
    PASS_STRONG: [
      "Low arousal, balanced valence, restrained dominance — the contemplative posture without a wasted note. Place.",
      "Reads as thought rather than feeling: observational, unhurried, inward. Exactly the reflective brief.",
      "Sits at the centre of the contemplative zone on all three axes. This is what an interior monologue sounds like.",
      "Stems separate cleanly to a single melodic line for the introspective close-up and rebuild for the wide — the editor has the architectural flexibility the brief's quiet moments require. Confirm one-stop.",
    ],
    PASS_SOFT: [
      "Strong contemplative match — low arousal and balanced valence both inside the target. Softens slightly but the reflective quality holds.",
      "Introspective posture is convincing. The track thinks rather than feels — right register for the brief.",
      "Lands in the reflective zone. A minor valence drift doesn't break the contemplative character.",
      "No vocal hook, no rhythmic insistence — the arrangement functions as non-diegetic underscore for thought rather than scored cue for action, which is the exact register the brief lives in.",
    ],
    MAYBE_HIGH: [
      "Reflective in character but arousal runs slightly above the brief's stillness — more emotional than contemplative.",
      "Adjacent to the contemplative zone: balanced in places, too active in others. Useful for a transitional moment.",
      "Gets the inward quality in passages; the track doesn't sustain the stillness the full brief requires.",
      "Reads as contemplative in the opening sixteen bars and then commits to a melodic figure that pulls the audience outward — works for a transition out of reflection but not for sustained interior.",
    ],
    MAYBE_LOW: [
      "Quiet but not specifically contemplative — the emotional register is general rather than introspective. B-list.",
      "Low arousal is present; the balanced valence the brief requires is harder to locate.",
      "Sits at the margin — could carry a specific cue window but not the full placement.",
      "Adjacent to the reflective zone on arousal, but the production register feels closer to ambient playlist than scored contemplation. Reserve as alt for a lighter interior moment.",
    ],
    FAIL_CLOSE: [
      "Quiet but emotionally specific in the wrong direction — reads as grief or intimacy rather than reflection.",
      "The stillness is there; the observational quality isn't. Not a contemplative cue.",
      "Gets the restraint, misses the inward gaze. Doesn't serve the brief.",
      "Low arousal is present but the arrangement is built around a melodic hook that draws attention to itself — the brief wants underscore that thinks, not melody that announces. Wrong register.",
    ],
    FAIL_HARD: [
      "Kinetic, euphoric, or dark — none of which contemplation asks for. Pass.",
      "Emotional profile reads as action or celebration. The brief wants the interior. Do not place.",
      "Wrong register entirely. Skip.",
      "Featured vocal with intelligible lyrics — contemplative cues cannot carry foreground language without breaking the interior quality the brief requires. Wrong cue category for the placement.",
    ],
  },

  // ── Emotional Resolution ────────────────────────────────────────────────────
  "emotional-resolution": {
    PASS_STRONG: [
      "Mid-arousal with warm valence and settled dominance — the earned-conclusion profile solved. Place.",
      "Reads as exhalation rather than arrival: not triumphant, not sad, but finished. Exactly the resolution brief.",
      "Sits at the centre of the resolution zone on all three axes. Supervisors call this kind of track 'the closer.'",
      "Button ending lands on a major tonic at the close — the harmonic argument completes where the scene needs to land. Exactly the structural posture an earned resolution requires.",
    ],
    PASS_SOFT: [
      "Strong resolution match — warm valence and mid arousal both inside the brief. Holds the conclusive quality across the track.",
      "Earned-ending energy is convincing. The emotional argument settles rather than crests.",
      "Lands in the resolution zone. A minor arousal lift doesn't break the settled quality.",
      "Stems separate dialogue-frequency content from the harmonic bed — the music editor can ride the cue under the final dialogue beats and lift on the closing image. Confirm one-stop.",
    ],
    MAYBE_HIGH: [
      "Warm and settled but the arousal sits slightly above the resolution band — reads as a good moment rather than a conclusion.",
      "Resolution-adjacent: the catharsis is there, the finality isn't quite. Works for a scene that ends without closing.",
      "Gets the warmth; doesn't fully commit to the settling-down the brief requires. Usable for an upbeat fade.",
      "Reads as resolution in the chorus but the verses sit in transitional energy — works for a cue window that catches the chorus on picture; less useful as full-scene underscore.",
    ],
    MAYBE_LOW: [
      "Warm in register but too restrained for an earned resolution — reads as contemplation rather than conclusion.",
      "The emotional gesture points toward resolution; the energy doesn't support the arrival.",
      "Sits below the resolution band on arousal. Reads as aftermath, not landing.",
      "Master clearance is straightforward and the rights profile is clean, but the emotional weight isn't enough to carry a closing moment. Reserve for a mid-scene settling beat.",
    ],
    FAIL_CLOSE: [
      "Warm valence is present but the track is still climbing when it should be settling. Doesn't serve an ending.",
      "Energy reads as transitional rather than conclusive. Not a resolution cue.",
      "Emotionally adjacent but the argument doesn't complete. Pass.",
      "Warm valence is present but the arrangement keeps building past the moment of closure — no button ending, no tonic landing. The track doesn't conclude where the brief needs it to.",
    ],
    FAIL_HARD: [
      "Aggressive, dark, or high-arousal — the wrong coordinates for a closing moment. Pass.",
      "Emotional profile reads as confrontation or pursuit. The brief wants arrival and rest. Do not place.",
      "Wrong emotional posture entirely. Skip.",
      "Featured vocal performance with intelligible lyrics narrating an emotional arc that doesn't match the scene — the lyric content fights the editorial argument. Wrong cue for the placement.",
    ],
  },

  // ── Comedy / Light ──────────────────────────────────────────────────────────
  "comedy-light": {
    PASS_STRONG: [
      "Mid-high arousal with high valence and balanced dominance — the light comedy profile solved. Place.",
      "Reads as effortless fun: bright, forward, and socially easy without forcing it. First call for the brief.",
      "Sits inside the comedy zone on all three axes. The emotional posture is self-aware and uncomplicated.",
      "Needle drop potential is high — the track carries a recognisable hook that reads as a deliberate editorial choice rather than generic underscore. Confirm master ownership before a broadcast commit.",
    ],
    PASS_SOFT: [
      "Strong comedy match — high valence and mid arousal both on target. Holds the lightness convincingly.",
      "Light and playful throughout. A small dip in arousal doesn't take it out of consideration.",
      "Lands inside the comedy zone. The playful quality holds — recommend.",
      "Stems separate cleanly into rhythmic bed and melodic hook — the music editor can pull the hook under joke beats and lift on the punchlines. Confirm one-stop status.",
    ],
    MAYBE_HIGH: [
      "Bright and forward but the arousal runs higher than light comedy typically wants — reads as action-adjacent.",
      "The fun is present; the effortlessness isn't quite. Usable for an active comedic beat.",
      "Comedy-adjacent — high valence in place, but dominance reads too assertive for uncomplicated lightness.",
      "Reads as light comedy in the chorus and action-adjacent in the verses — works if the cue window catches the chorus; otherwise the energy overshoots the brief's playful register.",
    ],
    MAYBE_LOW: [
      "Positive in register but not specifically comedic — too composed or too warm for a comedy placement. B-list.",
      "The emotional direction is right; the playfulness isn't distinctive enough for the brief.",
      "Sits below the comedy band on arousal. Reads as pleasant rather than funny.",
      "Sync fee tier is reasonable and clearance is clean, but the comedic specificity isn't there — the placement would carry the scene tonally without earning the laugh. Reserve as alt.",
    ],
    FAIL_CLOSE: [
      "High valence is present but the energy is too kinetic or too subdued for a comedy scene. Misses the specific lightness.",
      "Sounds like it wants to be funny but the emotional posture is too sincere. Not a comedy cue.",
      "Wrong kind of bright — too earnest for the brief. Pass.",
      "Bright valence is present but the arrangement carries an earnestness in the vocal performance that fights the comedic register — the track means it where the brief needs it to wink.",
    ],
    FAIL_HARD: [
      "Dark, aggressive, or contemplative — the opposite of what light comedy requires. Pass hard.",
      "Emotional profile reads as dread or confrontation. The brief wants easy laughter. Do not place.",
      "Wrong hemisphere entirely. Skip.",
      "Featured vocal performance with intelligible lyrics that read sincere rather than playful — comedy placements cannot carry earnest narrative without undermining the joke. Wrong cue category.",
    ],
  },

  // ── Quirky / Offbeat ────────────────────────────────────────────────────────
  "quirky-offbeat": {
    PASS_STRONG: [
      "Mid arousal with a distinctively skewed emotional centre — sits inside the offbeat zone with character. Place.",
      "Reads as idiosyncratic: not quite warm, not quite cool, not quite anything predictable. Exactly the quirky brief.",
      "Lands in the offbeat zone on all three axes. The track has a point of view that doesn't resolve into a convention.",
      "Arrangement carries unconventional time signature or instrumentation choices that hold attention without resolving — the offbeat character is structural rather than cosmetic. Confirm one-stop.",
    ],
    PASS_SOFT: [
      "Strong quirky match — mid arousal and skewed valence both inside the brief. The character is there throughout.",
      "Offbeat posture holds. The track doesn't flatten into a conventional emotional argument.",
      "Lands in the quirky zone. A slight normalizing toward the back half doesn't erase the distinctiveness.",
      "Stems separate the idiosyncratic textural elements from the rhythmic bed — the editor can lift the personality forward at signature moments and ride underneath at others. Recommend.",
    ],
    MAYBE_HIGH: [
      "Interesting and off-centre in places but the emotional argument normalizes mid-track — loses the quirk it opens with.",
      "Adjacent to the brief: the character is gesturally present but not sustained.",
      "Gets the oddness in fragments; the through-line is too conventional for the offbeat zone.",
      "Reads as quirky in the opening eight bars and then normalizes into conventional pop structure by the chorus — the offbeat character is gestural rather than sustained across the cue window.",
    ],
    MAYBE_LOW: [
      "Mid-arousal and balanced, but the emotional character isn't distinctive enough for a quirky placement. Reads as neutral.",
      "The track sits in the right territory but doesn't say anything particular. B-list.",
      "Close to the brief's coordinates but lacking the personality that makes a quirky placement work.",
      "Adjacent to the offbeat zone on emotional argument, but the production register is too polished to read as genuinely idiosyncratic. Reserve as alt for a lighter quirky context.",
    ],
    FAIL_CLOSE: [
      "Unconventional in sound but the emotional argument resolves too cleanly for the quirky brief.",
      "Interesting texture, conventional emotional posture. Doesn't earn the offbeat label.",
      "Sits near the zone but reads as contemplative rather than idiosyncratic. Pass.",
      "Unconventional in textural choices but the arrangement resolves into a standard verse-chorus-verse structure — the quirky brief wants the form to feel as off-centre as the sound.",
    ],
    FAIL_HARD: [
      "Conventional emotional posture — triumph, grief, or pursuit. None of which the quirky brief wants. Pass.",
      "Nothing in this track's profile suggests the personality the brief requires. Skip.",
      "Reads as standard uplift or standard drama. Do not place in a quirky context.",
      "Featured vocal performance with intelligible lyrics that read straightforward and earnest — quirky placements require a tonal slipperiness this track's emotional posture refuses to carry.",
    ],
  },

  // ── Montage / Transition ────────────────────────────────────────────────────
  "montage-transition": {
    PASS_STRONG: [
      "Mid-arousal with balanced valence and neutral dominance — the montage profile solved. It doesn't impose; it carries. Place.",
      "Reads as passage of time without claiming a specific emotion. Exactly what transition cues need.",
      "Sits at the centre of the montage zone on all three axes. Will work under virtually any editorial cut.",
      "No vocal hook, no harmonic landing, and a phrase structure that loops without an audible seam — the music editor can stretch or compress the cue to any sequence length. Utility-grade transition material.",
    ],
    PASS_SOFT: [
      "Strong montage match — mid-range on all three axes, emotionally present without insisting. Recommend.",
      "Transition energy holds across the track. The neutrality is an asset, not a weakness.",
      "Lands inside the montage zone. A minor valence tilt doesn't break its utility for editorial.",
      "Loop-friendly phrase structure and no dominant harmonic resolution — the music editor can extend or trim without audible seam. Solid utility cue for a multi-scene passage.",
    ],
    MAYBE_HIGH: [
      "Mid-energy but the valence tilts warmer or cooler than a truly neutral montage needs — imposes a mood the editor may not want.",
      "Montage-adjacent: works for passages with a specific emotional colour, less useful as a universal transition.",
      "Gets close to the neutral zone; the emotional centre of gravity is present enough to limit editorial flexibility.",
      "The track has a point of view — which is a liability for a transition cue. Works if the montage is colour-matched to it; requires the editor to build the sequence toward the music rather than underneath it.",
    ],
    MAYBE_LOW: [
      "Mid-arousal is there but the emotional specificity of the track overrides its editorial utility. B-list.",
      "Would work for a montage that matches its mood. Less useful as a general-purpose transition tool.",
      "Sits at the edge of the montage zone. Usable for specific editorial contexts.",
      "Arrangement has too many focal points — button moments and melodic peaks that will pull the viewer out of the picture. A full-underscore mix or stems pass might open it up for editorial use.",
    ],
    FAIL_CLOSE: [
      "Energetically in the right range but too emotionally specific — the scene would need to match the track's mood, not the other way around.",
      "Transitions need to subordinate. This track leads. Doesn't serve the brief.",
      "The emotional argument is too strong for a neutral passage. Skip.",
      "Button ending lands on a clear tonic resolution — the arrangement closes where a transition cue needs to bleed across the cut. Structural mismatch with editorial flexibility.",
    ],
    FAIL_HARD: [
      "Too hot or too cold, too bright or too dark — the wrong emotional specificity for a montage. Pass.",
      "This is a scene-carrying track, not a transition. Wrong brief.",
      "Emotional profile is too dominant for editorial use as a passage. Do not place.",
      "Featured vocal performance with a recurring lyric hook — the track demands foreground attention rather than carrying picture beneath it. Wrong cue category entirely for a transition placement.",
    ],
  },

  // ── Opening / Closing Title ─────────────────────────────────────────────────
  "opening-closing-title": {
    PASS_STRONG: [
      "Mid-high arousal, balanced valence, confident dominance — the title sequence profile solved. Place.",
      "Reads as declaration: present, settled, and large enough to frame what follows or follow what's been said. First call.",
      "Sits at the centre of the title zone on all three axes. The track tells you it's a frame, not a scene.",
      "Stems separate cleanly into title-card-friendly layers — the editor can ride the rhythmic bed under the cast cards and lift on the show title. Confirm one-stop before broadcast commit.",
    ],
    PASS_SOFT: [
      "Strong title match — arousal and dominance both inside the target, valence holds in the neutral-warm zone. Recommend.",
      "Opening or closing energy is convincing throughout. The declarative quality holds.",
      "Lands in the title zone. A minor dominance dip below the peak doesn't disqualify it.",
      "Arrangement holds declarative weight across the thirty-to-sixty-second window a title sequence typically occupies — no audible phrase-end seam at the natural cue points. Recommend.",
    ],
    MAYBE_HIGH: [
      "Title-adjacent — has the gravitas but the arousal sits slightly above or below the title band. Works for one position but not both.",
      "The declarative quality is present; the centred balance isn't quite. Better as an opener than a closer or vice versa.",
      "Adjacent to the title zone on valence — usable with a specific cut that plays to its tilt.",
      "Reads as title-establishing in the opening eight bars and then commits to a more specific emotional argument — works for an opening title but not a closing one, where the brief expects reflection.",
    ],
    MAYBE_LOW: [
      "Settled and present in register but not declarative enough for a title sequence. B-list.",
      "The emotional posture is right in direction; the confidence isn't there at the required magnitude.",
      "Sits below the title band on arousal. Reads as introductory rather than establishing.",
      "Sync fee tier is reasonable and master clearance is clean, but the declarative weight isn't enough to frame a tentpole title sequence. Reserve for an interstitial card or chapter break.",
    ],
    FAIL_CLOSE: [
      "Has the weight but the emotional argument is too specific — reads as drama rather than frame.",
      "Declarative in places but the trajectory rises or falls when a title sequence needs to hold.",
      "Interesting but not establishing. Doesn't serve the title brief.",
      "Has formal composition but the emotional argument is too narratively specific — reads as scored cue rather than title frame. The brief wants establishing weight, not scene weight.",
    ],
    FAIL_HARD: [
      "Too kinetic, too dark, or too intimate for a title sequence. Wrong brief.",
      "Emotional profile reads as scene-interior rather than frame. Do not place at open or close.",
      "This is an underscore track, not a title track. Pass.",
      "Featured vocal performance with intelligible lyrics — title sequences carry credit information that competes with foreground language. Wrong cue category for the placement regardless of weight.",
    ],
  },

  // ── Cinematic / Epic ────────────────────────────────────────────────────────
  "cinematic-epic": {
    PASS_STRONG: [
      "High-arousal with maximum dominance and balanced valence — the cinematic epic profile solved. Place.",
      "Reads as large-scale consequence: sweeping, assured, and formally composed. First call for broadcast and trailer.",
      "Sits at the centre of the cinematic zone on all three axes. The track knows it's for the big screen.",
      "Stems separate orchestral layers from percussive bed — the music editor can pull the brass forward for the hero shot and ride the strings under dialogue. Confirm one-stop before trailer commit.",
    ],
    PASS_SOFT: [
      "Strong cinematic match — dominance and arousal both inside the target, valence holds in the neutral zone. Recommend.",
      "Epic scale is convincing throughout. The formal composition holds across the track.",
      "Lands inside the cinematic zone. A minor valence tilt doesn't break the scale.",
      "Arrangement holds large-scale composition across the full cue window without an audible structural seam — the editor can cut to any sequence length without managing a forced landing.",
    ],
    MAYBE_HIGH: [
      "Large in character but the emotional argument is too specific — reads as triumph or drama rather than cinematic scale.",
      "Cinematic-adjacent: the size is there, the neutrality isn't. Useful for a specific scene, not a general epic placement.",
      "Gets the scope; loses the formal composition that cinematic cues require to work across editorial contexts.",
      "Reads as cinematic in the orchestral passages but the arrangement breaks to a chamber texture at the bridge — works for a specific scene but loses the formal scale across the full cue.",
    ],
    MAYBE_LOW: [
      "Ambitious in register but the dominance or arousal falls short of the cinematic ceiling. B-list.",
      "The emotional direction is right; the magnitude doesn't reach the brief's scale requirement.",
      "Sits below the cinematic band on dominance. Reads as dramatic rather than epic.",
      "Master clearance is straightforward but the dominance falls short of trailer or broadcast cinematic placement — the rights are easier than the editorial argument justifies. Reserve as alt.",
    ],
    FAIL_CLOSE: [
      "Large sound but the emotional argument is too intimate or too specific for a cinematic placement.",
      "Has scale without scope. Doesn't serve the brief.",
      "The track works for a scene; the brief asks for something that carries multiple scenes.",
      "Has orchestral instrumentation but the emotional argument is too specifically dramatic to function as broad cinematic scale — reads as scored scene rather than establishing epic frame.",
    ],
    FAIL_HARD: [
      "Intimate, low-arousal, or emotionally specific — the wrong coordinates for a cinematic epic. Pass.",
      "Emotional profile reads as romance or grief. The brief wants scale and declaration. Do not place.",
      "Wrong brief entirely. Skip.",
      "Featured vocal performance with intelligible lyrics narrating a personal story — cinematic epic placements require formal scale that vocal-led arrangements cannot carry. Wrong cue category.",
    ],
  },

  // ── Corporate / Aspirational ────────────────────────────────────────────────
  "corporate-aspirational": {
    PASS_STRONG: [
      "Mid-high arousal with warm-to-neutral valence and confident dominance — the corporate aspirational profile solved. Place.",
      "Reads as forward motion with purpose: not triumphant, not dark, but going somewhere with conviction. First call.",
      "Sits at the centre of the aspirational zone. Clean, composed, and commercially transferable.",
      "Master ownership is confirmed, sync fee tier suits commercial placement, and the arrangement carries no controlled comp restrictions complicating brand-adjacent use. Clean rights, clean register.",
    ],
    PASS_SOFT: [
      "Strong corporate match — arousal and valence both inside the target, dominance holds at the right confidence register.",
      "Aspirational energy is convincing. The track doesn't distract; it underscores forward motion.",
      "Lands inside the corporate zone. A minor valence fluctuation doesn't undermine its utility.",
      "Stems separate cleanly into a rhythmic bed and a melodic line — the editor can ride the bed under voice-over and lift on the visual hero moments. Confirm one-stop before commit.",
    ],
    MAYBE_HIGH: [
      "Aspirational in character but the emotional argument tilts too specific — reads as triumph or celebration rather than purposeful momentum.",
      "Adjacent to the brief: the confidence is present, the controlled register isn't. Too expressive for corporate use.",
      "Gets the forward motion; the tonal character is too idiosyncratic for a broadly commercial placement.",
      "Reads as corporate aspirational in the chorus but the verses carry an emotional specificity that reads scored rather than commercial — works for a cue window matched to the chorus.",
    ],
    MAYBE_LOW: [
      "Positive in register but too mild or too neutral for an aspirational placement. Reads as background rather than motivation.",
      "The emotional direction points right; the presence isn't enough to carry a corporate context.",
      "Sits below the aspirational band on arousal. Reads as pleasant rather than purposeful.",
      "Sync clearance is straightforward and the rights are clean, but the track's emotional argument is too neutral to motivate a corporate narrative. Reserve as background underscore.",
    ],
    FAIL_CLOSE: [
      "Positive valence is present but the emotional posture is too intimate or too passive for corporate use.",
      "Forward motion is absent — the track settles when it should be building.",
      "Too emotionally specific for a commercial context. Not a corporate cue.",
      "Warm valence and forward motion are present but the arrangement carries an idiosyncratic textural choice that reads artist-statement rather than brand-transferable. Wrong register for commercial placement.",
    ],
    FAIL_HARD: [
      "Dark, aggressive, or contemplative — the wrong coordinates for aspirational placement. Pass.",
      "Emotional profile reads as dread or confrontation. The brief wants momentum and confidence. Do not place.",
      "Nothing in this track's posture transfers to a commercial context. Skip.",
      "Featured vocal performance with intelligible lyrics narrating a personal narrative — corporate aspirational placements cannot carry foreground language that competes with brand voice-over. Wrong category.",
    ],
  },

  // ── Nature / Pastoral ───────────────────────────────────────────────────────
  "nature-pastoral": {
    PASS_STRONG: [
      "Low arousal, warm valence, yielding dominance — the pastoral profile solved without a forced note. Place.",
      "Reads as landscape rather than event: expansive, unhurried, and observational. Exactly what the brief asks for.",
      "Sits at the centre of the pastoral zone on all three axes. Supervisors keep tracks like this on permanent hold.",
      "Stems break down to a single melodic line at the close — the music editor can pull to that line for the wide landscape shot and rebuild for the cut to character. Confirm one-stop before commit.",
    ],
    PASS_SOFT: [
      "Strong pastoral match — warm valence and low arousal both inside the brief. Holds the open-air quality across the track.",
      "Nature-adjacent energy is convincing. The track breathes rather than moves.",
      "Lands in the pastoral zone. A minor arousal lift doesn't break the unhurried character.",
      "Arrangement holds the open-air quality across the full cue window without an audible structural seam — the editor can cut to any sequence length without a forced landing. Recommend.",
    ],
    MAYBE_HIGH: [
      "Warm and unhurried but the arousal runs slightly above the pastoral zone — reads as contemplative rather than landscape.",
      "Adjacent to the brief: the openness is present, the stillness isn't quite. Usable for a nature-in-motion moment.",
      "Gets the warmth; loses the spaciousness. Needs a specific cue window to make it work.",
      "Reads as pastoral in the opening but introduces a rhythmic figure at the midpoint that pulls the cue into motion — works for a nature-into-narrative transition but not sustained landscape.",
    ],
    MAYBE_LOW: [
      "Gentle in register but not specifically pastoral — could underscore a variety of quiet scenes. B-list.",
      "The emotional direction points toward the brief; the expansive quality isn't distinctive enough.",
      "Sits below the pastoral band on valence. Reads as ambient rather than landscape.",
      "Master clearance is straightforward and the rights profile is clean, but the expansive quality isn't enough to carry a sustained landscape sequence. Reserve as alt for a transitional pastoral beat.",
    ],
    FAIL_CLOSE: [
      "Warm valence is present but the track is too rhythmically forward for a pastoral placement. Moves when it should breathe.",
      "Gentle in texture but the emotional argument is too interior for an exterior landscape cue.",
      "Gets close on arousal; the valence sits too cool for warm-air pastoral. Not the brief.",
      "Warm valence is present but the arrangement carries a percussive bed that reads urban or commercial rather than pastoral — the rhythmic specificity fights the open-air brief.",
    ],
    FAIL_HARD: [
      "Kinetic, dark, or aggressive — the opposite of what pastoral requires. Pass hard.",
      "Emotional profile reads as urban grit or confrontation. The brief wants open air. Do not place.",
      "Wrong emotional world entirely. Skip.",
      "Featured vocal performance with intelligible lyrics narrating a character-interior arc — pastoral placements function as landscape underscore that vocal-led arrangements cannot carry. Wrong category.",
    ],
  },

};

// ---------------------------------------------------------------------------
// Selection helpers — exported so analysis.ts and demo.ts can use the same
// narrative system as scores.ts without duplicating the logic.
// ---------------------------------------------------------------------------

import { createHash } from "crypto";

export function verdictFor(sceneFit: number): Verdict {
  if (sceneFit >= 80) return "PASS_STRONG";
  if (sceneFit >= 70) return "PASS_SOFT";
  if (sceneFit >= 60) return "MAYBE_HIGH";
  if (sceneFit >= 50) return "MAYBE_LOW";
  if (sceneFit >= 40) return "FAIL_CLOSE";
  return "FAIL_HARD";
}

/**
 * Deterministically select a narrative phrase for (trackId, briefId, sceneFit)
 * and append a parenthetical audio-feature suffix with the track's actual
 * tonal character, energy character, and BPM.
 *
 * Hash key: sha256(`${trackId}:${briefId}:${verdict}`) so the same
 * track+brief+tier always yields the same phrase.
 */
export function buildBriefNarrative(
  trackId: string,
  briefId: string,
  sceneFit: number,
  track: { tempo: number | null; tonalCharacter: string | null; energyCharacter: string | null },
): string {
  const brief = NARRATIVE_DICTIONARY[briefId];
  if (!brief) {
    return `sceneFit=${sceneFit} — brief narrative unavailable for "${briefId}"`;
  }
  const verdict = verdictFor(sceneFit);
  const pool = brief[verdict];
  const h = createHash("sha256").update(`${trackId}:${briefId}:${verdict}`).digest("hex");
  const phrase = pool[parseInt(h.slice(0, 8), 16) % pool.length];

  const parts = [
    track.tonalCharacter ?? "",
    track.energyCharacter ?? "",
    track.tempo != null ? `${Math.round(track.tempo)} BPM` : "",
  ].filter(Boolean);
  const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";

  return `${phrase}${suffix}`;
}
