// Server-authoritative trial enforcement.
//
// The frontend stores only an opaque trialToken in localStorage.
// All limits (3 tracks, 5 scenes, 48 h) are enforced here, not in the client.
//
// POST /api/trial/start           — create trial, returns { trialToken, expiresAt }
// GET  /api/trial/status          — returns current state for a token
// POST /api/trial/increment/track — atomically increment tracksUsed
// POST /api/trial/increment/scene — atomically increment scenesUsed

import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";

const router = Router();

const TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;
const MAX_TRACKS        = 3;
const MAX_SCENES        = 5;

function trialToken(req: Request): string | null {
  return (req.headers["x-trial-token"] as string) ?? null;
}

function isExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

// ── POST /api/trial/start ─────────────────────────────────────────────────────

router.post("/trial/start", async (_req: Request, res: Response) => {
  const expiresAt = new Date(Date.now() + TRIAL_DURATION_MS);

  const trial = await prisma.userTrial.create({
    data: { expiresAt },
  });

  res.status(201).json({
    trialToken:  trial.trialToken,
    expiresAt:   trial.expiresAt.toISOString(),
    tracksUsed:  trial.tracksUsed,
    scenesUsed:  trial.scenesUsed,
    maxTracks:   MAX_TRACKS,
    maxScenes:   MAX_SCENES,
  });
});

// ── GET /api/trial/status ─────────────────────────────────────────────────────

router.get("/trial/status", async (req: Request, res: Response) => {
  const token = trialToken(req);
  if (!token) {
    res.status(400).json({ error: "x-trial-token header required" });
    return;
  }

  const trial = await prisma.userTrial.findUnique({ where: { trialToken: token } });
  if (!trial) {
    res.status(404).json({ error: "Trial not found" });
    return;
  }

  const expired   = isExpired(trial.expiresAt);
  const active    = !expired && trial.tracksUsed < MAX_TRACKS && trial.scenesUsed < MAX_SCENES;

  res.json({
    active,
    expired,
    tracksUsed:     trial.tracksUsed,
    scenesUsed:     trial.scenesUsed,
    tracksRemaining: Math.max(0, MAX_TRACKS - trial.tracksUsed),
    scenesRemaining: Math.max(0, MAX_SCENES - trial.scenesUsed),
    expiresAt:      trial.expiresAt.toISOString(),
    maxTracks:      MAX_TRACKS,
    maxScenes:      MAX_SCENES,
  });
});

// ── POST /api/trial/increment/track ──────────────────────────────────────────

router.post("/trial/increment/track", async (req: Request, res: Response) => {
  const token = trialToken(req);
  if (!token) {
    res.status(400).json({ error: "x-trial-token header required" });
    return;
  }

  const trial = await prisma.userTrial.findUnique({ where: { trialToken: token } });
  if (!trial) {
    res.status(404).json({ error: "Trial not found" });
    return;
  }
  if (isExpired(trial.expiresAt)) {
    res.status(403).json({ error: "Trial expired" });
    return;
  }
  if (trial.tracksUsed >= MAX_TRACKS) {
    res.status(403).json({ error: "Track limit reached", limit: MAX_TRACKS });
    return;
  }

  const updated = await prisma.userTrial.update({
    where: { trialToken: token },
    data:  { tracksUsed: { increment: 1 } },
  });

  res.json({ tracksUsed: updated.tracksUsed, tracksRemaining: Math.max(0, MAX_TRACKS - updated.tracksUsed) });
});

// ── POST /api/trial/increment/scene ──────────────────────────────────────────

router.post("/trial/increment/scene", async (req: Request, res: Response) => {
  const token = trialToken(req);
  if (!token) {
    res.status(400).json({ error: "x-trial-token header required" });
    return;
  }

  const trial = await prisma.userTrial.findUnique({ where: { trialToken: token } });
  if (!trial) {
    res.status(404).json({ error: "Trial not found" });
    return;
  }
  if (isExpired(trial.expiresAt)) {
    res.status(403).json({ error: "Trial expired" });
    return;
  }
  if (trial.scenesUsed >= MAX_SCENES) {
    res.status(403).json({ error: "Scene view limit reached", limit: MAX_SCENES });
    return;
  }

  const updated = await prisma.userTrial.update({
    where: { trialToken: token },
    data:  { scenesUsed: { increment: 1 } },
  });

  res.json({ scenesUsed: updated.scenesUsed, scenesRemaining: Math.max(0, MAX_SCENES - updated.scenesUsed) });
});

export default router;
