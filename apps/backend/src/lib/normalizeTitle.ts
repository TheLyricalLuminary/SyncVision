const VERSION_WORDS = new Set([
  'demo', 'master', 'final', 'mix', 'edit', 'v1', 'v2', 'v3', 'v4', 'v5',
]);

const PLATFORM_NAMES = new Set([
  'looperman', 'splice', 'landr', 'soundsnap', 'bandlab',
]);

/**
 * Derives a clean track title from a raw audio filename.
 *
 * Handles three common patterns:
 *   Artist_Name-Track_Title_Version.ext  →  strips artist prefix and version
 *   Track Title (Demo).ext               →  strips parenthesized version tag
 *   platform-id-slug-words-2.ext         →  strips platform/id noise tokens
 */
export function normalizeTitle(filename: string): string {
  let s = filename;

  // 1. Strip file extension
  s = s.replace(/\.[^.]+$/, '');

  // 2. If the section before the first hyphen uses underscores (Artist_Name
  //    pattern), strip it — the artist name is not the track title
  const firstHyphenIdx = s.indexOf('-');
  if (firstHyphenIdx > 0 && s.slice(0, firstHyphenIdx).includes('_')) {
    s = s.slice(firstHyphenIdx + 1);
  }

  // 3. Replace underscores and hyphens with spaces
  s = s.replace(/[_-]+/g, ' ');

  // 4. Remove parenthesized/bracketed version tags
  s = s.replace(/\s*[\(\[]\s*(demo|master|final|mix|v\d+|edit|clean|explicit)\s*[\)\]]\s*/gi, ' ');

  // 5. Split into words; pop trailing version/number tokens
  const words = s.split(/\s+/).filter(Boolean);

  while (words.length > 0) {
    const last = words[words.length - 1].toLowerCase();
    const noTrailingDigits = last.replace(/\d+$/, '');
    if (
      VERSION_WORDS.has(last) ||
      VERSION_WORDS.has(noTrailingDigits) ||
      /^\d+$/.test(last)
    ) {
      words.pop();
    } else {
      break;
    }
  }

  // 6. Filter noise tokens: platform names, pure numbers, single letters
  const filtered = words.filter((word) => {
    const lower = word.toLowerCase();
    if (PLATFORM_NAMES.has(lower)) return false;
    if (/^\d+$/.test(word)) return false;
    if (word.length === 1) return false;
    return true;
  });

  if (filtered.length === 0) return '';

  // 7. Title-case and join
  return filtered
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
