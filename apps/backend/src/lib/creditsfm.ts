// Credits.fm ISRC lookup — resolves ISRC → writer IPI, publisher, PRO affiliation.
// API key set via CREDITS_FM_API_KEY env var. Gracefully skips if absent.
// Docs: https://credits.fm/api

const CREDITS_FM_BASE = 'https://api.credits.fm/v1';
const API_KEY = process.env.CREDITS_FM_API_KEY ?? '';

export interface CreditsFmEnrichment {
  writerName: string | null;
  writerIpi: string | null;
  publisherName: string | null;
  proAffiliation: string | null; // Credits.fm doesn't supply this; always null — populated by ASCAP/BMI/SESAC
  iswc: string | null;
  mlcSongCode: string | null;
}

export async function enrichFromCreditsFm(
  isrc: string,
): Promise<CreditsFmEnrichment | null> {
  if (!API_KEY) return null;

  try {
    const res = await fetch(`${CREDITS_FM_BASE}/isrc/${isrc}`, {
      headers: {
        'x-api-key': API_KEY,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;

    // Credits.fm v1 response shape — verified against live API 2026-06-01
    const body = await res.json() as {
      songwriters?: Array<{
        name?: string;
        ipi?: string;
      }>;
      publishers?: Array<{ name?: string }>;
      iswc?: string;
      mlc_song_code?: string;
    };

    const writer    = body.songwriters?.[0] ?? null;
    const publisher = body.publishers?.[0] ?? null;

    return {
      writerName:     writer?.name    ?? null,
      writerIpi:      writer?.ipi     ?? null,
      proAffiliation: null,
      publisherName:  publisher?.name ?? null,
      iswc:           body.iswc          ?? null,
      mlcSongCode:    body.mlc_song_code ?? null,
    };
  } catch {
    return null;
  }
}
