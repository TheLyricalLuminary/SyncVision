/**
 * /api/share — decision-packet creation, retrieval, and audio proxy.
 *
 * POST /api/share            — create a packet (rate-limited, unauthenticated)
 * GET  /api/share/audio/:token — HMAC-verified audio proxy with range passthrough
 * GET  /api/share/:packetId  — fetch packet JSON (rate-limited, unauthenticated)
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { createAudioToken, verifyAudioToken } from '../lib/audioToken';
import { canonicalize, sha256Hex, fixedNum, type JsonValue } from '../lib/packetHash';
import { WEIGHTS, computeDataConfidence } from '../scoring/trackVector';
import { BRIEF_WEIGHTS } from '../scoring/briefWeights';

const router = Router();

// ── Scoring version — bump when algorithm changes ─────────────────────────────
const SCORING_VERSION = '2.1';

// ── Packet TTL ────────────────────────────────────────────────────────────────
const PACKET_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Audio storage ─────────────────────────────────────────────────────────────
const AUDIO_DIR = path.resolve(__dirname, '../../audio');

// ── Types ─────────────────────────────────────────────────────────────────────

type AgreementState = 'AGREE' | 'SINGLE_SOURCE' | 'CONFLICT' | 'MISSING';

interface SourcedValue {
  value:      string | number | boolean | null;
  source:     string;
  confidence: number; // 0–1, 4 decimals
}

type RightsFieldName =
  | 'writer' | 'split_pct' | 'publisher'
  | 'isrc'   | 'iswc'      | 'pro_affiliation' | 'ipi';

interface RightsFieldLedger {
  field:          RightsFieldName;
  entries:        SourcedValue[];
  agreementState: AgreementState;
}

interface PipelineStatus {
  stage:     string;
  completed: boolean;
}

export interface TrackSlot {
  trackId:      string;
  title:        string;
  artistName:   string | null;
  rank:         number;
  fitIndex:     number; // 0–100, 1 decimal
  vector:       { scene: number; lyrics: number; audioSignal: number; rightsClarity: number }; // 4 decimals each
  axisWeights:  { scene: number; lyrics: number; audioSignal: number; rightsClarity: number }; // static WEIGHTS
  clearanceScore: number;  // 0–100, displayed separately — NOT part of FitIndex
  dataConfidence:         number;  // 0–100, % of 8 rights fields verified
  dataConfidenceVerified: number;
  dataConfidenceTotal:    number;
  explanation:  string;
  tempo:        number | null;
  tonalCharacter:  string | null;
  energyCharacter: string | null;
  isrc:         string | null;
  rightsState:  string | null;
  rightsLedger: RightsFieldLedger[];
  rightsAggregate: {
    totalFields:     number;
    confirmedFields: number;
    conflicts:       number;
    missing:         number;
  };
  pipeline:     PipelineStatus[];
  inputHash:    string;
  // volatile — excluded from packetHash
  audioToken:      string | null;
  audioExpiresAt:  string | null;
}

export interface DecisionPacket {
  packetId:       string;
  packetVersion:  '1';
  scoringVersion: string;
  briefId:        string;
  briefText:      string;
  sceneParams:    { pacing: string | null; emotionalRegister: string | null; sceneLengthSec: number | null };
  briefWeightProfile: { sceneFit: number; rightsClarity: number; metadata: number } | null;
  createdAt:      string;
  expiresAt:      string;
  tracks:         TrackSlot[];
  totalConfirmed: number;
  totalConflicts: number;
  totalMissing:   number;
  packetHash:     string;
}

// ── In-memory rate limiter ────────────────────────────────────────────────────
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Map<string, Bucket>>();

function checkLimit(namespace: string, ip: string, max: number): boolean {
  if (!buckets.has(namespace)) buckets.set(namespace, new Map());
  const ns  = buckets.get(namespace)!;
  const now = Date.now();
  const b   = ns.get(ip);
  if (!b || now > b.resetAt) { ns.set(ip, { count: 1, resetAt: now + 3_600_000 }); return true; }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

function ip(req: Request): string {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';
}

// ── Rights ledger helpers ─────────────────────────────────────────────────────

function makeEntry(
  value: string | number | boolean | null,
  source: string,
): SourcedValue {
  return { value, source, confidence: fixedNum(1.0, 4) };
}

// Build a ledger field from the rightsFieldSources JSON (multi-source truth).
// Falls back to the single working value from RightsProfile when no sourced
// entries are stored (e.g. tracks enriched before rightsFieldSources was added).
function buildLedgerField(
  field: RightsFieldName,
  workingValue: string | number | boolean | null,
  workingSource: string | null,
  rfsEntries?: Array<{ value: string | number | null; source: string }>,
): RightsFieldLedger {
  // Prefer the full sourced ledger when available
  const entries = rfsEntries && rfsEntries.length > 0
    ? rfsEntries.map(e => makeEntry(e.value, e.source))
    : workingValue !== null && workingValue !== undefined && workingValue !== ''
      ? [makeEntry(workingValue, workingSource ?? 'manual')]
      : [];

  if (entries.length === 0) return { field, entries: [], agreementState: 'MISSING' };

  const uniqueValues = new Set(entries.map(e => String(e.value)));
  const agreementState: AgreementState =
    entries.length === 1 ? 'SINGLE_SOURCE' :
    uniqueValues.size === 1 ? 'AGREE' :
    'CONFLICT';

  return { field, entries, agreementState };
}

// Pipeline stages in canonical order
function buildPipeline(rp: Record<string, unknown> | null): PipelineStatus[] {
  const s = rp ?? {};
  const syncCleared  = s['syncLicenseStatus']  === 'CLEARED';
  const lyricCleared = s['lyricLicenseStatus'] === 'CLEARED';
  return [
    { stage: 'INGESTED',            completed: true },
    { stage: 'METADATA_EXTRACTED',  completed: Boolean(s['tempo'] || s['tonalCharacter']) },
    { stage: 'ISRC_RESOLVED',       completed: Boolean(s['isrc']) },
    { stage: 'MASTER_VERIFIED',     completed: Number(s['masterOwnershipPct']) === 100 },
    { stage: 'WRITER_IDENTIFIED',   completed: Boolean(s['writerName'] && s['writerIpi']) },
    { stage: 'PUBLISHER_CONFIRMED', completed: Boolean(s['publisherName'] && (s['ascapWorkId'] || s['bmiWorkId'])) },
    { stage: 'ONE_STOP_CONFIRMED',  completed: s['isOneStop'] === true },
    { stage: 'SYNC_LICENSED',       completed: syncCleared || lyricCleared },
  ];
}

// ── Packet construction ───────────────────────────────────────────────────────

function buildHashable(packet: DecisionPacket): Record<string, unknown> {
  return {
    packetVersion:      packet.packetVersion,
    scoringVersion:     packet.scoringVersion,
    briefId:            packet.briefId,
    briefText:          packet.briefText,
    sceneParams:        packet.sceneParams,
    briefWeightProfile: packet.briefWeightProfile,
    createdAt:          packet.createdAt,
    expiresAt:          packet.expiresAt,
    tracks: packet.tracks.map(t => ({
      trackId:         t.trackId,
      title:           t.title,
      artistName:      t.artistName,
      rank:            t.rank,
      fitIndex:        t.fitIndex,
      vector:          t.vector,
      axisWeights:     t.axisWeights,
      explanation:     t.explanation,
      tempo:           t.tempo,
      tonalCharacter:  t.tonalCharacter,
      energyCharacter: t.energyCharacter,
      isrc:            t.isrc,
      rightsState:     t.rightsState,
      rightsLedger:    t.rightsLedger,
      rightsAggregate: t.rightsAggregate,
      pipeline:        t.pipeline,
      inputHash:       t.inputHash,
      // audioToken and audioExpiresAt intentionally omitted
    })),
    totalConfirmed: packet.totalConfirmed,
    totalConflicts: packet.totalConflicts,
    totalMissing:   packet.totalMissing,
  };
}

// ── Zod schema for POST body ──────────────────────────────────────────────────

const VectorSchema = z.object({
  scene:         z.number(),
  lyrics:        z.number(),
  audioSignal:   z.number(),
  rightsClarity: z.number(),
  // legacy fields accepted for backwards-compat with in-flight payloads
  clearance:     z.number().optional(),
});

const TrackResultSchema = z.object({
  trackId:       z.string(),
  title:         z.string(),
  artistName:    z.string().nullable(),
  isrc:          z.string().nullable(),
  rank:          z.number().int(),
  tempo:         z.number().nullable(),
  tonalCharacter:  z.string().nullable(),
  energyCharacter: z.string().nullable(),
  hasAudio:      z.boolean(),
  confidenceScore: z.object({
    score:     z.number(),
    vector:    VectorSchema,
    inputHash: z.string(),
    explanation: z.string(),
    clearanceBreakdown:     z.number().optional(),
    dataConfidence:         z.number().optional(),
    dataConfidenceVerified: z.number().optional(),
    dataConfidenceTotal:    z.number().optional(),
  }),
  rightsProfile: z.object({
    isOneStop:       z.boolean().nullable(),
    proAffiliation:  z.string().nullable(),
    masterOwnedBy:   z.string().nullable(),
    publisherName:   z.string().nullable(),
    writerName:      z.string().nullable(),
    rightsState:     z.string().nullable(),
    enrichmentSources: z.array(z.string()).optional(),
    splitPct:        z.number().nullable().optional(),
  }).nullable(),
});

const CreatePacketSchema = z.object({
  briefText:      z.string().max(2000),
  briefId:        z.string(),
  sceneParams:    z.object({
    pacing:             z.string().nullable(),
    emotionalRegister:  z.string().nullable(),
    sceneLengthSec:     z.number().nullable(),
  }),
  results: z.array(TrackResultSchema).min(1).max(20),
});

// ── POST /api/share ───────────────────────────────────────────────────────────

router.post('/share', async (req: Request, res: Response) => {
  if (!checkLimit('create', ip(req), 10)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  const parsed = CreatePacketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', detail: parsed.error.issues });
    return;
  }
  const body = parsed.data;

  const storageDir = process.env.AUDIO_STORAGE_PATH ?? AUDIO_DIR;
  const now        = new Date();
  const packetExp  = new Date(now.getTime() + PACKET_TTL_MS);
  const audioExp   = packetExp; // audio TTL === packet TTL

  // Brief weight profile (server-authoritative)
  const briefWeightProfile = (BRIEF_WEIGHTS as Record<string, { sceneFit: number; rightsClarity: number; metadata: number } | undefined>)[body.briefId] ?? null;

  // Build track slots, augmenting with DB rights data where available
  const tracks: TrackSlot[] = [];

  for (const r of body.results) {
    // Try to fetch enriched rights from DB
    let dbRp: Record<string, unknown> | null = null;
    try {
      const dbTrack = await prisma.track.findUnique({
        where: { id: r.trackId },
        include: { rightsProfile: true },
      });
      if (dbTrack?.rightsProfile) {
        dbRp = dbTrack.rightsProfile as unknown as Record<string, unknown>;
      }
    } catch { /* synthetic / seed-engine track — not in DB */ }

    // Merge: DB wins over frontend for fields it has; frontend fills gaps
    const rp    = dbRp ?? (r.rightsProfile as Record<string, unknown> | null);
    const srcArr = (dbRp?.['enrichmentSources'] as string[] | undefined)
               ?? r.rightsProfile?.enrichmentSources
               ?? [];
    const src1 = (Array.isArray(srcArr) ? srcArr[0] : String(srcArr)) ?? 'manual';
    const isrc  = (dbRp?.['isrc'] as string | null) ?? r.isrc;

    // Multi-source conflict ledger. rightsFieldSources (written by fingerprint route)
    // stores every source's value independently. When present, we build multi-entry
    // ledger fields so CONFLICT is surfaced honestly. Falls back to working values
    // for tracks enriched before rightsFieldSources was introduced.
    const splitPct = dbRp?.['splitPct'] != null
      ? parseFloat(String(dbRp['splitPct']))
      : (r.rightsProfile?.splitPct ?? null);

    type RfsEntry = { value: string | number | null; source: string };
    const rfs = dbRp?.['rightsFieldSources'] as Record<string, RfsEntry[]> | null | undefined;

    const ledger: RightsFieldLedger[] = [
      buildLedgerField('writer',          rp?.['writerName']     as string | null, src1, rfs?.['writerName']),
      buildLedgerField('split_pct',       splitPct,                                src1),
      buildLedgerField('publisher',       rp?.['publisherName']  as string | null, src1, rfs?.['publisherName']),
      buildLedgerField('isrc',            isrc,                                    'registry'),
      buildLedgerField('iswc',            dbRp?.['iswc']         as string | null, src1, rfs?.['iswc']),
      buildLedgerField('pro_affiliation', rp?.['proAffiliation'] as string | null, src1, rfs?.['proAffiliation']),
      buildLedgerField('ipi',             dbRp?.['writerIpi']    as string | null, src1, rfs?.['writerIpi']),
    ];

    const confirmedFields = ledger.filter(f => f.agreementState === 'AGREE' || f.agreementState === 'SINGLE_SOURCE').length;
    const conflicts       = ledger.filter(f => f.agreementState === 'CONFLICT').length;
    const missing         = ledger.filter(f => f.agreementState === 'MISSING').length;

    // Pipeline — merge DB state with current ledger truth.
    // Staleness guard: when rightsFieldSources exists (enrichment has run), any
    // field with zero entries in rightsFieldSources was not found by the latest
    // enrichment run. Mask the stale DB value so the pipeline stage doesn't
    // falsely complete on data from a prior run.
    const pipelineInput: Record<string, unknown> = {
      ...(rp ?? {}),
      isrc,
      tempo:         r.tempo,
      tonalCharacter: r.tonalCharacter,
    };
    if (rfs) {
      // rfs present → at least one enrichment run has populated rightsFieldSources.
      // For each rights field, if rfs has no entries the latest run found nothing —
      // override the DB value to null so the downstream pipeline stage can't pass.
      if (!rfs['publisherName']?.length) {
        pipelineInput['publisherName'] = null;
        pipelineInput['ascapWorkId']   = null;
        pipelineInput['bmiWorkId']     = null;
      }
      if (!rfs['writerName']?.length && !rfs['writerIpi']?.length) {
        pipelineInput['writerName'] = null;
        pipelineInput['writerIpi'] = null;
      }
    }
    const pipeline = buildPipeline(pipelineInput);

    // Audio token — only if the track has a real audio file on disk
    let audioToken: string | null = null;
    let audioExpiresAt: string | null = null;
    if (r.hasAudio) {
      // Double-check file exists before issuing token
      try {
        const dbTrackForAudio = await prisma.track.findUnique({ where: { id: r.trackId }, select: { audioFilePath: true } });
        if (dbTrackForAudio?.audioFilePath) {
          const filename = path.basename(dbTrackForAudio.audioFilePath);
          const filePath = path.join(storageDir, filename);
          if (fs.existsSync(filePath)) {
            audioToken     = createAudioToken(/* filled after packetId known */ '_placeholder_', r.trackId, audioExp);
            audioExpiresAt = audioExp.toISOString();
          }
        }
      } catch { /* skip audio for this track */ }
    }

    // Data confidence — computed server-side from DB record (authoritative)
    const dcInputs = {
      isrc:               isrc,
      ascapWorkId:        (dbRp?.['ascapWorkId'] as string | null) ?? null,
      masterOwnershipPct: dbRp?.['masterOwnershipPct'] != null ? parseFloat(String(dbRp['masterOwnershipPct'])) : null,
      isOneStop:          (dbRp?.['isOneStop'] as boolean | null) ?? (r.rightsProfile?.isOneStop ?? null),
      writerName:         (rp?.['writerName'] as string | null) ?? null,
      writerIpi:          (dbRp?.['writerIpi'] as string | null) ?? null,
      publisherName:      (rp?.['publisherName'] as string | null) ?? null,
      proAffiliation:     (rp?.['proAffiliation'] as string | null) ?? null,
    };
    const dc = computeDataConfidence(dcInputs);

    // Pre-format numbers for deterministic hashing
    const slot: TrackSlot = {
      trackId:         r.trackId,
      title:           r.title,
      artistName:      r.artistName,
      rank:            r.rank,
      fitIndex:        fixedNum(r.confidenceScore.score, 1),
      vector: {
        scene:         fixedNum(r.confidenceScore.vector.scene,         4),
        lyrics:        fixedNum(r.confidenceScore.vector.lyrics,        4),
        audioSignal:   fixedNum(r.confidenceScore.vector.audioSignal,   4),
        rightsClarity: fixedNum(r.confidenceScore.vector.rightsClarity, 4),
      },
      axisWeights: {
        scene:         fixedNum(WEIGHTS.scene,         4),
        lyrics:        fixedNum(WEIGHTS.lyrics,        4),
        audioSignal:   fixedNum(WEIGHTS.audioSignal,   4),
        rightsClarity: fixedNum(WEIGHTS.rightsClarity, 4),
      },
      clearanceScore: r.confidenceScore.clearanceBreakdown ?? 0,
      explanation:     r.confidenceScore.explanation,
      tempo:           r.tempo,
      tonalCharacter:  r.tonalCharacter,
      energyCharacter: r.energyCharacter,
      isrc,
      rightsState:     (rp?.['rightsState'] as string | null) ?? r.rightsProfile?.rightsState ?? null,
      rightsLedger:    ledger,
      rightsAggregate: { totalFields: 7, confirmedFields, conflicts, missing },
      pipeline,
      inputHash:       r.confidenceScore.inputHash,
      dataConfidence:          dc.score,
      dataConfidenceVerified:  dc.verifiedCount,
      dataConfidenceTotal:     dc.totalFields,
      audioToken,      // placeholder — re-signed after packetId is known
      audioExpiresAt,
    };
    tracks.push(slot);
  }

  const totalConfirmed = tracks.reduce((s, t) => s + t.rightsAggregate.confirmedFields, 0);
  const totalConflicts = tracks.reduce((s, t) => s + t.rightsAggregate.conflicts, 0);
  const totalMissing   = tracks.reduce((s, t) => s + t.rightsAggregate.missing, 0);

  // Build preliminary packet to get packetId (cuid assigned by Prisma on create)
  const prelimPacket: Omit<DecisionPacket, 'packetId' | 'packetHash'> = {
    packetVersion:      '1',
    scoringVersion:     SCORING_VERSION,
    briefId:            body.briefId,
    briefText:          body.briefText,
    sceneParams:        body.sceneParams,
    briefWeightProfile: briefWeightProfile
      ? { sceneFit: fixedNum(briefWeightProfile.sceneFit, 4), rightsClarity: fixedNum(briefWeightProfile.rightsClarity, 4), metadata: fixedNum(briefWeightProfile.metadata, 4) }
      : null,
    createdAt:   now.toISOString(),
    expiresAt:   packetExp.toISOString(),
    tracks,
    totalConfirmed,
    totalConflicts,
    totalMissing,
  };

  // Persist to DB — packetId is the Prisma-generated cuid
  const row = await prisma.decisionPacket.create({
    data: {
      packetVersion:  '1',
      scoringVersion: SCORING_VERSION,
      briefId:        body.briefId,
      briefText:      body.briefText,
      sceneParams:    body.sceneParams as object,
      tracks:         tracks as unknown as object,  // stored as JSON; packetHash added below
      packetHash:     '',  // filled in after packetId known
      expiresAt:      packetExp,
    },
  });

  const packetId = row.id;

  // Re-sign audio tokens now that we have the packetId
  const tracksWithTokens = tracks.map(t => {
    if (t.audioToken === null) return t;
    return {
      ...t,
      audioToken: createAudioToken(packetId, t.trackId, audioExp),
    };
  });

  // Build final packet and compute hash
  const packet: DecisionPacket = {
    packetId,
    ...prelimPacket,
    tracks: tracksWithTokens,
    packetHash: '', // computed next
  };
  packet.packetHash = sha256Hex(canonicalize(buildHashable(packet) as JsonValue));

  // Update DB row with final tokens + hash
  await prisma.decisionPacket.update({
    where: { id: packetId },
    data:  {
      tracks:     tracksWithTokens as unknown as object,
      packetHash: packet.packetHash,
    },
  });

  res.status(201).json({
    packetId,
    expiresAt: packetExp.toISOString(),
    packetHash: packet.packetHash,
  });
});

// ── GET /api/share/audio/:token — MUST be registered before /:packetId ────────

router.get('/share/audio/:token', async (req: Request, res: Response) => {
  const token   = req.params.token as string;
  const payload = verifyAudioToken(token);
  if (!payload) {
    res.status(401).json({ error: 'invalid_or_expired_token' });
    return;
  }

  // Verify the packet still exists and has not expired
  try {
    const row = await prisma.decisionPacket.findUnique({ where: { id: payload.packetId } });
    if (!row) { res.status(404).json({ error: 'packet_not_found' }); return; }
    if (new Date(row.expiresAt) < new Date()) { res.status(410).json({ error: 'packet_expired' }); return; }

    // Verify this trackId is actually in the packet
    const tracks = row.tracks as { trackId: string }[];
    if (!tracks.some(t => t.trackId === payload.trackId)) {
      res.status(403).json({ error: 'track_not_in_packet' });
      return;
    }
  } catch (err) {
    console.error('share audio DB check:', err);
    res.status(500).json({ error: 'server_error' });
    return;
  }

  // Resolve file from DB
  try {
    const track = await prisma.track.findUnique({ where: { id: payload.trackId } });
    if (!track?.audioFilePath) { res.status(404).json({ error: 'audio_not_found' }); return; }

    const storageDir = process.env.AUDIO_STORAGE_PATH ?? AUDIO_DIR;
    const filename   = path.basename(track.audioFilePath);
    const filePath   = path.join(storageDir, filename);

    if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'file_not_found' }); return; }

    const CONTENT_TYPES: Record<string, string> = {
      '.wav':  'audio/wav',
      '.mp3':  'audio/mpeg',
      '.flac': 'audio/flac',
    };
    const ext         = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const fileSize    = fs.statSync(filePath).size;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    // Allow share-view cross-origin playback
    res.setHeader('Access-Control-Allow-Origin', '*');

    const rangeHeader = req.headers.range as string | undefined;
    if (!rangeHeader) {
      res.setHeader('Content-Length', fileSize);
      res.status(200);
      fs.createReadStream(filePath).pipe(res as NodeJS.WritableStream);
      return;
    }

    const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!m) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    const rawStart = m[1], rawEnd = m[2];
    let start = rawStart === '' ? Math.max(0, fileSize - parseInt(rawEnd, 10)) : parseInt(rawStart, 10);
    let end   = rawEnd   !== '' ? Math.min(parseInt(rawEnd, 10), fileSize - 1) : fileSize - 1;

    if (start < 0 || start > end || start >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range',  `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res as NodeJS.WritableStream);
  } catch (err) {
    console.error('share audio stream:', err);
    res.status(500).json({ error: 'stream_error' });
  }
});

// ── PATCH /api/share/:packetId/decisions ─────────────────────────────────────
// Body: { decisions: Record<trackId, 'approved'|'passed'|'leader'>, notes: Record<trackId, string> }

router.patch('/share/:packetId/decisions', async (req: Request, res: Response) => {
  if (!checkLimit('decisions', ip(req), 30)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  const packetId = req.params.packetId as string;
  const { decisions, notes } = req.body as {
    decisions: Record<string, string>;
    notes: Record<string, string>;
  };

  if (!decisions || typeof decisions !== 'object') {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  try {
    const row = await prisma.decisionPacket.findUnique({ where: { id: packetId } });
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    if (new Date(row.expiresAt) < new Date()) {
      res.status(410).json({ error: 'expired' });
      return;
    }

    await prisma.decisionPacket.update({
      where: { id: packetId },
      data: { directorDecisions: { decisions, notes: notes ?? {}, submittedAt: new Date().toISOString() } },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('share decisions:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── GET /api/share/:packetId ──────────────────────────────────────────────────

router.get('/share/:packetId', async (req: Request, res: Response) => {
  if (!checkLimit('fetch', ip(req), 120)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  const packetId = req.params.packetId as string;
  try {
    const row = await prisma.decisionPacket.findUnique({ where: { id: packetId } });
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }

    if (new Date(row.expiresAt) < new Date()) {
      res.status(410).json({ error: 'expired', expiredAt: row.expiresAt.toISOString() });
      return;
    }

    const packet: DecisionPacket = {
      packetId:           row.id,
      packetVersion:      row.packetVersion as '1',
      scoringVersion:     row.scoringVersion,
      briefId:            row.briefId,
      briefText:          row.briefText,
      sceneParams:        row.sceneParams as DecisionPacket['sceneParams'],
      briefWeightProfile: null, // re-derive so it's always server-authoritative
      createdAt:          row.createdAt.toISOString(),
      expiresAt:          row.expiresAt.toISOString(),
      tracks:             row.tracks as unknown as TrackSlot[],
      totalConfirmed:     0,
      totalConflicts:     0,
      totalMissing:       0,
      packetHash:         row.packetHash,
    };

    // Re-attach brief weight profile
    const bwp = (BRIEF_WEIGHTS as Record<string, { sceneFit: number; rightsClarity: number; metadata: number } | undefined>)[row.briefId];
    if (bwp) {
      packet.briefWeightProfile = {
        sceneFit:      fixedNum(bwp.sceneFit,      4),
        rightsClarity: fixedNum(bwp.rightsClarity, 4),
        metadata:      fixedNum(bwp.metadata,      4),
      };
    }

    // Re-derive aggregates from stored tracks
    const tracks = packet.tracks;
    packet.totalConfirmed = tracks.reduce((s, t) => s + t.rightsAggregate.confirmedFields, 0);
    packet.totalConflicts = tracks.reduce((s, t) => s + t.rightsAggregate.conflicts, 0);
    packet.totalMissing   = tracks.reduce((s, t) => s + t.rightsAggregate.missing, 0);

    // Cache for 5 min (browser/CDN) — packet content is immutable
    res.setHeader('Cache-Control', 'public, max-age=300, immutable');
    res.json(packet);
  } catch (err) {
    console.error('share fetch:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
