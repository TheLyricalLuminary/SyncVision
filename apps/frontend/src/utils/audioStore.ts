// In-browser audio registry for demo mode.
// Uploaded File objects are kept as object URLs keyed by filename, so the
// results screen can play the actual audio the user dropped in — no backend
// round-trip needed. Object URLs live until the tab closes (or re-register).

const urls = new Map<string, string>();

export const audioStore = {
  register(filename: string, file: File): void {
    const prev = urls.get(filename);
    if (prev) URL.revokeObjectURL(prev);
    urls.set(filename, URL.createObjectURL(file));
  },

  get(filename: string): string | null {
    return urls.get(filename) ?? null;
  },
};
