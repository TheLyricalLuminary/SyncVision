// MLC (Mechanical Licensing Collective) Public Search — Layer 6 of the
// identity-resolution chain.
//
// The MLC beta API accepts ISRC or ISWC and returns mechanical rights status,
// publisher name, writer IPI, claimed/unclaimed status, and split percentages.
//
// Endpoint: https://api.themlc.com  (no auth required for public search)
// Returns sourced data only — callers must treat results as SOURCED, not
// authoritative. Conflicts with other sources must be preserved in the ledger.

const MLC_BASE = 'https://api.themlc.com';
const USER_AGENT = 'SyncVision/1.0 (amigonimark@gmail.com)';

interface MlcWork {
  title?: string;
  iswc?: string;
  isrc?: string;
  claimStatus?: string;      // e.g. "CLAIMED" | "UNCLAIMED"
  writers?: Array<{
    name?: string;
    ipi?: string;
    splitPct?: number;
  }>;
  publishers?: Array<{
    name?: string;
    ipi?: string;
    splitPct?: number;
  }>;
  mechanicalStatus?: string; // e.g. "LICENSED" | "UNLICENSED"
}

export interface MlcEnrichment {
  iswc: string | null;
  writerName: string | null;
  writerIpi: string | null;
  publisherName: string | null;
  mechanicalStatus: string | null;
  claimStatus: string | null;
  splitPct: number | null;
  source: 'MLC';
}

async function mlcFetch(path: string): Promise<Response> {
  return fetch(`${MLC_BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
}

function parseWork(work: MlcWork): MlcEnrichment {
  const writer    = work.writers?.[0]    ?? null;
  const publisher = work.publishers?.[0] ?? null;
  return {
    iswc:             work.iswc             ?? null,
    writerName:       writer?.name          ?? null,
    writerIpi:        writer?.ipi           ?? null,
    publisherName:    publisher?.name       ?? null,
    mechanicalStatus: work.mechanicalStatus ?? null,
    claimStatus:      work.claimStatus      ?? null,
    splitPct:         writer?.splitPct      ?? null,
    source:           'MLC',
  };
}

export async function enrichFromMlc(
  isrc: string | null,
  iswc: string | null,
): Promise<MlcEnrichment | null> {
  // Try ISWC first (more precise work-level lookup), fall back to ISRC
  const paths: string[] = [];
  if (iswc) paths.push(`/v1/works?iswc=${encodeURIComponent(iswc)}`);
  if (isrc) paths.push(`/v1/works?isrc=${encodeURIComponent(isrc)}`);
  if (paths.length === 0) return null;

  for (const path of paths) {
    try {
      const res = await mlcFetch(path);
      if (!res.ok) continue;

      const body = await res.json() as {
        works?: MlcWork[];
        work?: MlcWork;
        data?: MlcWork[];
      };

      // MLC beta may return { works: [...] } or { data: [...] } or { work: {...} }
      const work =
        body.work ??
        body.works?.[0] ??
        body.data?.[0] ??
        null;

      if (work) return parseWork(work);
    } catch { /* non-fatal — try next path */ }
  }

  return null;
}
