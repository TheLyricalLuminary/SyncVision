/**
 * classifyBrief.ts — deterministic scene-category classifier (backend).
 *
 * Ported from apps/frontend/src/engine/classifyBrief.ts so the arc engine has a
 * server-authoritative category signal. Same keyword-hit-counting logic:
 * word-boundary regex, highest hit count wins, ties resolved by iteration
 * order, null when nothing matches.
 *
 * NOTE: this duplicates the frontend keyword map (which itself mirrors the
 * scene categories). A later cleanup should consolidate both — plus the PAD
 * table that lives in scores.ts / analysis.ts / demo.ts — into one shared
 * module. Tracked as debt; intentionally duplicated here to keep this addition
 * zero-risk to existing scoring paths.
 */

export type BriefId =
  | "chase-tension"
  | "action-combat"
  | "heartbreak-separation"
  | "romance-intimacy"
  | "emotional-resolution"
  | "drama-confrontation"
  | "suspense-dread"
  | "horror-psychological"
  | "quirky-offbeat"
  | "comedy-light"
  | "opening-closing-title"
  | "euphoria-celebration"
  | "cinematic-epic"
  | "corporate-aspirational"
  | "nature-pastoral"
  | "montage-transition"
  | "triumph-victory"
  | "grief-loss"
  | "contemplative-reflective"
  | "urban-gritty"
  | "sports-highlight"
  | "true-crime-investigative"
  | "faith-inspirational"
  | "kids-family"
  | "trailer-promo"
  | "period-historical";

const KEYWORDS: Record<BriefId, string[]> = {
  "chase-tension": ["chase", "pursuit", "running", "escape", "threat", "cornered", "fleeing", "hunted", "caught", "foot chase", "pursued"],
  "action-combat": ["fight", "combat", "battle", "explosion", "attack", "climax", "set piece", "war", "brawl", "shootout", "gunfire", "hand to hand"],
  "heartbreak-separation": ["breakup", "separation", "leaving", "loss", "past", "memory", "apart", "ended", "goodbye", "broke up", "departed", "long ago"],
  "romance-intimacy": ["kiss", "touch", "close", "together", "vulnerable", "love scene", "proximity", "bedroom", "embrace", "tender", "whisper", "breath", "intimate"],
  "emotional-resolution": ["relationship", "montage of", "time passing", "journey", "growth", "history", "arc", "compressed", "years", "looking back"],
  "drama-confrontation": ["argument", "confront", "tense", "dialogue", "subtext", "restraint", "accusation", "reveal", "standoff", "face off", "tense conversation"],
  "suspense-dread": ["dread", "unease", "slow burn", "psychological", "building", "something wrong", "anxiety", "creeping", "mounting", "foreboding", "tension building"],
  "horror-psychological": ["horror", "terror", "fear", "scared", "dark", "nightmare", "supernatural", "monster", "demon", "haunted", "evil", "sinister", "possessed"],
  "quirky-offbeat": ["quirky", "offbeat", "weird", "strange", "oddball", "eccentric", "deadpan", "witty", "indie", "awkward", "whimsical"],
  "comedy-light": ["comedy", "funny", "laugh", "light", "playful", "fun", "joke", "silly", "lighthearted", "humor", "comic"],
  "opening-closing-title": ["opening", "title", "intro", "end credits", "closing", "prologue", "epilogue", "opening sequence", "main title", "title card", "cold open", "tag scene", "act break", "stinger", "end card", "pre-title", "title sequence", "recap"],
  "euphoria-celebration": ["euphoria", "celebration", "party", "joy", "exuberant", "ecstatic", "dance", "jubilant", "celebrating", "rave", "festival"],
  "cinematic-epic": ["epic", "grand", "sweeping", "cinematic", "vast", "monumental", "legend", "heroic", "panoramic", "wide vista"],
  "corporate-aspirational": ["corporate", "aspirational", "brand", "ambition", "business", "success", "professional", "commercial", "aspirational montage", "product launch"],
  "nature-pastoral": ["nature", "pastoral", "wilderness", "mountain", "forest", "river", "countryside", "outdoors", "organic", "landscape", "meadow", "rural"],
  "montage-transition": ["montage", "transition", "passing", "sequence", "progress", "change", "time lapse", "in between", "needle drop", "source music", "interstitial", "wipe", "dissolve", "b-roll"],
  // NOTE: "finally" (in the frontend keyword set) is intentionally dropped here —
  // it is a generic pacing adverb that misclassifies emotional scenes as triumph.
  "triumph-victory": ["triumph", "victory", "won", "prevail", "overcome", "finish", "achievement", "glory", "champion", "wins"],
  "grief-loss": ["grief", "mourning", "funeral", "dying", "death", "lost", "sorrow", "devastating", "gone", "tragedy", "died", "eulogy"],
  "contemplative-reflective": ["contemplative", "reflective", "quiet", "introspective", "meditative", "calm", "peaceful", "still", "pondering", "thoughtful", "solitude", "bed", "underscore", "score adjacent", "ambient", "texture", "pad", "background", "atmospheric", "instrumental"],
  "urban-gritty": ["urban", "gritty", "city", "street", "raw", "rough", "hustle", "alley", "neon", "underbelly", "concrete"],
  "sports-highlight": ["sports", "highlight", "athlete", "game", "match", "stadium", "training", "competition", "tournament", "comeback", "rally", "halftime", "play", "score", "championship", "coach", "locker room", "draft", "combine", "espn", "nfl", "nba", "mlb", "soccer", "football", "basketball"],
  "true-crime-investigative": ["true crime", "investigation", "detective", "evidence", "witness", "case", "murder", "suspect", "interview", "surveillance", "crime scene", "arrest", "trial", "cold case", "unsolved", "documentary", "interrogation", "forensic", "crime", "criminal", "victim", "perpetrator", "tip line"],
  "faith-inspirational": ["faith", "church", "prayer", "spiritual", "redemption", "inspirational", "gospel", "devotion", "worship", "congregation", "sermon", "hope", "blessing", "testimony", "ministry", "uplift", "healing", "grace", "salvation", "hallmark", "faith-based", "christian", "religious"],
  "kids-family": ["kids", "children", "family", "animated", "playful", "adventure", "magical", "wonder", "toy", "playground", "school", "innocence", "cartoon", "storybook", "fairy tale", "bedtime", "childhood", "wholesome", "g-rated", "pg", "family friendly", "young"],
  "trailer-promo": ["trailer", "promo", "teaser", "campaign", "commercial", "spot", "broadcast", "launch", "preview", "sizzle", "reel", "brand film", "ad", "tvc", "key art", "one sheet", "marketing", "theatrical", "greenband", "redband", "tune", "anthem", "tv spot"],
  "period-historical": ["period", "historical", "era", "vintage", "wartime", "costume", "civil war", "world war", "ancient", "medieval", "victorian", "1920s", "1930s", "1940s", "1950s", "1960s", "1970s", "1980s", "period drama", "historical drama", "archival", "nostalgia", "prohibition", "colonial", "renaissance", "bygone"],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countHits(text: string, keywords: string[]): number {
  return keywords.reduce(
    (acc, kw) => acc + (new RegExp(`\\b${escapeRegExp(kw)}\\b`).test(text) ? 1 : 0),
    0,
  );
}

export interface BriefClassification {
  id: BriefId | null;
  top: number; // hit count of the winning category
  second: number; // hit count of the runner-up (for margin/confidence)
}

/**
 * Detailed classifier — returns the winning category plus the top two hit
 * counts so callers can derive a confidence/clarity signal.
 */
export function classifyBriefDetailed(briefText: string): BriefClassification {
  const text = briefText.toLowerCase();
  let bestId: BriefId = "montage-transition";
  let top = 0;
  let second = 0;

  (Object.entries(KEYWORDS) as [BriefId, string[]][]).forEach(([id, keywords]) => {
    const score = countHits(text, keywords);
    if (score > top) {
      second = top;
      top = score;
      bestId = id;
    } else if (score > second) {
      second = score;
    }
  });

  return { id: top > 0 ? bestId : null, top, second };
}

export function classifyBrief(briefText: string): BriefId | null {
  return classifyBriefDetailed(briefText).id;
}
