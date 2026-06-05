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

import { createHash } from 'crypto';
import { WEIGHTS } from './trackVector';
import type { TrackVector } from './trackVector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tier = 'PASS' | 'MAYBE' | 'FAIL';

/**
 * Taxonomy decision — Option A (axis-mirroring lanes):
 *   scene   → PAD / tonal / emotional mismatch  (scene axis)
 *   lyrics  → arrangement / content / structure mismatch (lyrics axis)
 *   rights  → clearance friction                (rights axis)
 *
 * Positional convention in FAIL pools:
 *   [0,1] → 'scene'   [2,3] → 'lyrics'   [4,5] → 'rights'
 */
export type LaneTag = 'scene' | 'lyrics' | 'rights' | 'clearance';

export interface FailPhrase {
  text: string;
  lane: LaneTag;
}

export interface BriefPool {
  PASS:  string[];
  MAYBE: string[];
  FAIL:  FailPhrase[];
}

export interface PADValues {
  arousal: number;
  valence: number;
  dominance: number;
}

export interface TrackMeta {
  tempo?: number | null;
  tonalCharacter?: string | null;
  energyCharacter?: string | null;
  artistName?: string | null;
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
      "Bass pulse enters immediately and never lets up; the arrangement withholds the downbeat resolution every eight bars, which lets the editor land hard cuts on the suspended beat. Dominance reads cold and procedural — the track stalks the picture rather than chasing it.",
      "Rhythmic propulsion is built from a single repeated cell, so the music editor can lift any sixteen-bar block and loop it under extended coverage without phrase-end artifacts. Underscores without competing, leads the cut on every corner-turn.",
      "Spectral weight sits in the 80–250 Hz pocket where dialogue does not live, which means the cue can run hot under footfall foley and radio chatter without ducking. Arousal ceiling is high but the harmonic floor never settles — exactly what sustained-threat coverage needs.",
      "The breakdown into verse 2 strips back to kick and breath, giving the editor a natural reset point before the third-act escalation. Clears for trailer use under the same brief and the stems separate cleanly for a music-editor-driven recut.",
      "Tonal palette stays in a narrow modal window — no major-key reprieve anywhere in the arrangement — so the cue carries pursuit energy without ever signaling escape. Yields to dialogue when the protagonist speaks at the transit-stop beat and lifts again on the cut to the rooftop.",
      "Percussion arrangement is polyrhythmic — two independent rhythmic layers that never fully align — which gives the editor freedom to cut on any downbeat without creating a phrase-end seam. Pursuit energy reads continuous regardless of where the picture cuts.",
      "Harmonic language is suspended throughout: the root position chord is never stated, only implied. That suspended quality keeps the threat unresolved across scene transitions without the cue announcing a new section.",
      "Mid-range sits clear of the two-way radio and dispatch dialogue band — the cue can compete with foley at full level without ducking through the foot-pursuit sequence. Mix hierarchy is chase-grade.",
      "Dynamic arc builds gradually without a sudden peak, which means the editor has no moment where the music announces the action to come. The escalation is felt rather than telegraphed.",
      "Stems divide cleanly into rhythm and atmosphere layers — the music editor can push the rhythmic elements hard under kinetic cuts and pull back to atmosphere under the hide-and-seek beat without any re-edit.",
      "The cue has no tonic landing anywhere in its full duration — the arrangement treats harmonic resolution as the thing being withheld, which is exactly the grammar of a scene whose outcome is still in doubt.",
    ],
    MAYBE: [
      "Forward momentum is intact through the verse but the chorus opens up too much harmonic space — the editor will need to ride the level down or cut around the lift to keep the threat sustained. Worth a music-editor pass before commit.",
      "Rhythmic engine works under the foot chase, but the early vocal entry will compete with any radio-dispatch dialogue layered over the picture. Pull an instrumental version from the artist's stems before locking the cue.",
      "Propulsion arrives, but it arrives late — first thirty seconds are atmosphere before the pulse kicks in. Acceptable if the chase has a slow-burn ramp; non-viable if the cue has to hit the ground running on the act-two button.",
      "Arrangement leadership is right for sustained dread, but the outro decay resolves to a tonic, which undercuts a chase that should bleed into the next scene. Ask the artist for an alt mix that loops without that landing.",
      "Dynamic arc tracks the scene's escalation cleanly through the second act, but the dominance reads slightly heroic in the bridge — the protagonist is being hunted, not winning. Editorial call on whether the hopeful color is a feature or a leak.",
      "The drop in the back third is built for trailer impact, not episodic underscore — it will telegraph the cut before the editor is ready to land it. Could work for a feature trailer pass; needs a longer underscore version for the show.",
      "Energy floor is right but the cue's structure has a clear verse-chorus boundary that the editor will hear — chase coverage needs the music to feel continuous; this one has a visible seam at the section change.",
      "Rhythmic propulsion works through the mid-section but the arrangement loses momentum in the bridge before rebuilding — if the chase has a pause beat there, that gap is a feature; if it needs to hold energy, the drop is a problem.",
      "Threat level is calibrated correctly but the mix is noticeably front-weighted, which means it will compete at any level where the foley and dispatch track are active. Stems pull or a low-end lift before commit.",
      "Pursuit energy holds but the cue's loop point sits at a phrase boundary that may create an audible seam if the scene is longer than the arrangement. Confirm the music editor has a clean loop before locking picture.",
      "Chase propulsion is real but the outro has a decisive button that resolves the cue — if the chase continues past the music's end, there is no graceful exit. Extended mix or alternate ending before commit.",
      "Tonal color supports the brief but the synth patch choice dates the production sound to a specific era; works for a period-coded thriller, reads anachronistic in a contemporary production. Director-level call.",
    ],
    FAIL: [
      { text: "Valence sits too warm for sustained threat — the major-key turnaround in the chorus reads as relief, which collapses the pursuit tension the scene is trying to hold. Wrong emotional dimension for a no-resolution chase.", lane: 'scene' },
      { text: "Arousal arc peaks too early and resolves into a coda past the midpoint, leaving the back half of the cue without forward propulsion. A chase brief needs the engine to hold; this track empties the tank before the picture does.", lane: 'scene' },
      { text: "Forward propulsion collapses at the close — the track's decisive button ending resolves the scene rather than holding it in motion, and a chase brief demands a cue that bleeds across boundaries rather than punctuates them. Arousal should stay unresolved where the picture cuts; this one lands.", lane: 'scene' },
      { text: "Vocal hook lands inside the first eight seconds and recurs every sixteen bars, which eliminates this from any pursuit coverage where dialogue or radio comms are layered on top. Instrumental version would reopen the conversation but the vocal-driven arrangement is the song.", lane: 'lyrics' },
      { text: "The lyric carries a narrative weight that pursuit coverage cannot absorb — a vocal-forward arrangement means the audience reads the song's story rather than feels the scene's threat, and without an instrumental alt the cue competes for narrative foreground in a brief that needs music to disappear behind the edit.", lane: 'lyrics' },
      { text: "Co-write split between three writers with one share still in copyright control makes this non-viable for episodic licensing on an accelerated post timeline. Revisit when master and publishing align under single administration.", lane: 'rights' },
      { text: "Master is controlled by a label with a standing trailer-only carve-out and an MFN flag against any episodic placement at the agreed rate card. Pre-clear conversation would need to happen at executive level before the cue is even pitched.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 2. ACTION / COMBAT — Climactic fight or set piece, maximum arousal
  // -------------------------------------------------------------------------
  "action-combat": {
    PASS: [
      "Full arrangement lands on a clear structural downbeat with the brass stack and taiko hits aligned to the same hit point — the cue is built to be cut to, and it gives the editor a legitimate landing surface for the climactic blow. Trailer-grade impact, episodic-clean structure.",
      "Arousal ceiling matches the set piece without overshooting the picture; the cue earns its peak through three-act build rather than front-loading the bombast. Drives the cut without dictating it through the second-floor breach.",
      "Hybrid orchestral bed with rhythmic synth layer gives the music editor independent control of percussion and harmonic content via the stems — flexible enough to ride under sound design through the set piece's impact peak.",
      "Modulation up a half step at the final chorus return functions as the kill-shot cue; the editor can park the picture's biggest hit on that lift and let the music close the scene. Lands the turn cleanly.",
      "Sustained brass writing in the climax sits above the dialogue band and below the impact-FX band, so the mix translates intact into broadcast loudness targets without fighting the sound design. Clears for theatrical and streaming windows.",
      "Button ending resolves with one final hit — exactly what a set-piece climax needs to punctuate before the cut to aftermath. Candidate for end-credits reprise as well as the action peak itself.",
      "Percussion grid is dense but not uniform — syncopated hits give the editor cut points that feel motivated by the music without forcing picture to follow a fixed rhythm. Action coverage that adapts to the edit rather than dictating it.",
      "Arrangement has a clear trough between the first and second act climax, which gives the editor a natural location for a reaction shot or a tactical pause before the music reloads for the final push.",
      "Spectral weight stays wide throughout — low-end thump, mid-frequency aggression, and a high string line — so the mix translates from theatrical 5.1 to a streaming-grade stereo fold without losing the sense of scale.",
      "The cue treats silence as percussion: the half-bar cutout before the final hit is a musical decision, not an accident, and the editor can align that window with a single decisive moment in the set piece.",
      "Rhythmic grid locks to a consistent tempo without any ritardando or feel fluctuation, which means picture can be cut to any beat of the bar for the full duration. Action-grade metric precision.",
      "Impact layer sits in the 150–300 Hz range where a sound designer's punch hits land — the music and the effects are designed to reinforce rather than mask each other. Mix hierarchy is collaborative at the fight-beat level.",
    ],
    MAYBE: [
      "Peak arrives at the right intensity, but the build through the first verse is too patient for a fight scene that opens at speed — the editor will be fighting the cue's pacing through the first thirty seconds. Pre-roll trim or alt edit needed.",
      "Spectral weight is right for the climax but the mid-range gets crowded once the chorus stack arrives — will need a careful dialogue duck or a stems pull to keep the hero's line intact under the hit.",
      "Forward momentum is real through the bridge, but the arrangement drops out for a half-bar mid-section and that gap will collide with whatever sound-design hit the editor wants to land there. Music editor call.",
      "Dominance reads aggressive enough for the brief, but the harmonic language tilts toward triumph before the fight is decided — works only if the protagonist is winning the exchange in cut. Editorial decision on which beat the cue is scoring.",
      "Vocal entry at the second chorus is a strong moment but it commits the cue to a specific emotional read; if the set piece has a tonal pivot inside the music, that vocal becomes a problem. Instrumental alt would resolve.",
      "Drives the cut hard but the tail runs short and the scene as locked needs another twenty-five seconds of energy — needs an extended mix or a music-editor loop before commit.",
      "Climactic energy is present but the cue front-loads its peak — maximum arousal arrives in the first third, and the rest of the arrangement is effectively a sustained plateau that the editor cannot use to mark escalation.",
      "Percussion layer is strong but the programmed kit's room sound sits in an acoustic context that may not match the set piece's recorded foley environment. Music editor should audition at the dub stage before locking.",
      "Set-piece grade intensity but the harmonic language is uncomplicated major-key throughout — if the fight outcome is in doubt, the cue's confident register pre-resolves the tension the picture is trying to hold.",
      "Action energy translates but the cue's arrangement makes a clear distinction between verse and chorus that may surface a read-through moment if the scene has dialogue between impacts. Stems separation before commit.",
      "Impact hits are well-placed but the arrangement's natural phrase length is twelve bars, which does not divide evenly against most action editing patterns. Music editor will need to identify non-obvious cut points.",
      "Climax-grade production but the low-end is mixed hot in a way that will trigger loudness normalization on streaming delivery — the set piece's biggest hit will be the quietest moment on the platform. Re-master check.",
    ],
    FAIL: [
      { text: "Arousal floor sits below what the set piece is asking for — the cue gestures at climax intensity but never fully commits to it, leaving the picture carrying the arousal alone. Wrong dimension for a maximum-arousal brief.", lane: 'scene' },
      { text: "Valence reads heroic-uplifting throughout, which works for a victory beat but undercuts a fight scene where the outcome is in doubt. The major-third resolution every eight bars eliminates the danger the picture is trying to sell.", lane: 'scene' },
      { text: "Arousal hits a ceiling and holds — the verse-chorus-verse structure plateaus where the set piece is asking the music to escalate, and a maximum-arousal brief demands a cue with a climactic third act. The arrangement's shape cannot deliver the peak the picture is building toward.", lane: 'scene' },
      { text: "Arousal cannot be sustained for the scene's full runtime — the track runs short of what the set piece requires and does not loop cleanly past the second chorus, which means the music drops out before the picture does. A maximum-arousal brief cannot absorb a silence in its climactic sequence.", lane: 'scene' },
      { text: "Explicit vocal content on the master version marks the track as restricted for broadcast and most streaming delivery contexts — the set-piece brief lives in multi-territory network clearance windows that require a clean or instrumental version, and the artist has not supplied one. Lyric clearance is the gate, not the sync fee.", lane: 'lyrics' },
      { text: "The track's vocal-forward mix puts the topline in the same band as audio commentary and fight-call ADR layered over the set piece — the energy is right but the vocal cannot be ducked without gutting what makes the cue work. A maximum-arousal brief that carries a lyric needs an instrumental version ready at the music-editor stage; this one does not have it.", lane: 'lyrics' },
      { text: "Sample clearance on the breakbeat under the second drop is unresolved at the source — pre-clear conversation has been open with the original publisher for six weeks with no movement. Non-viable on the current post timeline.", lane: 'rights' },
      { text: "One-stop status flagged false on intake — composition shares are split four ways with one writer in copyright control at PRS. Festival window placement might survive the risk; broadcast clearance will not.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 3. HEARTBREAK / SEPARATION — Retrospective, passage of time, bittersweet
  // -------------------------------------------------------------------------
  "heartbreak-separation": {
    PASS: [
      "Arrangement builds additively from a minimal verse bed — exactly the kind of layering that lets the editor drop in cuts on every fourth bar without the music protesting. Yields to dialogue throughout and lifts naturally on the emotional turn.",
      "Tonal palette stays in a single modal color across three minutes, which means the montage can compress a decade of relationship beats without the cue announcing scene transitions. Underscores without competing.",
      "Vocal entry in the first verse brings emotional residue to the back half — the lyric is general enough to read as character interiority over almost any retrospective coverage. Clears for episodic; viable under closing-act montage.",
      "Dynamic arc lifts gently into the chorus and pulls back for the bridge, giving the editor two clean emotional gear changes inside one cue. Lands the turn on the bittersweet beat without sentimentalizing it.",
      "Arrangement leadership is shared between piano and a single vocal line, which keeps the mix hierarchy uncluttered and lets the editor ride the level under voiceover or letters-from-home dialogue. Strong candidate for a long-form retrospective sequence.",
      "Outro decay holds an unresolved suspended chord — the cue ends without closure, which is the right register for a montage that is asking the audience to sit with what was lost. Candidate for end-credits run-out.",
      "The verse has a deliberate metric fragility — phrases of unequal length that resist the editor's instinct to cut on the downbeat. That irregularity is the cue's emotional argument: the relationship didn't end on schedule.",
      "Harmonic motion circles the tonic without resolving, which means the bittersweet register is structural rather than stylistic — the cue cannot inadvertently slip into comfort regardless of how loudly it is mixed.",
      "Instrumentation choices are season-neutral: no sleigh bells, no summer reverb — the retrospective can cover any calendar window without the music placing the story in a specific time of year.",
      "Vocal dynamic tracks the melodic line rather than the words, so the lyric's meaning recedes and the emotional texture moves forward. Character interiority without lyric specificity — viable across almost any retrospective coverage.",
      "Bridge strips to solo instrument and recovers — the emotional collapse and return inside a single cue mirrors the retrospective's own arc and gives the editor the picture's saddest moment already scored.",
      "Arrangement uses a single recurring melodic figure that appears in different instrumental colors at each return — a callback structure the music editor can use to mark time-jumps without the music stating them directly.",
    ],
    MAYBE: [
      "Bittersweet color is there in the harmony, but the tempo at {tempo} BPM is faster than the cut wants — the editor will either need a half-time edit or to compress the montage pacing. Music-editor handoff before commit.",
      "Lyric content lands on a specific narrative — names a place and a season — which works for a brief that aligns with that imagery and competes with one that does not. Read the lyric sheet against locked picture before saying yes.",
      "Emotional residue is present and the arrangement breathes correctly, but the chorus modulation up a whole step telegraphs uplift that may overshoot a retrospective beat that is still landing on loss. Editorial call.",
      "Forward momentum is correct for time-passing but the cue builds to a peak in the closing section and stays there — montage as cut probably resolves earlier. Needs a shorter mix or an early fade point.",
      "Tonal color is right but the mix has a bright vocal that sits forward against any voiceover the picture is carrying. Instrumental version would reopen the cue for V/O coverage; with the vocal it competes.",
      "Cue is structurally sound for the brief but the publishing split flag in metadata indicates a co-writer who has historically pulled approval on retrospective uses. Pre-clear before the editor commits picture to it.",
      "Emotional register is right but the arrangement is dense enough that the music editor will need to ride the level manually to make room for scene-specific audio. Confirm stems are available before commit.",
      "Bittersweet color holds through the verse but the arrangement's second half develops a momentum that reads more forward-looking than retrospective. Editorial call on whether the shift serves the montage's arc.",
      "The cue's emotional peak is well-placed but it arrives before the picture's own climactic beat — the music editor will need to stretch the opening section or find a pre-roll to align the two high points.",
      "Tonal restraint is present in the writing but the production has a commercial-release sheen that places the track in a contemporary pop context; older catalog entries might serve a retrospective with deeper time scope. Placement call.",
      "Emotional residue lands but the cue's verse-chorus structure has a clear expectation baked in — the music sets up a release every eight bars, and a retrospective beat that needs continuous tension will fight that expectation.",
      "Register and color serve the brief but the master was used in a competitor streaming show's finale within the past eighteen months — sonic-recognition risk for an audience that watched that season. Pre-clear with the team.",
    ],
    FAIL: [
      { text: "Valence sits too sweet — the harmonic resolution every four bars closes off the bittersweet ambivalence the brief is asking for. Retrospective coverage needs ache; this cue offers comfort.", lane: 'scene' },
      { text: "Arousal arc rises into a celebratory peak, which collides with a montage that is meant to trace the slow erosion of something rather than its triumph. Wrong emotional shape for the brief, regardless of arrangement quality.", lane: 'scene' },
      { text: "Emotional register closes where the brief asks it to stay open — the hard stop at the structural close offers the audience a clean landing that retrospective montage specifically withholds, and there is no fade alt to recover the unresolved texture the scene needs. The arrangement ends where the grief should still be held.", lane: 'scene' },
      { text: "Vocal lyric explicitly references a specific relationship outcome that contradicts the narrative the montage is editing toward. The song has its own story and it is not the story the picture is telling.", lane: 'lyrics' },
      { text: "Retrospective montage depends on vocal weight receding when the scene carries its own emotional peak — the arrangement puts the topline forward throughout and no instrumental mix is available in the catalog. The lyric does not contradict the picture's narrative, but vocal density prevents the music from yielding when the edit needs silence.", lane: 'lyrics' },
      { text: "Master is controlled by an estate that has historically declined retrospective and in-memoriam uses without significant fee escalation and creative review. The post timeline does not accommodate that conversation.", lane: 'rights' },
      { text: "Track contains an uncleared interpolation of a 1970s standard whose publisher administration is fragmented across three territories. Pre-clearance on the underlying composition is the gating issue, not the master.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 4. ROMANCE / INTIMACY — Two characters, close proximity, vulnerability
  // -------------------------------------------------------------------------
  "romance-intimacy": {
    PASS: [
      "Arrangement is two elements — fingerpicked guitar and a breath-close vocal — and that intimacy of arrangement matches the proximity the scene is asking for. Yields to dialogue completely; the cue knows when not to be heard.",
      "Vocal sits right on the threshold of breath, so the cue carries vulnerability without leaning on lyric specificity. Underscores without competing through quiet coverage and yields completely when the scene needs space for performance.",
      "Tonal palette is warm and narrow, dominated by a single tape-saturated keyboard that occupies the same register as a soft-spoken line — the music sits with the characters rather than around them. Clears for episodic on a standard rate.",
      "Dynamic floor is genuinely quiet — the cue holds at a level where it would never need to be ducked under whispered dialogue. Mix hierarchy gives the picture full ownership of the emotional foreground.",
      "The arrangement adds a single sustained element at the structural midpoint and withdraws it before the final section — giving the editor one clean emotional lift without the cue overstaying. Lands the turn quietly.",
      "Outro decay holds a single sustained note, letting the editor extend quiet coverage without cutting the cue artificially. Strong candidate for a callback placement later in the episode arc as well.",
      "Harmonic language is unhurried — the harmonic rhythm changes every four bars at most — so the music does not pace the scene. The characters dictate the rhythm; the cue follows.",
      "The cue's instrumentation is acoustically intimate: close-mic'd strings, finger noise audible on the guitar neck, breath in the vocal. That production choice translates as physical proximity regardless of how the scene is blocked.",
      "Dynamic range across the cue is genuinely wide: from near-inaudible at the verse floor to a moderate-presence chorus. That full range is available to the music editor as a mixing tool without any re-edit.",
      "Melody is through-composed with no repetition — the cue does not have a hook the audience will latch onto over the performance. Emotional texture without melodic distraction.",
      "Lyric stays in the second person throughout and the referent is never named — the song could be addressed to anyone the viewer projects onto it. Placement-flexible for a wide range of romantic coverage.",
      "Arrangement leaves one to two bars of instrumental space after each vocal phrase — micro-gaps where the editor can extend if the picture needs a beat of silence without cutting the cue.",
    ],
    MAYBE: [
      "Intimacy is present in the verse but the chorus opens the arrangement up to a full band — that scale change will pull the audience out of the proximity the scene has built. Edit out of the chorus or pull an alt mix.",
      "Arousal floor is correct for vulnerability but the harmonic content is more confident than the scene wants — the dominance reads slightly performative rather than fragile. Editorial call on the character read.",
      "Vocal is breath-close in the verse but the lyric explicitly addresses a third party, which works for a longing scene but competes with a two-hander that is meant to be entirely between them. Read the lyric against blocking.",
      "Arrangement leadership shifts to drums at the chorus entry, which breaks the intimacy of the opening section. Acceptable if the scene has a tonal pivot at that moment; otherwise needs an instrumental alt without the kit entry.",
      "Tonal color is right for the brief but the cue runs well past the scene's available window — long-form arrangement does not compress into the available real estate without losing its emotional shape. Music-editor recut required.",
      "Vulnerability lands in the writing, but the master mix is bright and forward in a way that competes with whispered ADR. Worth requesting a stems pull so the music editor can darken the top end before commit.",
      "Proximity register is present but the cue's tempo is slightly up for a scene where the blocking is stationary — the forward momentum introduces an urgency that an intimate two-hander is not asking for. Half-time edit or alt.",
      "Warmth is real but the production has a commercial-release brightness that places the cue in a recognizable contemporary pop register — some proximity scenes benefit from that contemporaneity, others need the music to feel anonymous.",
      "Arrangement is intimate in the verse but the backing vocal in the closing section adds a second voice that may pull the audience out of the two-hander's singular focus. Stems pull to mute the BV before commit.",
      "Dynamic floor is quiet enough for most proximity coverage, but the master's loudness ceiling means it will need to be rode down across the full scene. Confirm the music editor's timeline before locking.",
      "Emotional softness is present but the cue's phrase endings have a clear resolution that may not match a scene that is meant to leave the relationship unresolved at the cut. Alt ending or edit-out point needed.",
      "Instrumental color is right but the cue's harmonic vocabulary has a slightly theatrical quality — more stage musical than film — that may read as stylized to audiences tuned to naturalistic placement choices.",
    ],
    FAIL: [
      { text: "Arousal sits too high for proximity — the rhythmic engine pushes the cue forward when the scene needs the music to hold still. Wrong dimension for a brief built on stillness and breath.", lane: 'scene' },
      { text: "Valence reads sunny throughout, which collapses the vulnerability axis — intimacy requires a degree of emotional risk that uncomplicated brightness cannot carry. The cue is happy in a way the scene cannot afford to be.", lane: 'scene' },
      { text: "Dynamic register is wrong for proximity — the mastering drives the cue loud and forward by construction, which means at every playback level the music competes with quiet dialogue rather than yielding to it. Intimacy requires music that recedes; this master cannot.", lane: 'scene' },
      { text: "Explicit-flagged content disqualifies the master from any proximity scene where the broadcast standard is family or premium cable — the brief specifies intimate coverage delivered across every window in the license, and the cue's explicit flag makes that impossible without a clean version the catalog record does not confirm is available.", lane: 'lyrics' },
      { text: "Lyric delivery is word-dense throughout — the vocal occupies every beat of the bar, leaving no breath space in the arrangement for the quiet performance the intimacy scene is built around. Vocal-forward density eliminates the cue from any proximity use where the picture needs the music to yield.", lane: 'lyrics' },
      { text: "Master ownership sits with a label whose intimacy-scene clearance history includes a public objection to a recent placement that the artist's team felt was exploitative. Reputational risk on top of fee risk.", lane: 'rights' },
      { text: "Composition is registered to a sub-publisher in one territory and to the original writer in another, with no MFN agreement bridging them. Worldwide clearance on the post timeline is not realistic.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 5. EMOTIONAL RESOLUTION — Relationship arc compressed, warmth, longing
  // -------------------------------------------------------------------------
  "emotional-resolution": {
    PASS: [
      "Verse-chorus-verse arrangement maps cleanly onto a multi-stage relationship montage — each structural section gives the editor a natural landing beat to align with the sequence's emotional turns. Drives the cut without dictating it.",
      "Warmth is in the instrumentation and longing is in the topline melody, which keeps reaching for a resolution it doesn't quite land. Yields to dialogue wherever the scene leads; the music waits rather than fills.",
      "Tonal palette holds across the relationship arc without modulating away from its emotional center, so the montage can compress eighteen months without the cue announcing scene changes. Clears for episodic on standard terms.",
      "The lift at the bridge is the cue's emotional peak and it aligns naturally with whatever the picture wants to make the centerpiece of the sequence. Gives the editor one high-value beat to weight without forcing it.",
      "Vocal entry establishes the emotional register early and the lyric stays general enough across the verse-chorus structure to read as either character's interiority. Strong candidate for a recurring callback in episode arc.",
      "Outro decay fades on a suspended chord rather than resolving — leaves the relationship in question, which is the right register for a montage that is setting up a later turn. Candidate for end-credits as well.",
      "The cue resolves its harmonic tension exactly once — in the final bar — which means the editor can use that moment as the picture's own payoff beat. Everything before it is anticipation; the resolution is a tool.",
      "Arrangement restraint is structural: the cue was written to leave space, not to fill it. The music serves the edit because the composer understood that a montage's meaning lives in the cuts, not the music.",
      "Warmth is carried by the mid-low register rather than the high end — the emotional color sits in cello and lower vocals rather than violin and falsetto, which reads as maturity rather than sentiment.",
      "Cue has no lyrical hook that an audience will recognize outside of context — the melody carries feeling without acquiring a cultural association. Safe for a placement where the music should be felt but not noticed.",
      "Dynamic arc follows the relationship's arc: quiet uncertainty in the verse, a tentative open-up at the chorus, and the sustained warmth of the outro. The music is already edited to the brief's emotional shape.",
      "Lyric stays in the present tense throughout — the song describes a state rather than a narrative event — which makes it placement-flexible across a compressed montage that does not need the music to comment on specific story beats.",
    ],
    MAYBE: [
      "Warmth is present but the lyric in the second verse names a specific narrative event — a wedding — that may or may not match the montage's beats. Read against locked picture before commit.",
      "Forward momentum is correct for compressed-time coverage but the cue at {tempo} BPM is more upbeat than the scene's tonal register; the editor will need to consider whether longing can carry at that tempo.",
      "Tonal color and dynamic arc serve the brief, but the chorus has a shouted backing vocal that pulls the register out of intimate-romantic into festival-anthemic. Instrumental version or stems edit needed.",
      "Arrangement leadership is right but the bridge takes the cue into a key change that doesn't return — the montage will end in a different emotional place than it started. Editorial call on whether that arc serves the picture.",
      "Cue is structurally clean for a montage but the master has been used in a competitor product launch within the past eighteen months, which creates sonic-recognition risk. Pre-clear with the brand team.",
      "Longing lands in the topline but the dominance reads passive throughout — the cue lets the picture lead, which is the right call in some montage sequences and the wrong call in others. Director-level decision.",
      "Emotional warmth is real but the production era is clearly contemporary — the drum programming and synth palette date the cue in a way that may compete with a montage that spans a longer time range. Placement context check.",
      "Warmth register is correct but the cue's arrangement has an anthemic quality in the final section that scales the emotion above what the montage's quiet relationship beats are asking for. Fade before the final lift.",
      "Cue serves the brief but the lyric's second half becomes more specific — a decision is named — that will anchor the montage to a narrative resolution the picture may not have reached yet. Lyric-against-locked review.",
      "Longing is present in the verse but the chorus's harmonic resolution is too complete — the cue feels conclusive where the brief wants unresolved yearning. Alt ending or early fade point before the resolution lands.",
      "Forward propulsion is gentle and correct but the cue's phrase length is longer than standard — ten-bar phrases rather than eight — which means the editor's instinctive cut points won't fall on the music's natural boundaries. Music editor flag.",
      "Tonal color holds but the master's high-end brightness is more radio-pop than film-underscore — the sheen of commercial production sits forward of where underscore needs to be for quiet coverage. Stems pull recommended.",
    ],
    FAIL: [
      { text: "Valence sits too cool — the harmonic palette is melancholy without warmth, and a romantic montage needs at least one ray of major-key relief somewhere in the arc. Emotional dimension misread for the brief.", lane: 'scene' },
      { text: "Arousal floor is below what compressed-time relationship coverage needs — the cue lacks the gentle forward propulsion that gives a montage its sense of life unfolding. The scene will feel stalled.", lane: 'scene' },
      { text: "Arousal fractures in the second half — the hard tempo change lifts the cue's energy from the warmth and continuity the brief needs into urgency, fracturing the temporal coherence a relationship montage depends on to compress time without announcing it. The progression reads wrong for the brief's emotional direction.", lane: 'scene' },
      { text: "Vocal lyric is explicitly about a breakup and a specific named city, which competes with any montage that is not edited around those exact narrative beats. The song has too much of its own story.", lane: 'lyrics' },
      { text: "A relationship-arc montage lets the music carry continuity under picture — but the vocal-forward arrangement puts the topline in the dialogue band across every structural section, and no instrumental alt is available for when the scene needs the lyric to recede. Density fit is wrong for underscore; presence is wrong for yield.", lane: 'lyrics' },
      { text: "Master and publishing both clear, but the artist's management has a standing rule against romance-coded placements following a public statement about the song's actual subject matter. Reputational pre-clear required.", lane: 'rights' },
      { text: "Track was released on a label imprint that has since been sold twice; the chain of title is unresolved at the master side and three writers' shares are sitting in copyright control. Not viable on the post timeline.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 6. DRAMA / CONFRONTATION — Dialogue scene, emotional subtext, restrained
  // -------------------------------------------------------------------------
  "drama-confrontation": {
    PASS: [
      "Cue holds a single drone pad for the first ninety seconds and adds a piano figure past the midpoint — exactly the kind of restraint a dialogue scene requires. The arrangement lets the performances carry the scene and steps in only on the subtext beat.",
      "Spectral weight is concentrated below 200 Hz and above 5 kHz, leaving the entire dialogue band uncontested. Underscores without competing across a six-minute coverage block; the music editor will not need to ride the level.",
      "Tonal palette holds an unresolved minor-second tension across the scene without ever cadencing — the cue carries the subtext the dialogue is not saying out loud. Lands the turn on the silence after the confession.",
      "Mix hierarchy is built for underscore from the ground up; the cue was tracked at -22 LUFS and translates to broadcast loudness without any dialogue ducking required. Clears for episodic on standard terms.",
      "The harmonic shift in the back third is the one editorial moment the cue offers, and it lines up with whatever beat the picture wants to weight. Yields to dialogue everywhere else; gives the editor room to breathe.",
      "Outro decay fades to a single sustained tone that bleeds across the scene transition — the cue becomes the bridge into the next scene rather than punctuating the end of this one. Candidate for repeated use across the act.",
      "Harmonic density is low — two-note clusters rather than full chords — which means the cue adds tension without adding information. The scene's meaning stays in the performances.",
      "Cue has no melodic content in the conventional sense: the music is gesture and timbre, not theme. That absence of melody is the correct approach for a confrontation brief where the melody is in the dialogue.",
      "Temporal behavior is non-metric — no discernible beat — which means the music cannot be heard to pace the dialogue. The confrontation breathes on its own terms; the music follows silently.",
      "The cue's one dynamic event is a slight swell at the three-quarter mark — a single moment of increased presence that the editor can assign to whichever line in the scene deserves to land. Everything else recedes.",
      "Low-end is the arrangement's primary emotional information carrier — the music lives in the subwoofer register, below conscious attention but above silence. The audience feels it without noticing they feel it.",
      "Sustain pedal behavior in the piano part is intentionally blurred, which softens every phrase boundary and prevents the cue from punctuating the dialogue it is meant to underscore.",
    ],
    MAYBE: [
      "Restraint is present in the verse but the arrangement opens up in the back half in a way that competes with whatever ADR the picture is carrying through the back half. Stems pull would let the music editor mute the lift.",
      "Subtext color is right but the cue introduces a clear melodic theme in the opening section — for some scenes that lands as emotional underline, for others it editorializes too hard. Director-level call.",
      "Dynamic floor is appropriate for dialogue but the cue's RMS level rides hot in the mid-range; broadcast delivery will require either a re-master or aggressive ducking at the dub stage. Music-editor handoff.",
      "Tonal palette serves the brief but the cue resolves to a major-key tonic at the cadence point, which collapses the ambiguity a dramatic scene typically wants to preserve. Editorial call on whether the resolution helps or hurts.",
      "Arrangement leadership is appropriately recessive but the cue runs short for the dialogue scene as locked — needs either an extended mix or a clean loop point. Worth the conversation with the artist.",
      "Underscore-grade restraint, but the publishing flag indicates an unresolved share with a co-writer who is currently in arbitration with the lead writer's publisher. Pre-clear before commit; wait time is the risk.",
      "Restraint is real but the cue's harmonic language has an identifiable stylistic character — the production aesthetic is recognizable as belonging to a specific contemporary composer-producer. Some directors see that as quality; others see it as the wrong foreground.",
      "Dynamic floor is correct but the cue's breath noise and incidental room sound in the recording may compete with the production's own room tone. Dub-stage decision on whether to treat as a feature or a problem.",
      "Subtext carry is intact through the first half, but the cue's second section introduces a rhythmic pattern — a heartbeat-adjacent pulse — that some scenes will read as body-clock tension and others will read as intrusive metronomic information.",
      "Tension register is present but the cue's loop point is not clean — there is a subtle pitch drift at the join that will be audible on a long dialogue scene. Music editor will need an extended mix before commit.",
      "Underscore function is correct but the cue was recorded with a room sound that is larger than a domestic interior — the acoustic implies a space the dialogue scene may not inhabit. Director call on whether the scale mismatch reads.",
      "Restraint is present but the piano figure in the second section has a recognizable chord voicing associated with a specific composer's TV work — the music editor should audition alongside the score before locking to avoid unintentional quotation.",
    ],
    FAIL: [
      { text: "Arousal ceiling sits above the scene's emotional floor — the track leads the picture rather than serving it, and a dialogue scene cannot accommodate music that pulls focus from performance. Wrong PAD register for restraint.", lane: 'scene' },
      { text: "Valence reads warm-comforting where the scene's subtext is cold and unspoken — the cue softens material that the picture is asking the audience to sit inside. Emotional axis misread for the brief.", lane: 'scene' },
      { text: "Arousal is set wrong from the first bar — the drum kit's backbeat raises the room above where dialogue can lead, and a restrained dialogue underscore cannot carry an audible kick and snare without pulling focus from the performances. The arrangement's energy floor is incompatible with restraint.", lane: 'scene' },
      { text: "Dynamic range is wrong for the brief — commercial-release mastering compresses the cue to a loudness floor that cannot sit under dialogue without continuous ducking, and a dialogue scene needs a master that can genuinely recede. The track is too present at every level the editor would need.", lane: 'scene' },
      { text: "A dialogue scene built on subtext cannot survive a vocal-forward underscore — the lyric occupies the same register as the performances and the audience will follow the song rather than the scene. Without an instrumental version or stems pull, the cue cannot serve restraint-grade coverage regardless of how well the harmonic palette works.", lane: 'lyrics' },
      { text: "Word density in the vocal is too high for a scene built on what is not said — the lyric fills every measure that the subtext brief reserves for performance silence, and the music editor has no instrumental alt in the catalog. Dialogue underscore needs a cue that yields; this vocal asserts at every turn.", lane: 'lyrics' },
      { text: "Master rights are held by a major label with a standing minimum-fee floor that exceeds the show's per-episode music budget by a factor of three. Not the music's fault — the rate card eliminates it.", lane: 'rights' },
      { text: "Composition includes an interpolation of a public-domain melody plus an arrangement copyright held by a third party who has not responded to clearance inquiry in fourteen months. Risk-flagged for any narrative use.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 7. SUSPENSE / DREAD — Dread buildup, unresolved threat, psychological
  // -------------------------------------------------------------------------
  "suspense-dread": {
    PASS: [
      "Sub-bass drone opens the cue and the first melodic information arrives well past the midpoint — the cue is pure dread architecture, and the editor can land the reveal on that delayed entry. Gives the editor room to breathe under quiet coverage.",
      "Harmonic language sits in a tritone-adjacent suspended cluster that never resolves — psychological unease comes from the cue's refusal to give the ear a home. Underscores without competing through the apartment search.",
      "Spectral weight is built from sustained low-string tremolo and high glassy harmonics, leaving the mid-range entirely open for dialogue and breath. Mix hierarchy serves a scene where the audience is listening for what isn't there.",
      "The breakdown into verse 2 strips back to a single pulse that registers as heartbeat — the cue starts working on the audience's autonomic system rather than their conscious attention. Lands the turn on the doorknob.",
      "Dynamic arc holds at a low simmer for two minutes before any escalation, which gives the editor permission to extend the slow-build coverage without the cue announcing impatience. Clears for trailer use under the same brief.",
      "Outro does not resolve — the cue ends on the same suspended tension it started in, which means the threat does not leave the room when the scene cuts. Candidate for episodic recurrence as a character motif.",
      "The cue's textural palette is built from sounds that resist classification as musical instrument or environmental noise — that ambiguity is the dread mechanism. The audience cannot locate the sound as score, and that disorientation is the brief.",
      "Micro-dynamic variation keeps the audience's nervous system engaged without announcing arousal change — the cue is louder than it was thirty seconds ago but the listener cannot say when the shift happened.",
      "Pitch content is centered on a single note that recurs in different timbres across the full duration — a monotonal anchor that accumulates dread through variation rather than through harmonic complexity.",
      "The cue has no attack transients — every sound fades in — which removes all the auditory startle cues that would let the audience predict when tension is about to break. The silence between events is the most threatening part.",
      "Temporal behavior is irregular: events occur at non-repeating intervals, which prevents the listener from establishing a rhythmic expectation and then relaxing inside it. Unpredictability is doing the psychological work.",
      "Room acoustic treatment in the recording is noticeably dead — the absence of reverb tail after each event leaves silences that register as threat-adjacent. The studio choice is a sound-design decision.",
    ],
    MAYBE: [
      "Dread architecture is sound through the first half, but the cue cadences to a tonic in the back third — the resolution releases the threat the scene is meant to hold. Edit before the cadence or pull an alt mix that loops past it.",
      "Psychological register is correct but the cue introduces a melodic motif in the first section that reads as character-attached; works only if the show is using leitmotif language at that level of specificity. Director call.",
      "Arousal floor is right but the cue's harmonic vocabulary is more horror than thriller — the dissonance leans abrasive where the brief wants insidious. Tonal-palette adjustment needed before commit.",
      "Spectral weight is correct for psychological coverage, but the high-end sweetener mid-arrangement is bright enough to compete with sound design risers in the same band. Music-editor pass to thin the top before locking.",
      "Cue serves the brief but the master was previously placed in a tentpole thriller release within the last twenty-four months — sonic recognition risk for a project trying to establish its own identity. Editorial call.",
      "Restraint is present but the publishing administration is split between two co-writers whose shares have a history of inconsistent approval timelines. Pre-clear flagged; wait-time risk on locked post.",
      "Dread palette is correct but the cue has a recognizable structural shape — a slow build to a single peak — that some editors will find predictable. The tension is earned but it is not surprising.",
      "Unease arrives quickly but the cue's texture is dense enough to compete with environmental sound design in the same band. Music editor will need to carve space at the dub stage rather than simply set a level.",
      "Psychological register is intact but the cue's opening thirty seconds are almost entirely sub-bass, which will not translate on devices without low-end reproduction. Audience-context check before commit.",
      "Dread architecture is solid but the cue is built as a continuous arc rather than a series of plateaus — if the scene has a false-alarm beat where the tension should briefly release, the music will fight that editorial choice.",
      "Threat level is well-calibrated but the cue's loop point introduces a slight rhythmic accent that becomes audible on extended repeats. Music editor should confirm the loop before committing to a long scene.",
      "Suspense register is correct but the sustained low-end adds up to a loudness footprint that may trigger normalization headroom issues on streaming delivery. Re-master check before the final dub.",
    ],
    FAIL: [
      { text: "Valence sits too neutral — the cue is sad rather than uneasy, and a thriller brief needs the harmonic vocabulary to actively threaten rather than mourn. Emotional dimension is wrong for unresolved-dread coverage.", lane: 'scene' },
      { text: "Arousal ceiling escalates into action-cue territory in the back half, which converts psychological suspense into kinetic peril — wrong gear change for a brief built on what the audience hasn't seen yet.", lane: 'scene' },
      { text: "Temporal regularity collapses the dread the brief is trying to build — the 2/4 backbeat anchors the listener in predictable time where psychological suspense needs ambiguity, and the metronomic certainty reads as the wrong arousal shape for a cue meant to hold unresolved threat. Dread requires the clock to feel uncertain; this arrangement confirms it.", lane: 'scene' },
      { text: "Explicit vocal content on the master creates a clearance asymmetry for a thriller brief that needs to clear across broadcast, streaming, and international distribution — territories with content-rating restrictions flag the track before the music supervisor's conversation begins. An instrumental alt would reopen the cue; without one the lyric is the gate.", lane: 'lyrics' },
      { text: "Vocal entry in the opening section commits the cue to a specific emotional read that a suspense scene cannot accommodate — the audience needs to project, and the lyric tells them what to feel. Instrumental version exists but does not have the same weight.", lane: 'lyrics' },
      { text: "Master is owned outright by a sync library with a non-exclusive arrangement that has placed the cue in seventeen other thriller productions across three networks. Sonic identity is already used up.", lane: 'rights' },
      { text: "Track samples a 1960s film score whose underlying composition is administered by a foreign-rights collective that does not engage with US sync clearances on commercial timelines. Pre-clear is theoretically possible but operationally not.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 8. HORROR / PSYCHOLOGICAL — Dissonance, unease, non-diegetic tension
  // -------------------------------------------------------------------------
  "horror-psychological": {
    PASS: [
      "Cue is built from prepared-piano scrape, bowed metal, and a children's-toy music-box figure that enters past the midpoint — every textural choice is doing horror work. Underscores without competing through the coverage.",
      "Tonal language is atonal across the full duration with chromatic clusters that refuse to organize into key — the audience's ear is never given permission to relax. Lands the turn on the closet reveal.",
      "Spectral weight occupies the extreme high and low ends of the spectrum with the dialogue band scrubbed clean — the cue can run loud through silent coverage and still leave room for breath foley. Mix hierarchy is horror-grade.",
      "The drop at the section change is a sub-bass impact that doubles as sound design — the music editor and the sound designer can share that hit point without either having to give ground. Drives the cut without dictating it.",
      "Dynamic arc is pure non-linear horror — sustained quiet, sudden sforzando, immediate return to quiet — exactly the shape that triggers physiological startle. Clears for episodic and trailer use.",
      "Outro fades into a sustained high-frequency scrape that the audience cannot tell is the cue or their own anxiety — the music does not announce that it has ended. Candidate for end-credits bleed.",
      "The cue uses extended instrumental techniques throughout — col legno, sul ponticello, snap pizzicato — and those sounds have no real-world acoustic referent, which prevents the audience from rationalizing them as diegetic. Pure non-diegetic unease.",
      "Phase relationships between left and right channels are deliberately unsettling — elements pan without clear spatial logic, which prevents the listener from locating the threat in a specific place. Spatial disorientation as horror grammar.",
      "The cue includes two near-silence passages of ten seconds each — not ambient noise, actual near-silence — and those gaps are more frightening than the textural content around them. The brief's threat is what isn't there.",
      "Pitch microtonality keeps every interval slightly wrong — not wrong enough to be obviously dissonant, wrong enough to be physically uncomfortable. The wrongness is subliminal until the audience realizes they have been clenching.",
      "Arrangement has a biological rhythm — breath-length phrase intervals, a pulse that is close to but not exactly a heartbeat — that the autonomic nervous system tracks without the conscious mind following. Physiological not aesthetic.",
      "The children's-register instruments in the arrangement import wrongness through context rather than through dissonance — the music-box and toy-piano carry horror by being innocent objects in the wrong place.",
    ],
    MAYBE: [
      "Dissonance is present but the cue introduces a recognizable melodic figure in the second half — for some horror brands that lands as motif, for others the melody offers too much organization. Director-level call.",
      "Atmosphere is right but the cue's lowest register clips into the sub band where theatrical sound design wants to live; on a streaming-only release this is fine, on a theatrical it competes. Mix-stage decision.",
      "Unease arrives quickly but the cue runs well short of the horror sequence as locked — needs either an extended mix, a music-editor loop, or a stems-driven rebuild. Worth the conversation.",
      "Tonal palette serves the brief but the cue includes a sample of a recognizable cinematic stinger that may register as familiar to genre audiences. Sonic-fingerprint pre-clear with the music editor before commit.",
      "Non-diegetic tension is well-built but the bridge introduces a sustained vocal drone that may compete with on-camera breath foley. Stems pull lets the music editor mute the vocal layer.",
      "Cue is structurally sound but the master rights are held by a horror-specialist sync library whose non-exclusive distribution may have placed it in adjacent genre product. Pre-clear with the supervisor's catalog database.",
      "Horror palette is present but the cue's textural density is uniformly high across the full duration — there is no quiet passage for the editor to deploy as the calm-before moment. Alt mix or loop from the opening section.",
      "Dissonance is correctly calibrated for psychological horror but the production acoustic has a warmth that softens the edges — the fear reads intellectual rather than visceral. Mix-stage treatment or different master before commit.",
      "Unease is structural and correct but the cue's phrase boundaries are audible — the horror breathes in visible units, and some scenes will need the dread to be genuinely continuous. Extended mix with no phrase gaps.",
      "Psychological register is intact but the cue's dynamic events are all in the same intensity band — there is no gradation between quiet background threat and peak scare. The music editor has no dynamic vocabulary to work with.",
      "Horror atmosphere is correct but the arrangement is recognizably in a specific contemporary textural style — the production aesthetic is dateable, which may read as genre pastiche to a genre-literate audience. Director call.",
      "Non-diegetic tension holds but the cue's sub-bass content is excessive on headphone delivery — the horror platform's primary listening context is earbuds, and the low-end will be physically uncomfortable rather than atmospherically uncomfortable. Re-master check.",
    ],
    FAIL: [
      { text: "Valence reads beautiful — the harmonic language is aestheticized in a way that gives the audience an emotional handhold horror is meant to deny. Emotional dimension wrong for non-diegetic dread.", lane: 'scene' },
      { text: "Arousal sits comfortable rather than uncomfortable — the cue is atmospheric but the atmosphere is contemplative, and a horror brief needs the music to actively threaten the listener's nervous system.", lane: 'scene' },
      { text: "Dominance reads wrong for psychological horror — the audible kick on the downbeat provides the temporal certainty the brief's atmosphere is built to deny, and rhythmic regularity lands as assertive where the brief needs threatening. Horror requires the floor to feel unstable; this arrangement confirms the beat.", lane: 'scene' },
      { text: "The horror textures the brief depends on cannot survive delivery — the high-frequency design layer collapses with phase artifacts on standard stereo fold-down, which means the dissonance and unease disappear in the listening context the placement actually lives in. Effective atmospheric threat requires a stable mix.", lane: 'scene' },
      { text: "The track's vocal layer works against non-diegetic horror use — an identifiable singing voice roots the cue in a specific human emotional register that psychological horror is built to deny, and the audience needs to project rather than listen. The instrumental stems do not carry the atmospheric weight on their own; the vocal is the arrangement's dread engine.", lane: 'lyrics' },
      { text: "Explicit-flagged vocal on the master creates a distribution gap for a horror series clearing across broadcast territories — horror clears to a family or age-gated standard depending on territory, and an explicit vocal without a confirmed clean version makes the brief's delivery window unworkable. The atmospheric textures that make the cue viable for horror live in the vocal arrangement.", lane: 'lyrics' },
      { text: "Composition uses a sample of a public-domain liturgical work whose specific arrangement is administered under controlled comp by a publisher who does not clear horror placements as policy. Brief is wrong for the catalog.", lane: 'rights' },
      { text: "Master is in a multi-territory distribution dispute between the original artist's estate and a former label — placement on a streaming horror series is one of the disputed exploitation categories. Legal flag, not editorial.", lane: 'rights' },
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
      "The breakdown in the first section strips to pizzicato strings before the full arrangement returns — gives the editor a natural deadpan moment for whatever beat the picture is selling. Underscores without competing.",
      "Vocal-free arrangement keeps the cue placement-flexible across episodic comedy where dialogue density runs high. Clears for trailer, end-credits, and recurring underscore inside the same license.",
      "Outro ends on an unresolved harmonic that lands as a comic shrug rather than a button — exactly the right register for a brief that wants the joke to land in picture, not music. Candidate for recurring use.",
      "Quirk is structural not stylistic — the cue's rhythmic irregularity comes from a mixed meter rather than from performance feel, which means it stays consistently offbeat regardless of tempo or level. The wit does not depend on the mix.",
      "Instrumentation is chosen to suggest rather than state — a clavinet line that implies character without describing it, a bass trombone figure that reads as comic without announcing the joke. Understated in the right direction.",
      "The arrangement has no sustained notes anywhere in it — everything decays within two bars — which gives the cue a light, bouncing quality that is the tonal register of something not quite taking itself seriously.",
      "Dynamic ceiling is deliberately capped at a moderate presence level, which keeps the cue from ever demanding attention. The comedy is in picture; the music is the room's ambient opinion.",
      "Tonal palette combines unrelated instrument families — orchestral, folk, and toy-grade — in a way that reads as curated accident. The mix sounds like it was assembled by someone with too many instruments and good instincts.",
      "Phrase structure has a built-in comic timing: the downbeats land a sixteenth-note late throughout, which is the musical equivalent of a double-take. The timing is consistent enough to be intentional, irregular enough to feel alive.",
    ],
    MAYBE: [
      "Quirk is present but the cue introduces a vocal interjection in the first section — a single sung syllable — that some directors will hear as charm and others as competing comic information. Editorial call.",
      "Tonal palette serves the brief but the cue is performing its quirkiness rather than carrying it lightly; the wit reads effortful. Music-editor instinct call on whether the picture can absorb that energy.",
      "Forward momentum is correct but the cue's tempo at {tempo} BPM is faster than most quirky comedy coverage wants — works for a chase-of-laughs sequence, competes with a slower deadpan two-hander.",
      "Arrangement leadership is appropriately recessive but the cue's mix has a forward whistle line that may compete with on-camera dialogue in the same register. Stems pull would let the music editor mute it.",
      "Wit is in the writing but the cue lands a clear musical punchline in the second half that requires the picture to land its own punchline at the same moment. Director call on whether to align the beats.",
      "Cue serves the brief structurally but the master has been placed in a streaming-comedy theme inside the last year — sonic identity may already be associated with another show. Pre-clear conversation.",
      "Quirkiness is genuine but the cue's tonal register veers into twee territory past the midpoint — a register that works for family-platform content and may read as cloying for a show aimed at an adult audience. Platform check.",
      "Comic timing is in the right neighborhood but the cue has a clear verse-chorus structure, which means the humor recurs at predictable intervals. Deadpan comedy often needs more unpredictable spacing between the music's comic moments.",
      "Offbeat palette is correct but the mix is bright in a way that may place the cue in an era — the production sound reads as a specific decade of comedy scoring rather than timeless oddball underscore.",
      "Wit lands in the opening section and the arrangement then holds that register without development — twelve bars of quirky becomes wallpaper by bar forty-eight. Episodic use across multiple scenes may exhaust the bit.",
      "Arrangement is genuinely unusual but the recording level is inconsistent — some elements sit forward and some recede in a way that reads as accident rather than intention. Mix pass before commit.",
      "Quirk register serves the brief but the outro has a clean resolution that is more satisfying than the comedy needs — the joke lands and then the music confirms it too definitively. Alternate ending or early fade.",
    ],
    FAIL: [
      { text: "Valence reads forced-happy — the cue is performing levity rather than embodying it, and audiences hear that distinction immediately. Wrong emotional read for a brief that requires light touch.", lane: 'scene' },
      { text: "Arousal arc spikes into hyperactive territory past the first section — the cue is doing the joke for the picture, which is the opposite of what a quirky underscore should do. Music should let the laugh land in cut.", lane: 'scene' },
      { text: "Dominance reads too assertive — the cue punctuates its own structure with a hard button every eight bars, imposing a comedic rhythm on the cut that belongs to the picture rather than the music. The arrangement keeps declaring where the brief needs it to suggest, and the dialogue scene cannot survive that interruption pattern.", lane: 'scene' },
      { text: "The lyric is too present in the mix to serve deadpan comedy underscore — a vocal-forward arrangement means the audience reads the song rather than watches the scene, and the joke lands in the music before the picture gets there. Comedy underscore needs the vocal to recede or disappear; no instrumental alt is confirmed in the catalog.", lane: 'lyrics' },
      { text: "Word density in the vocal outpaces what the brief needs from its underscore — the lyric fills every available measure, eliminating the rhythmic breathing room a deadpan comedy cue uses to set up the picture's own punchlines. Instrumental version is not confirmed available; the master's vocal density makes the brief's light-touch register unworkable.", lane: 'lyrics' },
      { text: "Master is administered by a sync library with a non-exclusive deal that has placed the cue in three competing comedy series — the wallpaper-music problem. Sonic identity already diluted.", lane: 'rights' },
      { text: "Composition contains a sampled vocal hook from a 1970s novelty record whose master is owned by an estate that has historically declined comedy and parody placements. Pre-clear is non-trivial.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 10. COMEDY / LIGHT — Upbeat pace, forward momentum, no darkness
  // -------------------------------------------------------------------------
  "comedy-light": {
    PASS: [
      "Tempo at {tempo} BPM and a four-on-the-floor kick give the editor a metronomic backbone for compressed-time comedy beats. Forward momentum without any harmonic darkness anywhere in the arrangement; lands the turn at every chorus return.",
      "Major-key tonal palette holds across the full cue with no minor-key bridge — exactly the right emotional surface for a sequence that should never let the audience worry. Drives the cut without dictating it.",
      "Vocal entry in the opening bars brings character without specificity; the lyric is general enough to read as group montage interiority. Clears for episodic, viable for trailer cutdowns inside the same license.",
      "Arrangement layers are additive across the verse-chorus-verse — guitar in the opening, horns at the first chorus, group vocal at the second chorus — giving the editor natural lift points to align with the montage's beats.",
      "The drop in the back half is a stripped-back bridge that gives the editor a deadpan beat inside the otherwise relentless forward energy, which lets the comedy breathe before the final chorus. Underscores without competing.",
      "Outro ends on a clean button that the editor can land on the punchline reveal — the cue resolves the sequence rather than dragging into the next scene. Candidate for end-tag as well.",
      "Harmonic vocabulary is determinedly uncomplicated — I-IV-V with no substitute chords anywhere — and that harmonic clarity is the brief's emotional argument. Nothing shadows the sequence the music is serving.",
      "Production is clean and tasteful: no distortion, no heavily processed elements, no aesthetic that requires context to appreciate. The cue will work for the scene's specific audience without asking them to meet it halfway.",
      "Dynamic range is compressed by design — the cue holds a consistent presence that the editor can set once and leave. No level rides required across a dialogue-dense montage.",
      "The arrangement's instrumentation is culturally unspecific: piano, horns, and a snare pattern that does not belong to any single genre tradition. Category-neutral in a way that serves comedy placement across brief types.",
      "Phrase structure is regular and predictable: four-bar phrases throughout, with the chorus arriving exactly when expected. That predictability is the cue's editorial virtue — the editor always knows where the music will be.",
      "Cue contains a single moment of musical surprise — one unexpected chord — that reads as a wink rather than a tonal detour. It is in the right place to score whatever small unexpected beat the picture has at that point.",
    ],
    MAYBE: [
      "Upbeat pace is right but the chorus lyric names a specific narrative — a road trip — that may or may not match the montage's actual content. Read against locked picture before commit.",
      "Forward momentum serves the brief but the cue's mid-section drops into a half-time bridge that some montages will absorb as a deadpan beat and others will read as energy collapse. Editorial call.",
      "Tonal palette is bright but the cue's mix has a forward backing vocal that competes with any voiceover the picture is carrying. Instrumental version reopens the cue for V/O coverage.",
      "Cue serves the brief structurally but runs longer than most comedy montages need — the music-editor will need to identify a clean exit point inside the second chorus.",
      "Arrangement leadership shifts from band to solo voice in the closing section — that scale change is a feature for some directors and a problem for others. Director call on whether the intimacy beat lands.",
      "Master and publishing both clear, but the cue has been heavily placed in a recent national ad campaign — audience association with the brand is non-trivial. Editorial decision on whether the residue helps or hurts.",
      "Lightness is present but the production register is genre-coded to a specific style of contemporary pop comedy — a sound associated with a particular streaming-platform aesthetic. Works for shows in that universe, reads derivative outside it.",
      "Forward momentum holds but the chorus has a group-vocal shout that lifts the register above light-comedy into crowd-energy territory. Editorial call on whether the scale change helps or overshoots.",
      "Cue serves the brief but the instrumental arrangement lacks the melodic personality that lets a light-comedy cue become a recurring motif across an episode. Generic-grade competence rather than memorable.",
      "Bright palette is correct but the production uses a synthesized instrument as its leading voice, and the timbre has a specific software-plugin sound that dates the production. Analog alt would extend the placement life.",
      "Upbeat energy is right but the verse phrasing is uneven — some four-bar phrases expand to five without melodic reason — and the editorial instinct to cut on the downbeat will occasionally land in the wrong place.",
      "Light comedy register holds but the cue's rhythmic approach is more complex than the brief's editorial function needs — syncopated hihat patterns the editor will feel obliged to cut to rather than cut against. Simpler groove before commit.",
    ],
    FAIL: [
      { text: "Valence sits warm-melancholic rather than warm-bright — the harmonic palette has too many minor-seventh resolutions for a brief that explicitly wants no darkness. Emotional dimension misread.", lane: 'scene' },
      { text: "Arousal floor is below what compressed-time comedy needs — the cue ambles where the brief wants it to motor. Forward momentum is the deal-breaker, not the topline.", lane: 'scene' },
      { text: "Arousal collapses in the second half — the tempo-halving bridge drops the cue's energy floor for an extended stretch, and comedy montage cannot survive a slowdown long enough for the audience to notice that the forward momentum has stopped. The brief lives or dies on propulsion; this arrangement trades it away.", lane: 'scene' },
      { text: "Explicit flag on the master bars the cue from broadcast comedy placements without a clean version — upbeat comedy montage lives in family-accessible delivery windows, and the catalog does not confirm a clean alt is available. The arrangement is built around the vocal; pulling it leaves underscore without the propulsion that makes the brief work.", lane: 'lyrics' },
      { text: "Lyric content addresses a serious personal narrative — addiction recovery, in this case — that cannot be repurposed under comedic montage coverage without reading exploitative. Wrong song for the use.", lane: 'lyrics' },
      { text: "Master is controlled by a label whose A&R has a standing creative-approval requirement on comedy placements that takes four to six weeks to clear. Post timeline does not accommodate.", lane: 'rights' },
      { text: "Track is a one-stop on paper but the producer's share is administered by a publisher whose backend has been unresponsive on episodic comedy clearances for the past two quarters. Operational risk.", lane: 'rights' },
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
      "Dynamic arc rises across the first half with a clear arrival point — gives the editor a natural landing surface for the title card reveal. Lands the turn cleanly on the show logo.",
      "World-building is in the orchestration — period-specific instrument choices that locate the audience inside the show's geography from the first bar. Underscores without competing if the title sequence carries dialogue or VO.",
      "Outro holds a single chord that bleeds into the cold open of the first scene — the cue functions as a bridge into the show's world rather than a separate musical number. Candidate for episodic main-title placement.",
      "The cue's opening gesture is the show's identity claim — it arrives before any visual information and already tells the audience what kind of show this is. That pre-visual commitment is what a main-title theme has to do.",
      "Tonal range across the cue covers the show's full emotional bandwidth — from restraint to presence — inside the opening minute. An audience who only hears the theme knows the show's emotional range before they see a frame.",
      "The cue has a natural 30-second version inside its first section with no editing required — the phrase structure closes cleanly at that point. Main title and bumper use covered by the same master.",
      "Arrangement is distinctive without being experimental — the show's sonic identity will be recognizable without requiring the audience to adjust to an unusual sound. Accessible as a first impression.",
      "The cue's melody is functional as a whistle-test: a listener who hears the theme once can hum the first phrase back. That memorability is the prerequisite for a main title that works across a season.",
      "Dynamic ceiling is calibrated to translate as presence rather than loudness — the title sequence will carry authority across living-room and headphone delivery without feeling aggressive in either context.",
    ],
    MAYBE: [
      "Tonal palette is right for the show's world but the cue introduces a melodic theme in the first section that may compete with whatever score motif the composer is developing for the series. Music-supervisor-to-composer handoff.",
      "Establishing tone arrives quickly but the cue's first impression is genre-coded in a way that may pre-commit the audience to a read the show is trying to subvert. Editorial call on whether the directness serves.",
      "Cue is structurally main-title-grade but runs longer than most opening sequences need — needs a 30-, 60-, and 90-second cutdown set before commit.",
      "Forward momentum is correct for a series opener but the cue's energy peaks late — works only if the title sequence is back-loaded; competes with a sequence that wants to land its hit at the front.",
      "Arrangement leadership serves the world-building but the cue's vocal entry past the midpoint commits the show to a specific gender and emotional register from episode one. Director-level decision on whether that lock-in helps or hurts.",
      "Cue serves the brief but the master has been used as a main title on a competing streamer's series within the past four years — sonic identity collision risk. Pre-clear before showrunner commit.",
      "World-building register is present but the cue's tonal palette is so specific to a genre that it may narrow the show's perceived audience before the premiere. Showrunner-level positioning call.",
      "Establishing quality is real but the cue's arrangement is dense from the first bar — there is nowhere for the title sequence visuals to add information that the music has not already stated. Opening-title work needs a little more room.",
      "Cue is emotionally right for the show but the mix has a dated mastering style — the loudness contour reads as a specific era of production that may undercut a contemporary show's authority. Re-master check.",
      "Title-grade confidence arrives quickly but the cue's second half introduces tonal variation that may pull episodic audiences in different directions episode to episode. Consistent emotional promise is the main-title job.",
      "Arrangement serves the world-building but the cue is built around a single thematic idea with no internal variation — across a long season the theme may feel exhausted. Consider whether a second phrase element exists in the stems.",
      "The cue's opening seconds make a strong claim on the show's identity but that claim is genre-specific in a way that front-loads audience expectation. Works if the show delivers on that genre; undercuts it if the show subverts it.",
    ],
    FAIL: [
      { text: "Valence is too narrow for a main title — the cue commits to a single emotional register where a series opener typically needs to suggest range. Emotional bandwidth is the wrong dimension for the brief.", lane: 'scene' },
      { text: "Arousal ceiling sits below what a series opener needs to claim attention with — the cue is restrained where a first impression has to assert itself. Wrong dimension for opening-frame work.", lane: 'scene' },
      { text: "Emotional bandwidth cannot compress — the verse-chorus architecture builds its argument over a full song's runtime, and a main-title cutdown that lands under thirty seconds collapses the arc without leaving any of the breadth the brief requires to frame the show. The brief needs a full emotional palette inside a short window; this structure cannot provide it.", lane: 'scene' },
      { text: "Main-title placement runs between twenty and sixty seconds — the vocal-forward arrangement occupies that window so completely that there is no space for a title card or show logo to land without competing with the topline. Instrumental version is the standard mitigation but no instrumental alt is listed in the catalog; the vocal is the cue.", lane: 'lyrics' },
      { text: "Lyric content commits the show to a specific emotional interpretation before the audience has seen a frame — a main-title brief needs music that opens the world rather than describes it, and this topline editorializes the premise in a way that forecloses the viewer's own reading of the opening sequence. Works as a closing-credits song where the narrative has already played; premature as a framing statement.", lane: 'lyrics' },
      { text: "Master rights are held by an artist whose management has a standing rule against main-title placements as a brand-protection policy. Confirmed in writing two quotes ago. Non-viable category.", lane: 'rights' },
      { text: "Composition is administered across four publishers in three territories with no MFN agreement — main-title clearance requires worldwide rights from day one and the chain of title is not consolidated. Operational non-starter.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 12. EUPHORIA / CELEBRATION — Emotional resolution, bookend, earned release
  // -------------------------------------------------------------------------
  "euphoria-celebration": {
    PASS: [
      "Cue earns its emotional resolution through three minutes of build rather than asserting it at the front — the audience arrives at the release alongside the music. Candidate for end-credits but not main title.",
      "Tonal palette returns to the harmonic motif from the cold open and resolves it for the first time in the cue's outro — the bookend lands inside the music itself. Lands the turn on the cut to black.",
      "Vocal entry in the second half brings the lyric content that the show has been earning across the season — the song is doing the emotional work the closing scene is asking the audience to share. Clears for end-credits use.",
      "Dynamic arc lifts into the final chorus with the full arrangement landing on the credit roll — gives the editor a natural placement for the cast cards. Drives the cut without dictating it.",
      "Outro decay holds for forty-two seconds across the credit crawl — the cue is built to bleed across end-credits real estate without artificial extension. Mix hierarchy is end-credits-grade.",
      "Earned release is in the harmonic resolution at the cue's finale — the cue gives the audience a major-key landing they have been denied across the season. Strong candidate for finale-episode placement specifically.",
      "The build inside the cue mirrors the season's own structure: a patient accumulation followed by a release that only works because everything before it has been withheld. The music already knows how to do what the finale is asking.",
      "Harmonic resolution is decisive without being abrupt — the tonic lands with full orchestration and then the arrangement holds it for eight bars. The audience is given time to feel the release before the credits pull them forward.",
      "Lyric is addressed to no one in particular — the second-person pronoun is general enough to belong to any character relationship the season has been building. The song celebrates; the specific celebration is the audience's to project.",
      "Dynamic arc has a single extended plateau in the middle section — a few bars of held peak — that the editor can use as the show's visual centerpiece moment before the credits roll. The music waits.",
      "Euphoric register is earned rather than asserted — the cue's opening verse is restrained enough that the final chorus carries genuine surprise. The release is not telegraphed.",
      "The cue's arrangement includes an outro extension at half-tempo that converts the closing energy into a quiet, sustained warmth — an option for a finale that resolves gently rather than triumphantly.",
    ],
    MAYBE: [
      "Emotional resolution is present but the cue resolves in the second half and runs considerably longer after — the editor will either need a clean fade point or the credit crawl has to absorb the additional duration.",
      "Bookend register is right but the lyric specificity is high — names a relationship that may or may not match what the season's narrative actually resolved. Read lyric sheet against the season finale beats.",
      "Dynamic arc serves the brief but the final chorus lands harder than some endings want — works for a triumphant resolution, competes with a quieter or ambiguous closer. Director call.",
      "Tonal palette is right for closing-title use but the cue is structurally main-title-shaped — the editor will need to confirm with the showrunner that this is the closer rather than the opener. Placement clarity.",
      "Cue is end-credits-grade but the master was released as a single eighteen months ago and charted — sonic familiarity may pull audiences out of the show's interiority into the artist's separate identity. Editorial call.",
      "Earned release lands but the publishing flag indicates a co-write share with a writer whose backend is currently in a clearance dispute. Pre-clear before commit; wait time is the operational risk.",
      "Celebration register is real but the cue's resolution is front-loaded — the harmonic arrival happens in the first third, leaving the remainder of the arrangement at a sustained positive plateau. End-credits need the peak late, not early.",
      "Euphoric quality is present but the production brightness reads more commercial than cinematic — the end-credits brief benefits from arrangements that feel slightly outside everyday listening context. Director call on register.",
      "Earned release lands on the right emotional note but the cue's arrangement is under-built for end-credits use — the orchestration is thin in a way that will not fill the closing sequence's sonic real estate. Extended or fuller mix.",
      "Celebration palette is correct but the cue has a clearly identifiable artist voice — the production aesthetic is recognizable as belonging to a specific act — and that identity may pull audience attention away from the show's emotional closure.",
      "Emotional resolution is complete but the cue runs short for the credit crawl as timed — the music ends before the audience has finished reading the cast cards. Extended mix or music-editor loop point required.",
      "The closing title brief is served by the cue's harmonic register but the tempo is fast enough to introduce a slight forward energy that may not match a finale that ended quietly. Tempo or arrangement check before commit.",
    ],
    FAIL: [
      { text: "Valence reads unresolved across the full duration — closing-title work needs the harmonic language to give the audience a landing surface, and this cue refuses to provide one. Wrong emotional shape for a bookend.", lane: 'scene' },
      { text: "Arousal ceiling escalates rather than resolves — the cue is still building at the final fade, which leaves the audience charged when the brief asks for release. Emotional direction is reversed.", lane: 'scene' },
      { text: "The emotional release the brief requires cannot sustain — a closing-title cue needs to hold the audience inside the earned resolution across the credit crawl's full runtime, and a track under ninety seconds with no extended mix cannot maintain that emotional presence. The arc completes before the scene does.", lane: 'scene' },
      { text: "End-credits placement relies on the lyric receding at edit points where actor cards land — word-dense vocal that fills every bar competes with on-screen text the closing sequence is built around, and pulling the level down removes the earned release that makes the cue suitable for the brief in the first place. Density fit is wrong for the closing-title format.", lane: 'lyrics' },
      { text: "Lyric content addresses a narrative that contradicts the season's actual resolution — placing it under the credits would editorialize against the showrunner's intended ending. Wrong song for the use.", lane: 'lyrics' },
      { text: "Master is owned by a label whose end-credits placement minimum exceeds the show's per-episode budget by a factor of five. Not editorial — rate card eliminates it from the conversation.", lane: 'rights' },
      { text: "Composition is registered with a publishing administrator whose end-credits clearance turnaround is documented at six to ten weeks. Show's air date is in nineteen days. Non-viable timeline.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 13. CINEMATIC / EPIC — Scale, orchestral weight, consequential stakes
  // -------------------------------------------------------------------------
  "cinematic-epic": {
    PASS: [
      "Full orchestral arrangement with choir entering past the midpoint and brass stack arriving in the back third — the cue is built for theatrical scale without any rock or hybrid layer to compromise the orchestral identity. Drives the cut without dictating it.",
      "Spectral weight is genuinely epic — the low brass and timpani occupy the sub band the way theatrical sound design expects, and the choir sits above the dialogue range. Mix hierarchy translates to 5.1 and Atmos delivery without remix.",
      "Dynamic arc is patient — the cue takes ninety seconds to reach the first major dynamic statement, which gives consequential-stakes coverage time to build before the music asserts itself. Lands the turn on the army-cresting-the-hill beat.",
      "Tonal palette is modally consistent across the four-minute arrangement — a single emotional world rendered at scale rather than a montage of moods. Underscores without competing with on-camera battle dialogue.",
      "The modulation up a half step at the final chorus return is the cue's emotional and structural climax — gives the editor the biggest hit point the picture has, exactly when consequential coverage needs it.",
      "Outro resolves the cue's main motif in full orchestration — the music gives the scene the closure that the picture is asking the audience to feel. Candidate for end-credits reprise as well as the set piece itself.",
      "Orchestration is stratified across the full frequency range — contrabass and tuba in the sub, strings and woodwind in the mid, brass chorale in the upper harmonic range — so the mix hierarchy translates to any playback format without collapsing.",
      "The cue's emotional scale is built through duration as much as through orchestration — it is long enough to earn the feeling it delivers, and the patience is the argument.",
      "Harmonic language stays in a single mode across the full arrangement — no borrowed chords, no secondary dominant distractions — which keeps the tonal world coherent at theatrical scale.",
      "Dynamic headroom is managed conservatively: the cue's peak is not the recording's ceiling. That reserved headroom is available to the dubbing mixer when the picture's sound design needs to exceed the music at a single specific moment.",
      "The choir arrangement is text-free — phonemes rather than language — which keeps the vocal texture as pure timbral weight rather than lyric information. Theatrical scale without semantic foreground.",
      "Cue contains one explicit structural silence of two bars at the three-quarter mark — a held breath before the final push. The editor can assign that silence to any single visual moment of consequence.",
    ],
    MAYBE: [
      "Scale is right but the cue's orchestral language is genre-coded toward a specific franchise sound — works if the project is genre-adjacent, competes if the production is trying to establish its own orchestral identity.",
      "Orchestral weight is theatrical-grade but the cue runs well short of the set piece as locked — needs an extended mix, a music-editor stitch, or a stems-driven rebuild to cover the runtime.",
      "Consequential stakes register in the harmonic language but the cue's tempo at {tempo} BPM is slower than the picture is moving — editorial call on whether the music's gravity slows the cut productively or drags it.",
      "Cue serves the brief but the choir lyric is in a constructed language that some audiences will hear as profound and others as pastiche. Director-level call on the cultural read.",
      "Dynamic arc lands the climax cleanly but the final section introduces a percussion ostinato that pulls the orchestral identity toward hybrid-trailer territory. Stems pull would let the music editor decide.",
      "Cue is structurally epic-grade but the master has been used in a major studio trailer campaign within the past year — sonic recognition risk for a feature trying to claim its own orchestral identity.",
      "Orchestral weight is genuine but the cue's emotional palette is narrower than the brief's scene may require — the music delivers scale but not complexity. If the picture's stakes are morally ambiguous, the cue's harmonic certainty may flatten them.",
      "Consequential register is present but the cue's opening two minutes are underscore-grade in intensity — a picture that opens at narrative scale will wait a long time for the music to match it. Pre-roll or extended mix needed.",
      "Epic scale lands in the arrangement but the mix has a clarity that reads as sample-library rather than live orchestra — the sonic verisimilitude may be an issue for a theatrical production that needs to inhabit the same acoustic world as its own score.",
      "Cue serves the brief but the harmonic language is closer to minimalist than to classical epic — the epic is felt through repetition and duration rather than through chord complexity. Director call on whether the approach fits the film's aesthetic.",
      "Dynamic climax is well-built but the outro resolves too definitively for a picture that continues after the scene — if the narrative asks the stakes to sustain beyond this moment, the music will have already closed the argument.",
      "Orchestral weight is present but the stems have a programmed-percussion layer that sits forward of the live instruments — a hybrid register the music editor should evaluate at the dub stage before the picture is locked to it.",
    ],
    FAIL: [
      { text: "Arousal ceiling is below theatrical scale — the cue gestures at epic without committing to the orchestration, and the picture will out-scale the music every time. Wrong dimension for consequential-stakes coverage.", lane: 'scene' },
      { text: "Valence reads heroic-uncomplicated across the full duration, which collapses the moral weight a consequential-stakes brief typically wants. The cue celebrates where the picture is asking the audience to feel cost.", lane: 'scene' },
      { text: "Arousal reads commercial rather than theatrical — the four-on-the-floor floor sets an energy register that reads pop before the strings can assert scale, and orchestral overdubs cannot rescue the emotional weight that the underlying architecture undercuts. Consequential stakes require a different foundation.", lane: 'scene' },
      { text: "The cue's emotional scale cannot survive theatrical delivery — brick-wall limiting compresses the dynamic range that allows orchestral weight to breathe alongside sound design, and the resulting loudness floor means the music fights the picture rather than reinforcing it. A consequential-stakes placement requires a master built for the mix stage.", lane: 'scene' },
      { text: "Explicit-flagged vocal on the theatrical version triggers distribution restrictions in territories that represent a significant share of the release plan — consequential-stakes coverage clears internationally or not at all, and an explicit master without a confirmed clean version is a single-market cue at best. The brief requires a worldwide-clearable track.", lane: 'lyrics' },
      { text: "The vocal layer dominates the mix in a way that sits in front of the orchestral weight — in a brief built on theatrical scale and patience, a topline that steps forward converts the cue from cinematic-epic into pop-song-with-strings. The stems confirm the arrangement was constructed around the vocal; instrumental is not a viable substitute at the orchestral weight the brief requires.", lane: 'lyrics' },
      { text: "Composition rights are held jointly by a film-score collective whose standard contract excludes use in non-original-score contexts — this is library catalog, not commissioned score. Brief is wrong for the use category.", lane: 'rights' },
      { text: "Master was commissioned for a competing studio's tentpole release with a five-year exclusivity carve-out that has not yet expired. Pre-clear conversation is operationally non-viable.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 14. CORPORATE / ASPIRATIONAL — Forward momentum, optimistic, professional polish
  // -------------------------------------------------------------------------
  "corporate-aspirational": {
    PASS: [
      "Cue holds a bright major-key palette with a clean four-bar rhythmic engine and a melodic hook in the opening section — exactly the polished, forward-leaning surface a corporate aspirational brief expects. Works under VO and clears for trailer use.",
      "Arrangement is built around piano, plucked synth, and a clean kick — the mix hierarchy leaves the entire dialogue band uncontested for executive voiceover or testimonial cutaway. Yields to dialogue across the full duration.",
      "Forward momentum is steady without escalating into hyperactive territory — the cue projects confidence without performing urgency. Drives the cut without dictating it through the founder-walking-through-office shot.",
      "Tonal palette is brand-safe across categories — no genre marker that locks the cue to a specific industry or demographic. Strong candidate for B2B, fintech, healthcare, and SaaS corporate use within a single license.",
      "Dynamic arc lifts gently at the first chorus for the value-prop reveal and pulls back for the close — gives the brand team a natural landing surface for the logo lock-up. Lands the turn cleanly without overstating it.",
      "Outro ends on a clean button at the logo card — professional polish all the way through the deliverable. Cue sheet metadata is complete and one-stop status is confirmed at the publisher.",
      "Production aesthetic is contemporary but not trend-dependent — the cue will sound current in two years without sounding dated in four. Brand longevity is a function of not being too tied to the year it was made.",
      "Harmonic vocabulary is bright and unambiguous, which means the brand's message does not have to compete with any emotional subtext in the music. The cue's job is to amplify, and it does not complicate.",
      "The cue's melodic phrase is short enough to function as a jingle-adjacent hook but long enough to avoid reading as a jingle. That calibration is the right place for contemporary corporate music.",
      "Mix is transparent enough to be used at a low level under a long-form presentation without fatiguing the audience — the cue can sustain across a ten-minute brand video without the room getting tired of it.",
      "The cue has a natural logo-lockup moment — a single clear resolution in the final four bars — that the brand team can align with the final card without any editorial adjustment.",
      "Production quality is broadcast-deliverable on first submission — no loudness issues, clean metatags, complete stems set already split and labeled. Operational velocity is part of the brief's value.",
    ],
    MAYBE: [
      "Optimism is present but the cue's harmonic language reads slightly nostalgic — works for legacy-brand storytelling, competes with a forward-tech narrative. Director-level call on the brand voice.",
      "Forward momentum is correct but the cue's BPM at {tempo} is faster than most aspirational corporate work uses — lands as energetic for a launch, reads as anxious for an institutional brief.",
      "Tonal palette is brand-clean but the cue's mix has a forward synth lead that may compete with a prominent voiceover. Stems pull lets the music editor mute the lead during V/O coverage.",
      "Cue is corporate-grade structurally but the topline melody is highly memorable in a way that may compete with the brand's own audio mnemonic. Sonic-identity pre-clear with the brand team.",
      "Aspirational register lands but the cue's outro runs longer than most corporate cutdowns need — the deliverable set should include 15-, 30-, and 60-second alts. Worth requesting before commit.",
      "Cue serves the brief but the master has been placed in a competitor's campaign within the past nine months — sonic confusion risk in the same vertical. Pre-clear with the agency.",
      "Corporate aspirational register is intact but the cue's arrangement is sparse in the verse — the mix feels thin under a long-form narrative section before the chorus fills it out. Some corporate briefs need consistent presence throughout.",
      "Forward momentum is correct but the rhythmic approach is slightly syncopated, which gives the cue a groove that some brand teams read as contemporary and others read as insufficiently authoritative. Brand-voice call.",
      "Optimism is present but the production aesthetic reads as startup-era rather than enterprise — the sonic register is casual in a way that may not serve a brand positioning itself as institutional. Vertical check.",
      "Aspirational palette is right but the cue's vocal-adjacent element — a wordless melodic line — may register as lyric content to some audiences. Brand team should audition with actual VO in context before commit.",
      "Confidence register lands but the cue runs long and has no natural internal cutdown points — the 15- and 30-second versions will require edit rather than extraction, which adds to the agency's production timeline.",
      "Bright palette is present but the mastering has a slight harshness in the upper mid that will fatigue in a long-form corporate presentation context. Re-master or high-shelf treatment at the dub stage.",
    ],
    FAIL: [
      { text: "Valence is bright but the cue carries an underlying minor-key shadow in the bridge — corporate aspirational coverage cannot accommodate even momentary emotional ambiguity. Wrong harmonic register for the brief.", lane: 'scene' },
      { text: "Arousal ceiling spikes into festival-EDM territory at the drop — the cue is partying where the brand wants it to inspire, and those are different emotional jobs. Dimensional misread.", lane: 'scene' },
      { text: "Lyric content carries an explicit relationship narrative — the song is about a person, and corporate aspirational use cannot accommodate that personal specificity. Instrumental version exists but the cue was written around the topline.", lane: 'lyrics' },
      { text: "Cue is built on a heavily processed vocal sample that registers as a recognizable artist-identity marker — the brand cannot rent that identity for the duration of the campaign without licensing the artist relationship.", lane: 'lyrics' },
      { text: "Master is owned by a label whose corporate-use approval policy requires a CMO-level sign-off and a two-week internal review — campaign go-live is in nine days. Operational timeline failure.", lane: 'rights' },
      { text: "Composition contains an interpolation of a 1980s pop standard whose publisher administration has historically required corporate-use fees three times the show's standard rate card. Budget eliminates it.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 15. NATURE / PASTORAL — Spacious, organic, unhurried, yields to picture
  // -------------------------------------------------------------------------
  "nature-pastoral": {
    PASS: [
      "Cue is built from acoustic guitar, hammered dulcimer, and a single sustained string pad — the instrumentation itself does the pastoral work without any electronic layer to break the organic register. Yields to picture entirely.",
      "Tempo at {tempo} BPM and a long-breathing arrangement give the editor permission to let the picture take its time — the cue does not rush the cut. Underscores without competing through the wide-shot landscape coverage.",
      "Tonal palette is modal and unhurried with no clear cadential resolution before the outro — the music shares the picture's relationship to time rather than imposing its own structure. Drives the cut without dictating it.",
      "Spectral weight is light across the full band, leaving the natural-sound design layer (wind, water, birdsong) entirely uncontested. Mix hierarchy is documentary-grade and clears for nature-doc episodic use.",
      "Dynamic arc holds nearly flat for the first two minutes and lifts almost imperceptibly into the bridge — the cue's restraint is its emotional argument. Lands the turn quietly on the herd-on-the-ridge reveal.",
      "Outro fades into a single sustained tone that bleeds into ambient location sound — the cue does not announce its ending. Candidate for episodic recurrence as the show's pastoral motif.",
      "The arrangement has no drum or percussion element of any kind — the pulse comes from the harmonic rhythm and the natural decay of acoustic instruments. Rhythm without rhythm instruments, which is the pastoral grammar.",
      "Recording environment is audibly outdoor-ish — the acoustic of the instruments suggests space rather than a studio — and that ambient acoustic quality blends with location sound rather than competing with it.",
      "Tonal color holds across the arrangement without any modulation or key change — the music exists outside of narrative time and can serve any length of landscape coverage without implying progress.",
      "Melodic content is minimal and intervalically simple — thirds and fourths, nothing chromatic — which keeps the music below the audience's conscious attention while carrying the landscape's emotional weight.",
      "The cue has a clean loop architecture: the phrase structure circles back without a seam, and extended pastoral coverage can use the loop without the audience noticing the join.",
      "Instrumental blend is calibrated to sit below birdsong and wind in the mix hierarchy — the cue is designed to share the sonic stage with natural sound rather than occupy it.",
    ],
    MAYBE: [
      "Spaciousness is present but the cue introduces a melodic theme past the first section that pulls the audience's attention from the picture to the music — works for a featured beat, competes with wallpaper underscore. Editorial call.",
      "Organic instrumentation serves the brief but the mix has a forward acoustic guitar in the same register as on-camera voiceover narration. Stems pull or instrumental alt would resolve.",
      "Unhurried pacing is right but the cue's arrangement is structurally a song with verse-chorus-verse architecture — pastoral coverage typically wants ambient flow rather than song shape. Director call.",
      "Tonal palette serves the brief but the cue's harmonic vocabulary is regionally specific — a Celtic register that locks the picture to a geography the documentary may not be claiming. Geography pre-check.",
      "Yields to picture correctly but the cue runs short for most pastoral coverage — the music editor will need to identify a clean loop point or the cue will feel like it announced its ending mid-scene.",
      "Cue is pastoral-grade but the master is administered by a library whose non-exclusive distribution has placed it heavily in nature-documentary catalog over the past three years. Sonic-fingerprint review.",
      "Organic register is present but the recording has a studio sheen — the reverb is clearly artificial rather than environmental — which places the music in a production context rather than a landscape context. Director call.",
      "Pastoral palette holds but the cue's melodic content develops in a way that is too purposeful for wallpaper underscore — the music argues rather than observes. Editorial-glue function versus featured-moment function.",
      "Unhurried quality is correct but the cue's phrase endings have a clear cadential shape that introduces a narrative feeling — the music implies arrival where the landscape brief needs the camera to always still be traveling.",
      "Spaciousness is genuine but the arrangement has a slight production loudness that prevents it from genuinely receding — pastoral coverage needs to be mixable to near-inaudible without losing its character. Level audit before commit.",
      "Organic instrumentation is right but the cue's low-end pickup from the acoustic guitar creates a frequency bump that competes with location sound at certain scene levels. High-pass treatment may be needed at the dub stage.",
      "Register and texture serve the brief but the cue has a compositional personality — it is clearly someone's artistic statement rather than a utility underscore — and some pastoral briefs need the music to be genuinely anonymous.",
    ],
    FAIL: [
      { text: "Valence reads warm-bright in a way that editorializes the landscape — pastoral coverage typically wants emotional neutrality so the picture can carry the emotional read. The cue tells the audience how to feel about the field.", lane: 'scene' },
      { text: "Arousal arc lifts into a romantic peak in the second half that converts the pastoral register into a relationship cue — the music brings character interiority where the brief wants observational distance. Dimensional misread.", lane: 'scene' },
      { text: "Arousal and production register both misread the brief — the programmed kick lifts the energy floor above pastoral's still-observation register, and the synth bass immediately denominates the cue as electronic, which contradicts the organic acoustic world the brief requires regardless of what's layered above it.", lane: 'scene' },
      { text: "The cue cannot breathe with the picture — brick-wall limiting compresses the dynamic range pastoral coverage depends on to sit quietly under landscape visuals, and the master's loudness floor means pulling back to pastoral level renders the music inaudible. The brief requires a cue that can genuinely recede; this one cannot.", lane: 'scene' },
      { text: "Pastoral coverage needs the music to be part of the landscape rather than addressing it — the vocal-forward arrangement introduces a human presence that the documentary's observational register is built to exclude. Instrumental version would need to stand as nature-documentary-grade underscore on its own; the stems confirm the arrangement was not designed for that function.", lane: 'lyrics' },
      { text: "Word density in the vocal is incompatible with landscape documentary pacing — the lyric fills space that pastoral coverage reserves for natural sound design, and the constant vocal presence means the music editor cannot duck the cue to let wind or ambient sound through without removing what makes the cue work. Density fit scores against the brief's spacious, recessive register.", lane: 'lyrics' },
      { text: "Master is owned by an artist whose public stance on nature-documentary licensing was a published refusal in a trade interview six months ago. Reputational pre-clear is the gating issue.", lane: 'rights' },
      { text: "Composition uses a sample of a field recording made by a third-party documentarian whose rights to that recording are still in dispute. Pre-clear on the underlying sample is the chain-of-title problem.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 16. MONTAGE / TRANSITION — Neutral energy, passage of time, editorial glue
  // -------------------------------------------------------------------------
  "montage-transition": {
    PASS: [
      "Cue holds a steady mid-tempo pulse with a deliberately neutral tonal palette — neither bright nor dark — exactly what editorial glue between scenes requires. Drives the cut without dictating it across four locations.",
      "Arrangement is rhythmically consistent without melodic specificity — the cue's job is to carry temporal continuity, not to assert a feeling, and the topline understands that. Yields to dialogue and lifts on the cut to the new location.",
      "Forward momentum is steady at {tempo} BPM with a four-bar phrase structure that lets the editor cut on every fourth bar without phrase-end artifacts. Underscores without competing across passage-of-time coverage.",
      "Spectral weight is balanced across the band with no register dominant — the cue functions as connective tissue rather than scene-driving content. Mix hierarchy is editorial-glue grade.",
      "Tonal palette is harmonically open — suspended chords without strong cadential motion — which means the cue can absorb whatever emotional direction the surrounding scenes establish. Lands the turn at every transition cleanly.",
      "Outro ends on a clean fade rather than a button — the cue dissolves into the next scene rather than closing the previous one. Candidate for repeated episodic transition use across season.",
      "The cue's arrangement has no moment of particular expressive interest — it maintains a consistent surface from bar one to the fade. That sustained neutrality is the exact quality that makes it editorial glue rather than a scene comment.",
      "Temporal coding is the cue's function, and it delivers it in the simplest way: a consistent forward pulse that the audience reads as time passing without registering as a tempo. Passage-of-time without editorial assertion.",
      "Mix hierarchy creates a specific relationship with picture: the music is audible but not prominent — the audience is aware of sonic continuity without attending to its content. That level of musical presence is exactly what transitions require.",
      "The cue can be started at any point without sounding like it was edited — every section has the same texture and presence. The editor has a fully interchangeable block of time.",
      "Harmonic choices are functional rather than expressive — suspended second and fourth intervals that neither resolve nor significantly progress. The music occupies time without taking a position.",
      "The cue's density is optimized for the transition brief's typical use: at low level under picture cuts, with occasional rises to mark the midpoint of the temporal sequence. The arrangement does not resist any of those editorial choices.",
    ],
    MAYBE: [
      "Neutral energy is intact in the verse but the chorus introduces a melodic hook that pulls the cue out of editorial-glue function into featured-music territory. Editorial call on whether the lift helps or hurts.",
      "Forward momentum serves the brief but the cue's tonal palette tilts slightly hopeful — works for a montage transitioning toward resolution, competes with one transitioning toward conflict. Direction-of-arc check.",
      "Cue is structurally transition-grade but the mix has a forward bass line that may compete with low-frequency sound design at scene cuts. Music-editor pass on the low end before commit.",
      "Editorial glue function is correct but the cue runs longer than most transitions — needs a cutdown set or a clean exit point at the first chorus.",
      "Cue serves the brief but the publishing flag indicates an unresolved share with a co-writer who has historically had inconsistent approval timelines. Pre-clear before commit.",
      "Neutral register lands but the cue includes a brief vocal phrase in the middle section that may pull audience attention from picture to music. Instrumental alt would resolve cleanly.",
      "Temporal continuity is the brief's requirement and the cue delivers it, but the production aesthetic has a character — a particular groove — that accumulates over multiple uses in the same episode. Repeated transition use may tip from glue to wallpaper.",
      "Editorial-glue function is present but the cue's harmonic rhythm is too active — the chords change too frequently to maintain the neutral, sustained-time quality that passage-of-time coverage depends on.",
      "Neutral palette holds but the cue's dynamic arc does not — there is a slight energy increase past the midpoint that the music editor will need to account for if the transition is expected to hold a consistent presence level throughout.",
      "Continuity function is correct but the cue's arrangement has a percussion accent pattern that the editor's ear will lock to — once the pattern is heard, it is harder to hear the music as glue rather than event.",
      "Transition register serves the brief but the cue was engineered loud — the mix headroom is narrow, which means there is no level the editor can set that makes the cue genuinely recessive. Re-master or high-shelf attenuation before commit.",
      "Forward momentum is editorially functional but the cue has a slightly legible emotional valence — it reads as slightly optimistic — which may compete with a transition heading into a dark narrative development.",
    ],
    FAIL: [
      { text: "Valence is too pronounced in either direction — the cue commits to a clear emotional read that editorial glue specifically should not. Neutral energy is the brief; this cue editorializes.", lane: 'scene' },
      { text: "Arousal arc has a peak-and-valley shape that imposes its own dramatic structure on the cut — montage transition coverage cannot accommodate music with its own three-act arc. Dimensional misread.", lane: 'scene' },
      { text: "Neutral energy is fractured before the transition can begin — the hard tempo change in the opening section breaks the temporal continuity that passage-of-time coverage exists to sustain, and a cue whose arousal discontinuity is the first thing the editor hears cannot serve as editorial glue. Transitions require invisible seams; this one announces itself.", lane: 'scene' },
      { text: "Editorial-glue function requires the music to be nearly invisible between scenes — a vocal-forward arrangement means the audience hears a song rather than a transition, and the lyric's presence marks the edit point with a foregrounded performance rather than dissolving across it. Instrumental alt does not appear in the catalog; the vocal is structurally load-bearing.", lane: 'lyrics' },
      { text: "Lyric content is narratively specific — the song is about a person and a place — which competes with editorial-glue use that requires the music to recede from semantic foreground. Wrong song for the function.", lane: 'lyrics' },
      { text: "Master is owned by a sync library with rate-card ambiguity around episodic transition use — the per-use fee on a recurring placement adds up faster than the show's per-episode music budget allows.", lane: 'rights' },
      { text: "Track was previously placed as featured music in the same showrunner's prior series — recurring transition use of the same cue would create on-the-nose self-reference. Sonic-identity flag, not legal flag.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 17. TRIUMPH / VICTORY — Victory arc, peak arousal, crowd energy
  // -------------------------------------------------------------------------
  "triumph-victory": {
    PASS: [
      "Cue earns its triumph through a progressive build — verse, lift, full-band chorus at the peak — exactly the arc a victory sequence is asking the audience to share. Drives the cut without dictating it on the championship-shot reveal.",
      "Anthemic chorus lands on the title-card lift with the full arrangement entering on the same downbeat — gives the editor a single, decisive landing surface for the trophy moment. Lands the turn cleanly.",
      "Tonal palette is major-key triumphant without the saccharine register — the cue celebrates without flattering, which keeps the victory feeling earned rather than gifted. Strong candidate for highlight-reel and end-credits use.",
      "Spectral weight is full and broadcast-ready — the cue translates from stadium PA to streaming-broadcast without losing low-end weight. Mix hierarchy is sports-broadcast grade.",
      "Dynamic arc has a stripped bridge before the final chorus — gives the editor a deadpan beat for the slow-motion player reaction before the music returns to peak crowd-energy. Underscores without competing.",
      "Outro holds the final chord under the credit roll for an extended run — the cue is built to bleed across post-game coverage without artificial extension. Candidate for season-recap and trailer use.",
      "The cue's anthem quality comes from melodic simplicity rather than from sheer volume — the chorus is singable, which gives the victory sequence a sense of communal ownership rather than individual heroism.",
      "Arrangement gives the editor a genuine three-act structure within the victory beat: the quiet before the win, the moment of the win, and the celebration after. The music scripts the emotional sequence rather than just arriving at the peak.",
      "Brass writing in the climax is arranged to sit above the crowd noise in the audio mix — the cue can run simultaneously with stadium PA and ambient crowd without the music losing its presence in the mix.",
      "The cue's strongest moment is neither the loudest nor the highest note — it is a moment of harmonic arrival that registers as resolution rather than volume. That restraint in the peak is what separates triumph from mere loudness.",
      "Victory register is held from the moment of the win through the end of the credits without any tonal departure — the cue does not second-guess the outcome. No minor-key shadow, no bittersweet bridge.",
      "Stems split the celebratory elements from the foundational rhythmic layer — the music editor can strip back to the rhythm-only layer for the moment of effort and bring in the full arrangement on the moment of victory.",
    ],
    MAYBE: [
      "Victory arc is structurally correct but the cue's lyric names a specific sport — football — that may or may not match the production's actual coverage. Pre-clear lyric specificity against the cut.",
      "Crowd-energy register lands but the cue's tempo at {tempo} BPM is slower than most sports-triumph cutdowns use — works for a slow-motion-emotional victory beat, competes with a fast-cut highlight reel.",
      "Anthemic peak is real but the cue's early vocal entry commits the music to a performer-identity that the brand may or may not want to associate with. Director-level call.",
      "Tonal palette is sports-grade but the cue's outro runs longer than most highlight-reel cuts need — needs a 60- and 90-second cutdown set before commit.",
      "Cue serves the brief but the master is heavily associated with a specific team's broadcast use — sonic-identity collision risk if the production is covering a competing franchise. Pre-clear with the league.",
      "Triumph register is correct but the cue's harmonic language tilts religious-spiritual — the choir-and-organ texture works for some victory beats and reads exploitative in others. Director call.",
      "Anthemic quality is present but the cue's build is too even — the emotional escalation is consistent throughout rather than having a clear inflection point for the decisive moment. The peak is everywhere and therefore nowhere.",
      "Victory register is real but the arrangement is pop-coded in a way that may date the production — a sound that has a clear release year. Sports-triumph coverage benefits from a less era-specific aesthetic. Director call.",
      "Triumph palette is correct but the cue peaks in the second chorus and then plateaus — the editor will be working with sustained intensity rather than an escalating arc through the victory sequence's final moments.",
      "Crowd-energy register lands but the mix has a compressed loudness ceiling that prevents the emotional dynamic from breathing — the triumph cannot swell because the master's peak has already been reached at the first chorus.",
      "Cue serves the victory sequence but the harmonic language is more personal-triumph than collective-victory — the cue reads intimate where the brief needs communal. Works for an individual athlete moment; less so for a team-celebration sequence.",
      "Triumph register is present but the arrangement's rhythmic grid is at a tempo where slow-motion coverage will read the pulse as too slow for kinetic cuts and the kinetic editing will fight the half-time feel of a slow-motion highlight.",
    ],
    FAIL: [
      { text: "Arousal ceiling is below the brief — the cue gestures at peak energy but never fully commits, leaving the picture's crowd-energy carrying the room alone. Dimensional shortfall.", lane: 'scene' },
      { text: "Valence reads bittersweet — the harmonic palette has minor-key shadow that converts triumph into nostalgic-victory, which is a different emotional register from a peak-arousal sports brief.", lane: 'scene' },
      { text: "Crowd energy cannot be sustained — victory coverage requires the music to hold the arousal peak through the championship moment, reaction shots, and credit roll, and a track that runs short of that combined runtime with no clean loop leaves the picture without the arc the brief is built on. The peak arrives but cannot sustain.", lane: 'scene' },
      { text: "Explicit vocal content on the master creates a broadcast barrier for sports highlight use — league broadcasts and network sports programming clear to the family standard, and an explicit flag without a confirmed clean version removes the track from the brief's primary distribution context. Instrumental alt is the standard path; the catalog does not list one.", lane: 'lyrics' },
      { text: "Lyric content is explicitly about a romantic relationship — the song is widely recognized as a love song and using it under championship coverage would read as misappropriation. Wrong cultural register.", lane: 'lyrics' },
      { text: "Master is controlled by a label with a standing carve-out against league and sport-association use absent additional licensing fees that exceed the production's budget. Operational cost barrier.", lane: 'rights' },
      { text: "Track is a one-stop on the master side but the publishing has been recently transferred between administrators with metadata not yet reconciled at the PRO. Sports broadcast cue-sheet filing risk.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 18. GRIEF / LOSS — Low arousal, high emotional weight, unresolved
  // -------------------------------------------------------------------------
  "grief-loss": {
    PASS: [
      "Cue is solo piano with a string entry in the second section — sparse, restrained, and emotionally heavy without performing the grief for the audience. Yields to dialogue and silence equally; gives the editor room to breathe.",
      "Arrangement holds at near-silence for the first forty seconds, which lets the picture's silence become the cue's silence — the music shares the scene's stillness rather than filling it. Underscores without competing.",
      "Tonal palette refuses to resolve — the harmonic motion circles a tonic without ever landing — which mirrors the unresolved emotional register the brief requires. Lands the turn on the casket-side beat.",
      "Spectral weight is concentrated in the mid-low register where mourning lives sonically — the cue does not reach for sentimental high strings, which keeps the grief from tipping into manipulation. Mix hierarchy is restrained.",
      "Dynamic arc never crosses a middle threshold — the cue holds at low arousal across the full duration, which respects the audience's grief rather than directing it. Drives the cut without dictating it.",
      "Outro fades on a suspended chord that does not resolve — the cue leaves the audience inside the loss rather than walking them out of it. Candidate for end-credits placement on a memorial episode.",
      "The cue does not console — it holds. There is no harmonic warmth, no orchestral swell of comfort, no resolution into a manageable key. The music stays in the loss alongside the audience rather than guiding them through it.",
      "Melodic content is fragmentary rather than complete — partial phrases that do not develop or return. The musical language of incompleteness is the correct grammar for the brief.",
      "Silence is treated as a musical element: the cue's rests are as long as its notes, which gives the editor genuine near-silence passages to work with during the scene's heaviest moments.",
      "The cue's instrumentation is non-sentimental — cello and low brass rather than violin and flute — which prevents the music from reaching for an emotional resolution the picture is not offering.",
      "Harmonic weight is carried by the low strings without any upper-register relief — the grief has no escape into brightness. The emotional argument is structural.",
      "The cue is designed around subtraction: elements disappear over time rather than accumulating, which means the music becomes quieter and more isolated as the scene progresses. The loneliness increases in the music as it does in the scene.",
    ],
    MAYBE: [
      "Emotional weight is present but the cue introduces a melodic theme past the opening section that may editorialize the grief — works for a character-attached loss, competes with collective or ambient mourning coverage. Director call.",
      "Restraint serves the brief but the cue resolves to a major-key tonic in the closing section — that resolution offers the audience a comfort the brief is asking the picture to withhold. Editorial call on the cadence.",
      "Low-arousal register is right but the cue's vocal entry in the second half commits the lyric to a specific narrative of loss that may or may not match the picture's coverage. Lyric-against-locked-picture review.",
      "Tonal palette serves the brief but the mix has a forward piano that competes with whispered ADR or grief-coded breath foley. Stems pull lets the music editor recede the keyboard.",
      "Spectral intimacy reads correct for the brief but the signal's tension measure sits at the upper edge of the grief-loss target window — the cue is almost too tightly wound, which may push the scene toward dread rather than mourning. Director call on the specific emotional gradient.",
      "Unresolved register lands but the publishing flag indicates an estate-administered share that requires written approval for in-memoriam and grief-coded uses. Pre-clear timeline is the operational risk.",
      "Intimacy coefficient is high — the mix is close-mic'd and narrow in spectral spread — which serves the personal-loss reading but may feel claustrophobic in a wide-shot collective-mourning sequence. Scene geometry is the deciding variable.",
      "Tension measure holds in the grief-loss zone but the cue's spectral centroid sits slightly higher than the low-register weight the brief typically favors — the music is a half-shade brighter than ideal, which may tip toward elegiac rather than raw grief. EQ at the dub stage can address.",
      "Emotional weight is real but the cue's production has a slight aesthetic self-consciousness — the arrangement is beautiful, and some grief scenes need music that is less aware of how it sounds. Director call on the register.",
      "Low-arousal palette is correct but the cue's dynamic range is limited — everything sits in a narrow band between quiet and very quiet — which gives the music editor limited vocabulary to work with across a long scene.",
      "Grief register holds through the first half but the cue's second section has a subtle harmonic brightening — still in minor but reaching toward a less bleak position — that the editor will need to evaluate against the scene's specific emotional arc.",
      "Restraint is present but the cue's phrase structure has a regularity — four-bar phrases throughout — that imposes a mild rhythmic certainty on a scene that may benefit from more irregular, uncertain musical breathing.",
      "Emotional weight is carried correctly but the piano tuning has a slight brightness that sits at the edge of sentimental — a half-step darker tuning would serve the brief better. Remaster with EQ treatment at the dub stage.",
      "Low-arousal register is right but the cue runs very short — under ninety seconds — without a loop architecture. Most grief scenes are longer than that, and the music editor will need to solve the runtime problem before commit.",
    ],
    FAIL: [
      { text: "Valence sits warm-comforting where the brief asks for unresolved weight — the cue is consoling the audience when the picture is asking them to sit inside the loss. Wrong emotional dimension for grief work.", lane: 'scene' },
      { text: "Arousal arc rises into a hopeful peak in the back third that converts grief into healing — those are different emotional jobs, and the cue picks the wrong one for the brief. Dimensional misread.", lane: 'scene' },
      { text: "Arousal is set wrong from the first bar — the drum kit's backbeat immediately lifts the room above where grief can live, and a low-arousal memorial underscore cannot carry an audible kick and snare at any dynamic level without redirecting the audience's attention from the loss to the music.", lane: 'scene' },
      { text: "Dynamic range is incompatible with the brief's emotional register — commercial-pop limiting removes the quiet headroom that grief coverage depends on to hold at near-silence alongside the picture, and a master that cannot genuinely pull back cannot serve a scene built on what isn't said. The brief needs whisper-level presence; this master provides conversation-level floor.", lane: 'scene' },
      { text: "Memorial underscore depends on the music yielding to silence — the vocal-forward arrangement removes that option, because a lyric in the vocal band at any audible level is louder than the quiet the grief scene is built around. Without an instrumental alt, the cue cannot deliver the near-silence the brief requires; the vocal is the arrangement's center of gravity and the stems cannot subtract it.", lane: 'lyrics' },
      { text: "Word density in the vocal is incompatible with memorial coverage — the lyric occupies every measure of available sonic space, preventing the music editor from giving the scene's performance the foreground that grief work requires. The brief needs a cue that recedes at the weight; this vocal asserts forward throughout, and no instrumental version is listed in the catalog.", lane: 'lyrics' },
      { text: "Master is controlled by an artist whose public statement about a recent grief-coded placement was a rejection of the use category as a brand-protection issue. Reputational pre-clear required.", lane: 'rights' },
      { text: "Composition is administered by a publisher whose grief-and-memorial-use approval requires written family consent for the underlying songwriter — turnaround historically eight to twelve weeks. Post timeline does not accommodate.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 19. CONTEMPLATIVE / REFLECTIVE — Contemplative, timeless, non-denominational
  // -------------------------------------------------------------------------
  "contemplative-reflective": {
    PASS: [
      "Cue is built from sustained drone, hammered dulcimer, and a wordless vocal that enters in the second half — every textural choice points at contemplation without committing to a specific tradition. Underscores without competing.",
      "Tonal palette is modal and timeless — no harmonic vocabulary that locks the cue to a denomination or era. Yields to dialogue and breath equally; gives the editor room to sit in the moment.",
      "Spectral weight is balanced across the full band with no percussive transient anywhere in the arrangement — the cue functions as sonic stillness rather than musical event. Drives the cut without dictating it.",
      "Dynamic arc holds at low arousal with one gentle lift in the back third — the cue offers the audience a single moment of contemplative release without forcing it. Lands the turn on the wide-shot reveal of the landscape.",
      "Wordless vocal is the cue's emotional center and it carries no language, no specific lyric content, no traditional reference — exactly the non-denominational register the brief requires. Clears across documentary and narrative use.",
      "Outro fades on a sustained drone that bleeds across scene transitions — the cue extends the contemplative register beyond the cut. Candidate for episodic recurrence as a meditative motif.",
      "The cue occupies time without marking it — there are no structural signposts that divide the arrangement into beginning, middle, and end. The music simply is, for as long as the picture needs it.",
      "Harmonic change rate is extremely slow — one chord movement per thirty to forty seconds — which releases the audience from any sense of musical narrative and allows the picture to carry the forward motion.",
      "The arrangement has no identifiable cultural fingerprint: the timbral palette is assembled from instruments with no shared geographic or traditional origin. Placement across any cultural context without semantic conflict.",
      "Frequency content is concentrated in the upper-mid range — above the dialogue band, below the sibilance band — which allows the cue to coexist with voice-over without spectral competition at any level.",
      "The cue's slowest moments are its most expressive — the pauses between events carry as much meaning as the sounds themselves. That relationship to silence is the brief's correct grammar.",
      "Production is unobtrusive: the recording sounds like the instruments were placed in a large, resonant space and left to decay naturally. No production intervention is audible; the music feels undiscovered rather than made.",
    ],
    MAYBE: [
      "Contemplative register is present but the cue's wordless vocal is recognizably stylized in a regional tradition — works for a documentary engaging with that tradition, reads as appropriation in a non-denominational brief. Director call.",
      "Timeless quality serves the brief but the cue introduces a melodic motif past the first section that may be heard as character-attached — works for a personal-spirituality scene, competes with collective contemplation. Editorial call.",
      "Tonal palette is right but the cue's mix has a pronounced organ register that some audiences will hear as church-coded regardless of harmonic vocabulary. Pre-clear with the showrunner on denominational neutrality.",
      "Cue is contemplative-grade structurally but runs longer than most reflective scenes need — needs a clean exit at the first vocal entry or a music-editor cutdown.",
      "Reflective register is correct but the cue's bridge in the closing section lifts into emotional peak that pulls the audience out of contemplation into catharsis. Editorial call on whether the arc serves the picture.",
      "Cue serves the brief but the master is administered by a meditation-and-wellness label whose distribution may have placed it across the wellness-app market — sonic familiarity with that context.",
      "Contemplative palette is present but the cue's mix is slightly over-reverbed — the decay is longer than the space the recording implies, and that mismatch is audible on close listening. Re-master or dry mix before commit.",
      "Reflective register holds but the arrangement has a development arc that builds toward a conclusion — the music tells a story rather than creating a space. Some contemplative briefs need the music to be genuinely static.",
      "Timeless quality is correct but the cue's drone tuning is slightly flat of equal temperament, which gives it a specific acoustic quality some audiences will find centering and others will find subtly uncomfortable. Pre-audition before commit.",
      "Non-denominational requirement is met by the timbral palette but the cue's minor modality has a spiritual coding that is not tradition-specific but is still devotional in register. Director call on whether devotional without denomination serves.",
      "Contemplative texture is present but the cue's phrase length is metrically consistent — a fixed phrase structure that the audience will eventually begin to track consciously. Longer or irregular phrase durations would serve the brief better.",
      "Reflective color is correct but the production era is identifiable — the ambient production aesthetic belongs to a specific contemporary period of film-music fashion, which may work against the timeless register the brief requires.",
    ],
    FAIL: [
      { text: "Valence reads explicitly devotional in a way that locks the cue to a specific tradition — the brief requires non-denominational neutrality and this cue cannot deliver it without editorializing the tradition out.", lane: 'scene' },
      { text: "Arousal arc rises into a triumphant peak that converts contemplation into celebration — those are different emotional registers and the cue picks the wrong one. Dimensional misread.", lane: 'scene' },
      { text: "Arousal and temporal structure both misread the brief — the 4/4 backbeat anchors the listener in rhythmic time rather than releasing them from it, and the verse-chorus architecture imposes a narrative progression where the brief needs ambient openness. The arrangement is built like a song; the brief asks for a meditation.", lane: 'scene' },
      { text: "Meditative coverage needs music that functions as sonic atmosphere rather than a delivered performance — the vocal-forward arrangement introduces a performer addressing the listener, which breaks the ambient openness the brief requires. Instrumental version would need to read as non-denominational drone underscore on its own; the catalog confirms the track was built as a vocal showcase.", lane: 'lyrics' },
      { text: "Lyric content is in a recognizable scriptural language that immediately denominates the cue — non-denominational placement is structurally impossible regardless of the picture's intent. Wrong content for the use.", lane: 'lyrics' },
      { text: "Master is controlled by a religious-music label with a standing approval requirement that the use align with their stated theological position — review timeline runs four to eight weeks.", lane: 'rights' },
      { text: "Composition is registered to a writer who has publicly objected to non-denominational placement of their religious-tradition material as a cultural-stewardship matter. Reputational pre-clear is the gating issue.", lane: 'rights' },
    ],
  },

  // -------------------------------------------------------------------------
  // 20. URBAN / GRITTY — Brand energy, confident, modern, no lyric conflict
  // -------------------------------------------------------------------------
  "urban-gritty": {
    PASS: [
      "Cue holds modern production aesthetics — clean drum programming, a single forward synth lead, and a minimal harmonic bed — exactly the contemporary surface a product launch is asking for. Drives the cut without dictating it through the unboxing.",
      "Forward momentum is confident without overstating — the cue projects brand certainty without performing hype. Yields to voiceover and lifts on the product reveal. Clears for trailer use under the same brief.",
      "Instrumental arrangement eliminates any lyric-conflict risk for a category where the brand owns the message. Mix hierarchy is launch-grade and translates to social-cutdown formats without remix.",
      "Tonal palette is sleek and category-flexible — no genre marker that locks the cue to a specific industry. Strong candidate for tech, automotive, fashion, and consumer-electronics launch use within a single license.",
      "Dynamic arc lifts into the first chorus with the hero-product reveal landing on the same downbeat — gives the brand team a natural editorial hit point. Lands the turn cleanly on the logo lockup.",
      "Outro ends on a clean button at the campaign tagline — professional polish all the way through the deliverable, with stems and 15-, 30-, 60-second cutdowns confirmed at intake.",
      "Production is specifically calibrated for compressed-audio delivery — the arrangement translates its energy through earbuds and phone speakers without losing the confident register that makes the brief work. Platform-aware mix.",
      "Grit is in the production texture rather than in the harmonic language — the distortion and saturation add character without adding darkness. The confidence stays at the foreground.",
      "Mix is designed to sit under a fast-cut social edit: the transients are tight, the reverb tails are short, and nothing bleeds across an edit point in a way that would complicate a six-second cutdown.",
      "The cue's rhythmic grid is metrically precise — quantized to the beat — which means the brand team's internal edit can always find a musically correct cut point regardless of whether they have a music editor on the campaign.",
      "The arrangement's modernity is in the production choices rather than in the harmonic language, which means the cue will age more gracefully than a harmonic-trend-coded equivalent. The beat ages; the melody does not.",
      "Energy register reads as aspirational rather than aggressive — the confidence is forward-leaning rather than confrontational, which gives the brand flexibility across product categories and audience demographics.",
    ],
    MAYBE: [
      "Brand energy is intact in the verse but the cue's chorus introduces a recognizable melodic hook that may compete with the brand's audio mnemonic. Sonic-identity pre-clear with the brand team before commit.",
      "Modern register is correct but the cue's production aesthetic is genre-coded toward a specific musical movement that may date the campaign faster than the brand wants. Director-level call on the temporal lock-in.",
      "Confident tone lands but the cue's mix has a forward synth lead that may compete with voiceover in the same register. Stems pull lets the music editor mute the lead during V/O.",
      "Cue serves the brief but runs longer than most launch deliverables — needs 6-, 15-, 30-, 60-second cutdowns and a stems set before commit. Worth requesting all formats.",
      "Brand-energy register is correct but the master has been placed in an adjacent vertical's launch within the past twelve months — sonic-recognition risk in the same media buy. Pre-clear with the agency.",
      "Cue is launch-grade structurally but the publishing flag indicates an unresolved share with a co-writer whose backend has been inconsistent on commercial-use approvals. Pre-clear before commit.",
      "Urban palette is present but the cue's production is mixed loud in a way that will hit social platform normalization loudness targets and emerge audibly soft relative to surrounding content. Re-master for platform delivery.",
      "Confident register lands but the arrangement's genre coding is specific enough to imply a demographic — a listener who doesn't share that cultural context will hear it as belonging to someone else's brand rather than theirs. Audience alignment check.",
      "Gritty texture is correct but the cue's harmonic vocabulary is darker than the brief specifies — a minor-key bed under what should be a confident modern surface reads as menace rather than authority. Harmonic palette adjustment.",
      "Modern production is correct but the cue's rhythmic feel is loose rather than tight — a slight-behind-the-beat performance aesthetic that reads as cool in a music context and as imprecise in a brand-launch context. Tight mix preferred.",
      "Launch-grade energy is present but the cue's texture is dense at every dynamic level — there is no recessive version of this mix, which means it will always compete with voiceover unless the stems are used. Confirm stems architecture before commit.",
      "Contemporary palette is correct but the cue's lead element is a recognizable software synthesizer preset — an instrument sound associated with a specific production-software era. Authenticity risk for a brand claiming originality.",
    ],
    FAIL: [
      { text: "Valence reads moody-introspective in a way that contradicts the confident-modern register a launch brief requires. Wrong emotional dimension for a brand moment built on assertion.", lane: 'scene' },
      { text: "Arousal floor sits below what launch energy demands — the cue ambles where the brand wants it to motor, and a modern launch needs forward propulsion. Dimensional shortfall.", lane: 'scene' },
      { text: "The confident-modern surface the brief requires cannot survive its primary delivery context — social-platform loudness normalization compresses brick-wall limited masters into audible artifacting, and an urban launch brief lives in TikTok and Reels formats. The brand surface degrades exactly where the brief places it.", lane: 'scene' },
      { text: "Track contains explicit vocal content with a lyric narrative that competes directly with the brand's intended message — instrumental version exists but loses the topline that drove the song's recognition. Lyric conflict on the master version.", lane: 'lyrics' },
      { text: "Modern launch brief requires a clean master version for social distribution — brand placements across TikTok, Reels, and YouTube Shorts live under platform content policies where explicit flags trigger restricted delivery. Instrumental alt is the standard clearance path but the catalog does not confirm one; the master's vocal is the arrangement's primary element and removing it changes the track.", lane: 'lyrics' },
      { text: "Master is controlled by an artist whose public stance has been a categorical refusal of brand-launch placements as a creative-integrity policy — confirmed in trade press within the past year. Non-viable category.", lane: 'rights' },
      { text: "Composition contains an interpolation of a 1990s pop standard whose publisher has a standing brand-launch fee floor that exceeds the campaign's total music budget. Operational cost barrier, not editorial.", lane: 'rights' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers — tier mapping
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

// ---------------------------------------------------------------------------
// Helpers — deterministic index
// ---------------------------------------------------------------------------

/**
 * Deterministically derive a phrase-pool index from (trackId, briefId, artistName).
 * Uses sha256(trackId + briefId + artistName), takes the first 8 hex characters,
 * parses them as an unsigned 32-bit integer, and returns modulo poolSize.
 *
 * artistName is included so tracks by different artists on the same brief cannot
 * collide even with a small pool.
 *
 * No randomness, no time-based input — same inputs always produce the same index.
 */
function deterministicIndex(
  trackId: string,
  briefId: string,
  poolSize: number,
  artistName?: string | null,
): number {
  if (poolSize <= 0) {
    throw new Error(
      `deterministicIndex: poolSize must be positive, received ${poolSize}`,
    );
  }
  const digest = createHash('sha256')
    .update(trackId + briefId + (artistName ?? ''))
    .digest('hex');
  const slice = digest.slice(0, 8);
  const value = parseInt(slice, 16);
  return value % poolSize;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Select a narrative phrase for a (trackId, briefId, sceneFitScore) triple.
 *
 * @param trackId       Unique track identifier (used for deterministic hashing).
 * @param briefId       Scene brief type key (must exist in NARRATIVE_DICTIONARY).
 * @param sceneFitScore Numeric fit score, typically 0–100.
 * @param padValues     Accepted for API compatibility; not used in tier selection.
 * @param meta          Optional track metadata for inline substitution.
 * @param format        'full' (default) returns the complete editorial phrase.
 *                      'short' returns "TIER — <first clause>" for list views.
 *
 * Returns a safe fallback string instead of throwing on invalid inputs.
 */
export function selectNarrative(
  trackId: string,
  briefId: string,
  sceneFitScore: number,
  padValues: PADValues,
  meta?: TrackMeta,
  format?: 'short' | 'full',
): string {
  // ── Input validation — return safe strings, never throw ──────────────────
  if (!trackId || typeof trackId !== 'string') {
    const msg = 'Invalid track identifier — cannot generate narrative.';
    return format === 'short' ? `FAIL — ${msg}` : msg;
  }
  if (!briefId || typeof briefId !== 'string') {
    const msg = 'Invalid brief identifier — cannot generate narrative.';
    return format === 'short' ? `FAIL — ${msg}` : msg;
  }
  if (!Number.isFinite(sceneFitScore)) {
    const msg = `Scene fit score "${String(sceneFitScore)}" is not a finite number — cannot generate narrative.`;
    return format === 'short' ? `FAIL — ${msg}` : msg;
  }

  void padValues;

  // ── Dictionary lookup — safe fallback on unknown briefId ─────────────────
  const pool = NARRATIVE_DICTIONARY[briefId];
  if (!pool) {
    const msg = format === 'short'
      ? `FAIL — Unknown scene brief "${briefId}"; no phrases available.`
      : `Unknown scene brief "${briefId}". Expected one of: ${Object.keys(NARRATIVE_DICTIONARY).join(', ')}.`;
    return msg;
  }

  // ── Tier & phrase selection ───────────────────────────────────────────────
  const tier = tierFromScore(sceneFitScore);

  let phrase: string;
  if (tier === 'FAIL') {
    const failPhrases = pool.FAIL;
    if (!failPhrases || failPhrases.length === 0) {
      const msg = `No phrases for brief "${briefId}" / tier FAIL.`;
      return format === 'short' ? `FAIL — ${msg}` : msg;
    }
    const idx = deterministicIndex(trackId, briefId, failPhrases.length, meta?.artistName);
    phrase = failPhrases[idx].text;
  } else {
    const phrases = pool[tier];
    if (!phrases || phrases.length === 0) {
      const msg = `No phrases for brief "${briefId}" / tier "${tier}".`;
      return format === 'short' ? `${tier} — ${msg}` : msg;
    }
    const idx = deterministicIndex(trackId, briefId, phrases.length, meta?.artistName);
    phrase = phrases[idx];
  }

  // ── Inline substitution ───────────────────────────────────────────────────
  const tempoStr = meta?.tempo != null ? String(Math.round(meta.tempo)) : null;
  if (tempoStr) phrase = phrase.replace(/\{tempo\}/g, tempoStr);

  // ── Format ────────────────────────────────────────────────────────────────
  if (format === 'short') {
    const dashIdx = phrase.indexOf(' — ');
    const shortReason = dashIdx > 20
      ? phrase.slice(0, dashIdx) + '.'
      : (phrase.indexOf('. ') > 20 ? phrase.slice(0, phrase.indexOf('. ') + 1) : phrase);
    return `${tier} — ${shortReason}`;
  }

  return phrase;
}

// ---------------------------------------------------------------------------
// Dynamic narrative composer
// ---------------------------------------------------------------------------
// Builds a per-track sync assessment from the track's actual audio properties.
// Replaces the static phrase-pool selection which suffered from visible
// duplicates (6 phrases × 3 tiers × 20 briefs = small pool, collisions in
// any shortlist of 4+). The composer guarantees that two tracks with
// different tempo / tonal / energy properties produce different prose,
// while preserving the editorial voice of the original dictionary.
// ---------------------------------------------------------------------------

const BRIEF_LANGUAGE: Readonly<Record<string, { register: string; demand: string }>> = {
  "chase-tension":          { register: "sustained-pursuit",      demand: "unresolved harmonic floor" },
  "action-combat":          { register: "peak-arousal set-piece",  demand: "decisive landing hits" },
  "heartbreak-separation":  { register: "retrospective montage",   demand: "bittersweet ambivalence" },
  "romance-intimacy":       { register: "close-proximity scene",   demand: "stillness and breath" },
  "emotional-resolution":   { register: "relationship-arc montage", demand: "warmth without sentiment" },
  "drama-confrontation":    { register: "dialogue underscore",     demand: "restraint and subtext" },
  "suspense-dread":         { register: "psychological thriller",   demand: "tritone-adjacent unease" },
  "horror-psychological":   { register: "non-diegetic horror",      demand: "atonal threat texture" },
  "quirky-offbeat":         { register: "deadpan comedy",           demand: "tonal wit, light touch" },
  "comedy-light":           { register: "upbeat comedy montage",    demand: "forward momentum, no shadow" },
  "opening-closing-title":  { register: "main-title",              demand: "world-building first impression" },
  "euphoria-celebration":   { register: "earned-release closer",    demand: "harmonic resolution after build" },
  "cinematic-epic":         { register: "theatrical-scale set piece", demand: "orchestral weight and patience" },
  "corporate-aspirational": { register: "brand-launch underscore",   demand: "polished forward optimism" },
  "nature-pastoral":        { register: "landscape documentary",     demand: "spacious organic restraint" },
  "montage-transition":     { register: "editorial-glue transition", demand: "neutral temporal continuity" },
  "triumph-victory":        { register: "highlight-reel triumph",    demand: "anthemic peak after build" },
  "grief-loss":             { register: "in-memoriam coverage",      demand: "low arousal, unresolved weight" },
  "contemplative-reflective": { register: "meditative reflection",   demand: "timeless non-denominational stillness" },
  "urban-gritty":           { register: "modern brand-launch",        demand: "confident contemporary surface" },
  "sports-highlight":       { register: "broadcast highlight reel",   demand: "kinetic crowd-energy build" },
  "true-crime-investigative": { register: "forensic documentary",     demand: "unresolved procedural dread" },
  "faith-inspirational":    { register: "uplift testimony",            demand: "redemptive harmonic resolution" },
  "kids-family":            { register: "family-safe placement",       demand: "bright safe surface, no shadow" },
  "trailer-promo":          { register: "theatrical trailer",          demand: "three-act tension-and-drop architecture" },
  "period-historical":      { register: "period-drama placement",      demand: "era-consistent instrumentation" },
};

function describeTempo(tempo: number | null | undefined): string {
  if (tempo == null || !Number.isFinite(tempo)) return "tempo not detected";
  const t = Math.round(tempo);
  if (t < 70)   return `patient ${t} BPM`;
  if (t < 90)   return `mid-tempo ${t} BPM`;
  if (t < 110)  return `walking-tempo ${t} BPM`;
  if (t < 130)  return `forward-leaning ${t} BPM`;
  if (t < 150)  return `uptempo ${t} BPM`;
  return `high-energy ${t} BPM`;
}

function describeCharacter(tonal: string | null | undefined, energy: string | null | undefined): string {
  const t = (tonal ?? "").trim().toLowerCase();
  const e = (energy ?? "").trim().toLowerCase();
  if (t && e) return `${t}, ${e}`;
  if (t) return t;
  if (e) return e;
  return "uncharacterized";
}

function describePadAlignment(pad: PADValues, briefId: string): { score: number; phrase: string } {
  // Re-derive the expected emotional home position inline so this function
  // is independent of any external map (some briefs in the dictionary do
  // not have a PAD home — those default to neutral 0.5/0.5/0.5).
  const home: Record<string, PADValues> = {
    "chase-tension":           { arousal: 0.75, valence: 0.20, dominance: 0.60 },
    "action-combat":           { arousal: 0.90, valence: 0.30, dominance: 0.80 },
    "heartbreak-separation":   { arousal: 0.30, valence: 0.25, dominance: 0.30 },
    "romance-intimacy":        { arousal: 0.25, valence: 0.65, dominance: 0.30 },
    "emotional-resolution":    { arousal: 0.40, valence: 0.55, dominance: 0.40 },
    "drama-confrontation":     { arousal: 0.30, valence: 0.35, dominance: 0.40 },
    "suspense-dread":          { arousal: 0.40, valence: 0.15, dominance: 0.50 },
    "horror-psychological":    { arousal: 0.35, valence: 0.10, dominance: 0.60 },
    "quirky-offbeat":          { arousal: 0.55, valence: 0.65, dominance: 0.50 },
    "comedy-light":            { arousal: 0.65, valence: 0.80, dominance: 0.55 },
    "opening-closing-title":   { arousal: 0.50, valence: 0.50, dominance: 0.50 },
    "euphoria-celebration":    { arousal: 0.65, valence: 0.80, dominance: 0.55 },
    "cinematic-epic":          { arousal: 0.75, valence: 0.40, dominance: 0.80 },
    "corporate-aspirational":  { arousal: 0.60, valence: 0.70, dominance: 0.65 },
    "nature-pastoral":         { arousal: 0.20, valence: 0.55, dominance: 0.30 },
    "montage-transition":      { arousal: 0.50, valence: 0.50, dominance: 0.45 },
    "triumph-victory":         { arousal: 0.85, valence: 0.85, dominance: 0.75 },
    "grief-loss":              { arousal: 0.15, valence: 0.20, dominance: 0.20 },
    "contemplative-reflective":{ arousal: 0.20, valence: 0.50, dominance: 0.30 },
    "urban-gritty":            { arousal: 0.70, valence: 0.60, dominance: 0.75 },
  };
  const expected = home[briefId] ?? { arousal: 0.5, valence: 0.5, dominance: 0.5 };
  const dA = Math.abs(pad.arousal - expected.arousal);
  const dV = Math.abs(pad.valence - expected.valence);
  const dD = Math.abs(pad.dominance - expected.dominance);
  const total = (dA + dV + dD) / 3;  // 0 = perfect, 1 = maximum mismatch

  // Identify the most-mismatched dimension to surface in prose
  let phrase = "";
  if (total < 0.12) {
    phrase = "emotional centre lines up with the brief";
  } else if (total < 0.22) {
    phrase = "emotional fit is close, with a small offset on one axis";
  } else if (dA > dV && dA > dD) {
    phrase = pad.arousal > expected.arousal
      ? "arousal sits above what the brief is asking for"
      : "arousal sits below the brief's energy floor";
  } else if (dV > dD) {
    phrase = pad.valence > expected.valence
      ? "valence reads warmer than the brief's tonal home"
      : "valence reads cooler than the brief wants";
  } else {
    phrase = pad.dominance > expected.dominance
      ? "dominance reads more assertive than the brief calls for"
      : "dominance reads more recessive than the brief's stakes";
  }
  return { score: 1 - total, phrase };
}

const PASS_OPENERS = [
  "PASS — lands cleanly against the brief",
  "PASS — viable placement",
  "PASS — clears the brief's editorial criteria",
  "PASS — strong candidate for the cut",
  "PASS — sync-grade fit",
];

const MAYBE_OPENERS = [
  "MAYBE — workable with editorial caveats",
  "MAYBE — partial fit, music-editor pass recommended",
  "MAYBE — borderline, depends on the cut",
  "MAYBE — usable but needs an alt mix",
  "MAYBE — close, with one axis off",
];

const FAIL_OPENERS = [
  "FAIL — wrong emotional register for the brief",
  "FAIL — structural mismatch with the cut",
  "FAIL — will not survive the picture",
  "FAIL — brief misalignment at the audio level",
  "FAIL — out of pocket for this coverage",
];

const PASS_CLOSERS = [
  "Yields to dialogue and lifts where the editor needs the music to land.",
  "Cue sheet and clearance path look uncomplicated.",
  "Worth pitching to the supervisor as a first-pass option.",
  "Recommended for the lead-card slot in the shortlist.",
  "Stems and alt mixes likely available on request.",
];

const MAYBE_CLOSERS = [
  "Director-level call on whether the offset reads as feature or leak.",
  "Worth a single music-editor pass before committing the picture.",
  "Hold in the considered pile pending a tighter alt.",
  "Pre-clear conversation before deeper commitment.",
  "Not the lead card, but earns a slot in the second tier.",
];

const FAIL_CLOSERS = [
  "Recommend dropping to the archive and pulling an alternative.",
  "Will not survive the music-editor's pass.",
  "Editorial energy is going the wrong direction for this cut.",
  "Better candidates exist for this brief.",
  "Move to archive; not a productive use of the supervisor's attention.",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/**
 * Compose a dynamic, per-track sync assessment grounded in the track's
 * actual audio properties (tempo, tonal character, energy character) and
 * PAD alignment to the brief. Each track produces unique prose — there is
 * no static phrase pool to collide against.
 */
export function composeNarrative(
  trackId: string,
  briefId: string,
  sceneFitScore: number,
  padValues: PADValues,
  meta?: TrackMeta,
): string {
  // Safety: bad inputs → readable fallback
  if (!trackId || !briefId || !Number.isFinite(sceneFitScore)) {
    return "FAIL — invalid inputs, cannot compose assessment.";
  }

  const tier = tierFromScore(sceneFitScore);
  const { phrase: padPhrase } = describePadAlignment(padValues, briefId);
  const tempoPhrase = describeTempo(meta?.tempo);
  const characterPhrase = describeCharacter(meta?.tonalCharacter, meta?.energyCharacter);
  const briefLang = BRIEF_LANGUAGE[briefId] ?? { register: briefId, demand: "the briefed emotional region" };

  // Hash uses every distinguishing input so two different tracks effectively
  // never produce identical text.
  const hashInput = `${trackId}|${briefId}|${meta?.tempo ?? ""}|${meta?.tonalCharacter ?? ""}|${meta?.energyCharacter ?? ""}|${sceneFitScore}`;
  const seed = parseInt(
    createHash("sha256").update(hashInput).digest("hex").slice(0, 8),
    16,
  );

  let opener: string;
  let closer: string;
  if (tier === "PASS") {
    opener = pick(PASS_OPENERS, seed);
    closer = pick(PASS_CLOSERS, seed >> 8);
  } else if (tier === "MAYBE") {
    opener = pick(MAYBE_OPENERS, seed);
    closer = pick(MAYBE_CLOSERS, seed >> 8);
  } else {
    opener = pick(FAIL_OPENERS, seed);
    closer = pick(FAIL_CLOSERS, seed >> 8);
  }

  // Body sentence — grounded in actual track data so it's always unique
  const body =
    `Audio profile reads ${characterPhrase} at ${tempoPhrase}; ` +
    `against a ${briefLang.register} asking for ${briefLang.demand}, ${padPhrase}. ` +
    `Scene-fit index resolves to ${Math.round(sceneFitScore)}/100.`;

  return `${opener}. ${body} ${closer}`;
}

// ---------------------------------------------------------------------------
// Score-driven lane selection (Part 2)
// ---------------------------------------------------------------------------
// Maps the dominant axis shortfall → LaneTag → selects from that phrase lane.
// The hash key is sha256(trackId + briefId), identical to selectNarrative,
// so frozen packets created before this function shipped are unaffected —
// those packets store the rendered explanation string, not a selection index.
// ---------------------------------------------------------------------------

/**
 * Axis → LaneTag mapping (Option A — axis-mirroring taxonomy).
 *   scene  → 'scene'   (PAD / tonal mismatch)
 *   lyrics → 'lyrics'  (arrangement / content mismatch)
 *   rights → 'rights'  (clearance friction)
 * signal axis is excluded from lane selection (max contribution 0.05).
 */
const AXIS_TO_LANE: Readonly<Record<'scene' | 'lyrics' | 'clearance', LaneTag>> = {
  scene:     'scene',
  lyrics:    'lyrics',
  clearance: 'rights',  // clearance axis maps to 'rights' lane (existing phrase pool)
} as const;

/**
 * Determine the dominant failure lane for a FAIL-tier brief.
 *
 * shortfall(axis) = (1 − vector[axis]) × WEIGHTS[axis]
 *
 * Tie-break ordering: scene > lyrics > rights.
 * Signal axis is excluded (max contribution 0.05 — noise floor).
 */
function dominantFailLane(vector: TrackVector): LaneTag {
  const shortfalls = {
    scene:     (1 - vector.scene)     * WEIGHTS.scene,
    lyrics:    (1 - vector.lyrics)    * WEIGHTS.lyrics,
    clearance: (1 - vector.clearance) * WEIGHTS.clearance,
  } as const;

  // Tie-break: scene wins unless another axis is strictly larger.
  // Ordering: scene > lyrics > clearance.
  const dominant: 'scene' | 'lyrics' | 'clearance' =
    shortfalls.clearance > shortfalls.lyrics && shortfalls.clearance > shortfalls.scene
      ? 'clearance'
      : shortfalls.lyrics > shortfalls.scene
        ? 'lyrics'
        : 'scene';

  return AXIS_TO_LANE[dominant];
}

/**
 * Select a FAIL-tier narrative phrase driven by which axis contributed
 * the most shortfall, rather than by position in a flat pool.
 *
 * For PASS and MAYBE tiers the function falls through to the standard
 * flat-pool selection so callers can use a single entry point.
 *
 * The hash key (sha256(trackId + briefId)) is identical to selectNarrative —
 * the phrase index differs only because the candidate set (lanePool) is smaller.
 *
 * @param trackId   Unique track identifier.
 * @param briefId   Scene brief key.
 * @param vector    Full scoring vector (scene, rights, lyrics, signal ∈ [0,1]).
 * @param meta      Optional track metadata for {tempo} substitution.
 */
export function selectNarrativeWithLane(
  trackId: string,
  briefId: string,
  vector: TrackVector,
  meta?: TrackMeta,
): string {
  if (!trackId || !briefId) {
    return 'Invalid inputs — cannot generate narrative.';
  }

  const pool = NARRATIVE_DICTIONARY[briefId];
  if (!pool) {
    return `Unknown scene brief "${briefId}"; no phrases available.`;
  }

  // Compute scene-fit score to determine tier
  const sceneFit = (
    vector.scene       * WEIGHTS.scene       +
    vector.clearance   * WEIGHTS.clearance   +
    vector.lyrics      * WEIGHTS.lyrics      +
    vector.audioSignal * WEIGHTS.audioSignal
  ) * 100;

  const tier = tierFromScore(sceneFit);

  let phrase: string;

  if (tier === 'FAIL') {
    // Lane-driven selection
    const lane     = dominantFailLane(vector);
    const lanePool = pool.FAIL.filter(fp => fp.lane === lane);

    const source = lanePool.length > 0 ? lanePool : pool.FAIL;
    const idx = deterministicIndex(trackId, briefId, source.length, meta?.artistName);
    phrase = source[idx].text;
  } else if (tier === 'PASS') {
    const phrases = pool.PASS;
    const idx = deterministicIndex(trackId, briefId, phrases.length, meta?.artistName);
    phrase = phrases[idx];
  } else {
    const phrases = pool.MAYBE;
    const idx = deterministicIndex(trackId, briefId, phrases.length, meta?.artistName);
    phrase = phrases[idx];
  }

  // {tempo} substitution
  const tempoStr = meta?.tempo != null ? String(Math.round(meta.tempo)) : null;
  if (tempoStr) phrase = phrase.replace(/\{tempo\}/g, tempoStr);

  return phrase;
}

// ---------------------------------------------------------------------------
// Exports (public surface + internals for testing)
// ---------------------------------------------------------------------------

export {
  NARRATIVE_DICTIONARY,
  tierFromScore,
  deterministicIndex,
};
// LaneTag, FailPhrase, BriefPool, TrackVector re-exported inline as types above
