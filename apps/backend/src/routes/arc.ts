/**
 * arc.ts — Scene Arc Generator endpoint.
 *
 * POST /api/arc/extract  { sceneText, sceneParams? }
 *   → deterministic four-phase emotional arc + valence + provenance.
 *
 * Pure and stateless (no DB, no auth gate — preview-grade). The whole point is
 * that the same scene text always returns the same arc, so this can be called
 * live as the supervisor types.
 */

import { Router, Request, Response } from "express";
import { extractSceneArc } from "../scoring/arcExtraction";
import type { SceneParamsInput } from "../scoring/arcExtraction";

const router = Router();

const MAX_SCENE_CHARS = 20_000;

router.post("/arc/extract", (req: Request, res: Response) => {
  const body = req.body as { sceneText?: unknown; sceneParams?: unknown };

  if (typeof body.sceneText !== "string") {
    res.status(400).json({ error: "invalid_body", message: "sceneText (string) is required" });
    return;
  }
  if (body.sceneText.length > MAX_SCENE_CHARS) {
    res.status(413).json({ error: "scene_too_long", message: `sceneText exceeds ${MAX_SCENE_CHARS} characters` });
    return;
  }

  // sceneParams is optional and only a few fields are read; pass through safely.
  let sceneParams: SceneParamsInput | undefined;
  if (body.sceneParams && typeof body.sceneParams === "object") {
    const sp = body.sceneParams as Record<string, unknown>;
    sceneParams = {
      pacing: sp.pacing === "slow" || sp.pacing === "mid" || sp.pacing === "driving" ? sp.pacing : null,
      emotionalRegister: typeof sp.emotionalRegister === "string" ? sp.emotionalRegister : null,
      sceneLengthSec: typeof sp.sceneLengthSec === "number" ? sp.sceneLengthSec : null,
    };
  }

  try {
    const arc = extractSceneArc(body.sceneText, sceneParams);
    res.json(arc);
  } catch (err) {
    console.error("[arc/extract] error:", err);
    res.status(500).json({
      error: "internal_error",
      message: err instanceof Error ? err.message : "Unexpected error",
    });
  }
});

export default router;
