import { API_BASE } from '../utils/apiClient';

/**
 * Live clearable inventory from Jamendo, via the backend proxy
 * (GET /api/catalog/search). Real one-stop tracks a supervisor can license for
 * commercial sync. Returns [] on any failure so callers fall back to the
 * built-in CC BY catalog.
 */

export type LiveClearableTrack = {
  id: string;
  title: string;
  artist: string;
  license: string;
  commercialFree: boolean;
  licenseUrl: string;
  audioUrl: string | null;
  imageUrl: string | null;
  tags: string[];
};

// Scene brief → a Jamendo mood/genre tag for fuzzy search.
const MOOD_BY_BRIEF: Record<string, string> = {
  'chase-tension': 'action',
  'action-combat': 'action',
  'triumph-victory': 'epic',
  'euphoria-celebration': 'happy',
  'suspense-dread': 'dark',
  'horror-psychological': 'dark',
  'drama-confrontation': 'dramatic',
  'urban-gritty': 'urban',
  'romance-intimacy': 'romantic',
  'heartbreak-separation': 'sad',
  'grief-loss': 'melancholic',
  'contemplative-reflective': 'ambient',
  'emotional-resolution': 'emotional',
  'comedy-light': 'happy',
  'quirky-offbeat': 'funky',
  'montage-transition': 'indie',
  'opening-closing-title': 'cinematic',
  'cinematic-epic': 'epic',
  'corporate-aspirational': 'corporate',
  'nature-pastoral': 'relaxing',
};

export function moodTagFor(briefId: string, emotionalRegister?: string | null): string {
  if (MOOD_BY_BRIEF[briefId]) return MOOD_BY_BRIEF[briefId];
  const reg = (emotionalRegister ?? '').toLowerCase();
  if (/grief|sad|heartbreak|loss/.test(reg)) return 'melancholic';
  if (/tense|dread|dark|fear/.test(reg)) return 'dark';
  if (/triumph|epic|victory|hero/.test(reg)) return 'epic';
  if (/love|romance|tender|intimate/.test(reg)) return 'romantic';
  if (/happy|joy|euphor|uplift/.test(reg)) return 'happy';
  return 'cinematic';
}

export async function fetchLiveClearable(mood: string, limit = 6): Promise<LiveClearableTrack[]> {
  try {
    const url = `${API_BASE}/api/catalog/search?mood=${encodeURIComponent(mood)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { tracks?: LiveClearableTrack[] };
    return data.tracks ?? [];
  } catch {
    return [];
  }
}
