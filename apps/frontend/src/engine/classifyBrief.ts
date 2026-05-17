export type BriefId =
  | 'chase-tension'
  | 'action-combat'
  | 'heartbreak-separation'
  | 'romance-intimacy'
  | 'emotional-resolution'
  | 'drama-confrontation'
  | 'suspense-dread'
  | 'horror-psychological'
  | 'quirky-offbeat'
  | 'comedy-light'
  | 'opening-closing-title'
  | 'euphoria-celebration'
  | 'cinematic-epic'
  | 'corporate-aspirational'
  | 'nature-pastoral'
  | 'montage-transition'
  | 'triumph-victory'
  | 'grief-loss'
  | 'contemplative-reflective'
  | 'urban-gritty';

export const BRIEF_LABELS: Record<BriefId, string> = {
  'chase-tension': 'Chase / Tension',
  'action-combat': 'Action / Combat',
  'heartbreak-separation': 'Heartbreak / Separation',
  'romance-intimacy': 'Romance / Intimacy',
  'emotional-resolution': 'Emotional Resolution',
  'drama-confrontation': 'Drama / Confrontation',
  'suspense-dread': 'Suspense / Dread',
  'horror-psychological': 'Horror / Psychological',
  'quirky-offbeat': 'Quirky / Offbeat',
  'comedy-light': 'Comedy / Light',
  'opening-closing-title': 'Opening / Closing Title',
  'euphoria-celebration': 'Euphoria / Celebration',
  'cinematic-epic': 'Cinematic / Epic',
  'corporate-aspirational': 'Corporate / Aspirational',
  'nature-pastoral': 'Nature / Pastoral',
  'montage-transition': 'Montage / Transition',
  'triumph-victory': 'Triumph / Victory',
  'grief-loss': 'Grief / Loss',
  'contemplative-reflective': 'Contemplative / Reflective',
  'urban-gritty': 'Urban / Gritty',
};

const KEYWORDS: Record<BriefId, string[]> = {
  'chase-tension': [
    'chase', 'pursuit', 'running', 'escape', 'threat', 'cornered',
    'fleeing', 'hunted', 'caught', 'foot chase', 'pursued',
  ],
  'action-combat': [
    'fight', 'combat', 'battle', 'explosion', 'attack', 'climax',
    'set piece', 'war', 'brawl', 'shootout', 'gunfire', 'hand to hand',
  ],
  'heartbreak-separation': [
    'breakup', 'separation', 'leaving', 'loss', 'past', 'memory',
    'apart', 'ended', 'goodbye', 'broke up', 'departed', 'long ago',
  ],
  'romance-intimacy': [
    'kiss', 'touch', 'close', 'together', 'vulnerable', 'love scene',
    'proximity', 'bedroom', 'embrace', 'tender', 'whisper', 'breath',
    'intimate',
  ],
  'emotional-resolution': [
    'relationship', 'montage of', 'time passing', 'journey', 'growth',
    'history', 'arc', 'compressed', 'years', 'looking back',
  ],
  'drama-confrontation': [
    'argument', 'confront', 'tense', 'dialogue', 'subtext', 'restraint',
    'accusation', 'reveal', 'standoff', 'face off', 'tense conversation',
  ],
  'suspense-dread': [
    'dread', 'unease', 'slow burn', 'psychological', 'building',
    'something wrong', 'anxiety', 'creeping', 'mounting', 'foreboding',
    'tension building',
  ],
  'horror-psychological': [
    'horror', 'terror', 'fear', 'scared', 'dark', 'nightmare',
    'supernatural', 'monster', 'demon', 'haunted', 'evil', 'sinister',
    'possessed',
  ],
  'quirky-offbeat': [
    'quirky', 'offbeat', 'weird', 'strange', 'oddball', 'eccentric',
    'deadpan', 'witty', 'indie', 'awkward', 'whimsical',
  ],
  'comedy-light': [
    'comedy', 'funny', 'laugh', 'light', 'playful', 'fun', 'joke',
    'silly', 'lighthearted', 'humor', 'comic',
  ],
  'opening-closing-title': [
    'opening', 'title', 'intro', 'end credits', 'closing', 'prologue',
    'epilogue', 'opening sequence', 'main title', 'title card',
  ],
  'euphoria-celebration': [
    'euphoria', 'celebration', 'party', 'joy', 'exuberant', 'ecstatic',
    'dance', 'jubilant', 'celebrating', 'rave', 'festival',
  ],
  'cinematic-epic': [
    'epic', 'grand', 'sweeping', 'cinematic', 'vast', 'monumental',
    'legend', 'heroic', 'panoramic', 'wide vista',
  ],
  'corporate-aspirational': [
    'corporate', 'aspirational', 'brand', 'ambition', 'business',
    'success', 'professional', 'commercial', 'aspirational montage',
    'product launch',
  ],
  'nature-pastoral': [
    'nature', 'pastoral', 'wilderness', 'mountain', 'forest', 'river',
    'countryside', 'outdoors', 'organic', 'landscape', 'meadow', 'rural',
  ],
  'montage-transition': [
    'montage', 'transition', 'passing', 'sequence', 'progress', 'change',
    'time lapse', 'in between',
  ],
  'triumph-victory': [
    'triumph', 'victory', 'won', 'prevail', 'overcome', 'finish',
    'achievement', 'glory', 'champion', 'wins', 'finally',
  ],
  'grief-loss': [
    'grief', 'mourning', 'funeral', 'dying', 'death', 'lost',
    'sorrow', 'devastating', 'gone', 'tragedy', 'died', 'eulogy',
  ],
  'contemplative-reflective': [
    'contemplative', 'reflective', 'quiet', 'introspective', 'meditative',
    'calm', 'peaceful', 'still', 'pondering', 'thoughtful', 'solitude',
  ],
  'urban-gritty': [
    'urban', 'gritty', 'city', 'street', 'raw', 'rough', 'hustle',
    'alley', 'neon', 'underbelly', 'concrete',
  ],
};

export function classifyBrief(briefText: string): BriefId {
  const text = briefText.toLowerCase();
  let bestId: BriefId = 'montage-transition';
  let bestScore = 0;

  (Object.entries(KEYWORDS) as [BriefId, string[]][]).forEach(
    ([id, keywords]) => {
      const score = keywords.reduce(
        (acc, kw) => acc + (text.includes(kw) ? 1 : 0),
        0,
      );
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    },
  );

  return bestId;
}
