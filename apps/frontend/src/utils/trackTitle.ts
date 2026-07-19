/**
 * Normalize a raw uploaded filename into a readable track title.
 * Strips hash prefixes, extensions, "Official Video" noise, and trailing
 * track numbers; collapses underscores and " - artist" prefixes.
 */
export function cleanTrackTitle(raw: string): string {
  let t = raw;
  t = t.replace(/^[0-9a-f]{6,}_/i, '');
  t = t.replace(/_/g, ' ');
  t = t.replace(/\.(mp3|wav|flac|aiff?)$/i, '');
  t = t.replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K|Audio|Video|background\s+vocals?\s*\d*)\b/gi, '');
  t = t.replace(/\s+\d{1,3}\s*$/, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
  return t || raw;
}
