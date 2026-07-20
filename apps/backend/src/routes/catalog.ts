import { Router, Request, Response } from "express";

/**
 * Live clearable-catalog proxy — Jamendo.
 *
 * Returns real one-stop tracks a supervisor can license for commercial sync,
 * either free (CC BY / BY-SA, credit the artist) or via Jamendo Licensing's
 * one-stop commercial license (the `prourl`). The client id is read from the
 * JAMENDO_CLIENT_ID env var (set with `fly secrets set`), so it never ships in
 * the frontend bundle.
 *
 * Fail-safe by design: missing key, upstream error, or a bad response all
 * return `{ tracks: [] }` with 200, so the frontend simply falls back to the
 * built-in CC BY catalog and nothing breaks.
 */

const router = Router();

type JamendoTrack = {
  id: string;
  name: string;
  artist_name: string;
  license_ccurl?: string;
  shareurl?: string;
  prourl?: string;
  audio?: string;
  image?: string;
  musicinfo?: { tags?: { genres?: string[]; vartags?: string[] } };
};

type NormalizedTrack = {
  id: string;
  title: string;
  artist: string;
  license: string;          // e.g. "CC BY 4.0" or "All rights (license via Jamendo)"
  commercialFree: boolean;  // true when CC BY / BY-SA — usable free with credit
  licenseUrl: string;       // where to license / verify one-stop
  audioUrl: string | null;  // preview stream
  imageUrl: string | null;
  tags: string[];
};

// Map a Creative Commons URL to a short label + whether it clears free for
// commercial sync (attribution only). Anything with "nc" (non-commercial) is
// NOT free for a paid production — but it can still be one-stop licensed
// commercially through Jamendo, so we keep it and point at the pro license.
function classifyLicense(ccurl?: string): { label: string; commercialFree: boolean } {
  if (!ccurl) return { label: "License via Jamendo", commercialFree: false };
  const m = ccurl.match(/licenses\/([a-z-]+)\//i);
  const code = (m?.[1] ?? "").toLowerCase();
  const isNC = code.includes("nc");
  const label = `CC ${code.toUpperCase()}`;
  // Free-for-commercial only for by / by-sa (attribution, share-alike OK).
  const commercialFree = (code === "by" || code === "by-sa");
  return { label: isNC ? `${label} · license via Jamendo` : label, commercialFree };
}

router.get("/catalog/search", async (req: Request, res: Response) => {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    res.json({ tracks: [], source: "jamendo", configured: false });
    return;
  }

  const mood = typeof req.query.mood === "string" ? req.query.mood.slice(0, 40) : "";
  const limit = Math.min(12, Math.max(1, parseInt(String(req.query.limit ?? "6"), 10) || 6));

  try {
    const url = new URL("https://api.jamendo.com/v3.0/tracks/");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("include", "musicinfo licenses");
    url.searchParams.set("audioformat", "mp32");
    url.searchParams.set("order", "popularity_total");
    url.searchParams.set("audiodlformat", "mp32");
    if (mood) url.searchParams.set("fuzzytags", mood);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));

    if (!resp.ok) {
      res.json({ tracks: [], source: "jamendo", configured: true, error: `upstream ${resp.status}` });
      return;
    }

    const data = (await resp.json()) as { results?: JamendoTrack[] };
    const tracks: NormalizedTrack[] = (data.results ?? []).map((t) => {
      const { label, commercialFree } = classifyLicense(t.license_ccurl);
      const tags = [
        ...(t.musicinfo?.tags?.genres ?? []),
        ...(t.musicinfo?.tags?.vartags ?? []),
      ].slice(0, 5);
      return {
        id: `jam-${t.id}`,
        title: t.name,
        artist: t.artist_name,
        license: label,
        commercialFree,
        licenseUrl: t.prourl || t.shareurl || "https://licensing.jamendo.com/",
        audioUrl: t.audio ?? null,
        imageUrl: t.image ?? null,
        tags,
      };
    });

    res.json({ tracks, source: "jamendo", configured: true });
  } catch (err) {
    res.json({ tracks: [], source: "jamendo", configured: true, error: err instanceof Error ? err.message : "fetch failed" });
  }
});

export default router;
