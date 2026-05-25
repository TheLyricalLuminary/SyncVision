// Credits.fm ISRC lookup — resolves ISRC → writer IPI, publisher, PRO affiliation.
// API key set via CREDITS_FM_API_KEY env var. Gracefully skips if absent.
// Docs: https://credits.fm/api

const CREDITS_FM_BASE = 'https://api.credits.fm/v1';
const API_KEY = process.env.CREDITS_FM_API_KEY ?? '';

export interface CreditsFmEnrichment {
  writerName: string | null;
  writerIpi: string | null;
  publisherName: string | null;
  proAffiliation: string | null;
  iswc: string | null;
}

export async function enrichFromCreditsFm(
  isrc: string,
): Promise<CreditsFmEnrichment | null> {
  if (!API_KEY) return null;

  try {
    const res = await fetch(`${CREDITS_FM_BASE}/isrc/${isrc}`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;

    // Credits.fm response shape (CC BY dataset model)
    const body = await res.json() as {
      writers?: Array<{
        name?: string;
        ipi?: string;
        pro?: string;
      }>;
      publishers?: Array<{ name?: string }>;
      iswc?: string;
    };

    const writer    = body.writers?.[0] ?? null;
    const publisher = body.publishers?.[0] ?? null;

    return {
      writerName:    writer?.name    ?? null,
      writerIpi:     writer?.ipi     ?? null,
      proAffiliation: writer?.pro    ?? null,
      publisherName: publisher?.name ?? null,
      iswc:          body.iswc       ?? null,
    };
  } catch {
    return null;
  }
}
