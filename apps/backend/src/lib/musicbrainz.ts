// MusicBrainz metadata enrichment.
// Given a MusicBrainz recording MBID (from AcoustID), fetches:
//   - ISRCs on the recording
//   - Work relationships (ISWC, composer IPI, publisher name)
// Rate limit: 1 req/sec per MB guidelines. We add a 1.1s delay between calls.

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'SyncVision/1.0 (amigonimark@gmail.com)';

function mbFetch(path: string): Promise<Response> {
  return fetch(`${MB_BASE}${path}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface MBRelation {
  type: string;
  artist?: { name: string; 'ipi-list'?: string[] };
  work?: { id: string; title: string; iswcs?: string[]; relations?: MBRelation[] };
}

interface MBRecording {
  id: string;
  title: string;
  isrcs?: string[];
  'artist-credit'?: Array<{ artist: { name: string } }>;
  relations?: MBRelation[];
}

interface MBWork {
  id: string;
  title: string;
  iswcs?: string[];
  relations?: MBRelation[];
}

export interface MusicBrainzEnrichment {
  mbRecordingId: string;
  isrc: string | null;
  iswc: string | null;
  writerName: string | null;
  writerIpi: string | null;
  publisherName: string | null;
  workMbid: string | null;
}

export async function enrichFromMusicBrainz(
  mbRecordingId: string,
): Promise<MusicBrainzEnrichment> {
  const base: MusicBrainzEnrichment = {
    mbRecordingId,
    isrc: null,
    iswc: null,
    writerName: null,
    writerIpi: null,
    publisherName: null,
    workMbid: null,
  };

  // ── Step 1: recording lookup ─────────────────────────────────
  const recRes = await mbFetch(
    `/recording/${mbRecordingId}?inc=isrcs+work-rels&fmt=json`,
  );
  if (!recRes.ok) return base;
  const rec = (await recRes.json()) as MBRecording;

  base.isrc = rec.isrcs?.[0] ?? null;

  // Find the performance→work relationship
  const workRel = rec.relations?.find(r => r.type === 'performance' && r.work);
  const workStub = workRel?.work;
  if (!workStub) return base;

  base.workMbid = workStub.id;
  base.iswc = workStub.iswcs?.[0] ?? null;

  // ── Step 2: work lookup for composer + publisher ─────────────
  await delay(1100); // MB rate limit
  const workRes = await mbFetch(
    `/work/${workStub.id}?inc=aliases+artist-rels+label-rels&fmt=json`,
  );
  if (!workRes.ok) return base;
  const work = (await workRes.json()) as MBWork;

  base.iswc = work.iswcs?.[0] ?? base.iswc;

  const composerRel = work.relations?.find(
    r => r.type === 'composer' || r.type === 'lyricist' || r.type === 'writer',
  );
  if (composerRel?.artist) {
    base.writerName = composerRel.artist.name;
    base.writerIpi  = composerRel.artist['ipi-list']?.[0] ?? null;
  }

  const publisherRel = work.relations?.find(r => r.type === 'publisher');
  if (publisherRel?.artist) {
    base.publisherName = publisherRel.artist.name;
  }

  return base;
}
