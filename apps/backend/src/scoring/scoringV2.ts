/**
 * SyncVision Score v2 — explicit weighted dot product + hashVersion 2.
 *
 * Score formula (verifiable by hand):
 *   syncvisionScore = sceneFit * w.sceneFit
 *                   + rightsClarity * w.rightsClarity
 *                   + metadata * w.metadata
 *
 * All three component scores are in [0, 100]. Weights sum to 1.0 per brief.
 * Final score is in [0, 100], rounded to one decimal place.
 *
 * hashVersion 2 covers:
 *   { featureVector, rightsState, briefWeights, modelVersion, computedAt }
 *
 * Existing hashVersion 1 rows (confidence score contract) are untouched.
 */

import { createHash } from "crypto";
import type { RightsState } from "./rightsStateMachine";
import type { BriefWeightProfile } from "./briefWeights";

export interface FeatureVector {
  /** PAD-based scene fit, 0–100 */
  sceneFit: number;
  /** Clearance confidence, 0–100 */
  rightsClarity: number;
  /** Cataloguing completeness, 0–100 */
  metadata: number;
}

export interface SyncVisionScoreV2 {
  /** Weighted dot product, 0–100, one decimal place */
  matchScore: number;
  featureVector: FeatureVector;
  briefId: string;
  briefWeights: BriefWeightProfile;
  rightsState: RightsState;
  modelVersion: string | null;
  /** ISO timestamp of computation */
  computedAt: string;
  /** SHA-256 hex of the canonical input blob */
  inputHash: string;
  hashVersion: 2;
}

function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

export function computeSyncVisionScoreV2(
  briefId: string,
  fv: FeatureVector,
  weights: BriefWeightProfile,
  rightsState: RightsState,
  modelVersion: string | null,
): SyncVisionScoreV2 {
  const matchScore = parseFloat(
    (fv.sceneFit * weights.sceneFit
      + fv.rightsClarity * weights.rightsClarity
      + fv.metadata * weights.metadata
    ).toFixed(1)
  );

  const computedAt = new Date().toISOString();

  const hashBlob = {
    featureVector: fv,
    rightsState,
    briefId,
    briefWeights: weights,
    modelVersion: modelVersion ?? null,
    computedAt,
  };

  const inputHash = createHash("sha256")
    .update(sortedJson(hashBlob))
    .digest("hex");

  return {
    matchScore,
    featureVector: fv,
    briefId,
    briefWeights: weights,
    rightsState,
    modelVersion: modelVersion ?? null,
    computedAt,
    inputHash,
    hashVersion: 2,
  };
}
