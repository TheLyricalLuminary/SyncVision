import {
  evaluateRightsState,
  evaluateTrack,
  computeRightsState,
  type TrackEvalInput,
  type RightsProfileForState,
} from "./rightsStateMachine";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pass(label: string): void {
  console.log(`  PASS [${label}]`);
}

function fail(label: string, msg: string): never {
  throw new Error(`FAIL [${label}]: ${msg}`);
}

function assertEqual<T>(a: T, b: T, label: string): void {
  const aStr = JSON.stringify(a);
  const bStr = JSON.stringify(b);
  if (aStr !== bStr) fail(label, `expected ${bStr}, got ${aStr}`);
  pass(label);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const BASE_METADATA = {
  isrc: "USRC10000001",
  title: "Test Track",
  artistName: "Test Artist",
};

const CLEAR_OWNERSHIP = {
  masterOwnershipPct: 100,
  masterOwnedBy: "Label Corp",
  masterOwnershipType: "FULL",
  masterVerificationSource: "manual",
};

const CLEAR_PUBLISHING = {
  ascapWorkId: "123456789",
  bmiWorkId: null,
  writerName: "Jane Doe",
  writerIpi: "00000000250",
  publisherName: "Horizon Music Publishing",
  proAffiliation: "ASCAP",
};

const CLEAR_USAGE: TrackEvalInput["usage_rights"] = {
  isOneStop: true,
  masterOwnershipSplits: null,
};

const NULL_OWNERSHIP: TrackEvalInput["ownership"] = {
  masterOwnershipPct: null,
  masterOwnedBy: null,
  masterOwnershipType: null,
  masterVerificationSource: null,
};

const NULL_PUBLISHING: TrackEvalInput["publishing"] = {
  ascapWorkId: null,
  bmiWorkId: null,
  writerName: null,
  writerIpi: null,
  publisherName: null,
  proAffiliation: null,
};

const NULL_USAGE: TrackEvalInput["usage_rights"] = {
  isOneStop: null,
  masterOwnershipSplits: null,
};

function makeInput(overrides: Partial<TrackEvalInput> = {}): TrackEvalInput {
  return {
    audio_id: "test-track-id",
    ingestion_source: "test",
    metadata: BASE_METADATA,
    ownership: NULL_OWNERSHIP,
    publishing: NULL_PUBLISHING,
    usage_rights: NULL_USAGE,
    ...overrides,
  };
}

// ── evaluateRightsState tests ─────────────────────────────────────────────────

function testEvaluateRightsState(): void {
  console.log("\n=== evaluateRightsState ===\n");

  // Rule 1: no rights profile fields → INGESTED
  {
    const { state } = evaluateRightsState(makeInput());
    assertEqual(state, "INGESTED", "all-null → INGESTED");
  }

  // Rule 1: isOneStop is the only non-string field in hasRightsProfile;
  // a profile with only masterOwnedBy (not in hasPartialData) → UNVERIFIED
  {
    const { state } = evaluateRightsState(
      makeInput({ ownership: { ...NULL_OWNERSHIP, masterOwnedBy: "Label" } })
    );
    assertEqual(state, "UNVERIFIED", "only masterOwnedBy → UNVERIFIED (not INGESTED)");
  }

  // Rule 2: masterOwnershipPct ≤ 0 with a named owner → BLOCKED (conflict)
  {
    const { state } = evaluateRightsState(
      makeInput({
        ownership: { ...NULL_OWNERSHIP, masterOwnershipPct: 0, masterOwnedBy: "Label A" },
      })
    );
    assertEqual(state, "BLOCKED", "pct=0 + owner → BLOCKED (master conflict)");
  }

  {
    const { state } = evaluateRightsState(
      makeInput({
        ownership: { ...NULL_OWNERSHIP, masterOwnershipPct: -5, masterOwnedBy: "Label A" },
      })
    );
    assertEqual(state, "BLOCKED", "pct<0 + owner → BLOCKED (master conflict)");
  }

  // pct=0 but no owner → NOT a conflict (no named disputant)
  {
    const { state } = evaluateRightsState(
      makeInput({ ownership: { ...NULL_OWNERSHIP, masterOwnershipPct: 0 } })
    );
    // hasRightsProfile? masterOwnershipPct=0 is toNum=0, NOT in hasRightsProfile (which checks masterOwnedBy/masterOwnershipType etc.)
    // Actually pct=0 is toNum=0, and hasPartialData includes toNum!==null. But hasRightsProfile does NOT include pct.
    // So: hasRightsProfile = false (no present string fields, isOneStop=null) → INGESTED
    assertEqual(state, "INGESTED", "pct=0 + no owner → INGESTED (no rights profile)");
  }

  // Rule 3: partial data but publisher + PRO IDs all absent → BLOCKED
  {
    const { state } = evaluateRightsState(
      makeInput({
        ownership: { ...NULL_OWNERSHIP, masterOwnershipPct: 75 },
        publishing: { ...NULL_PUBLISHING, writerName: "Writer X" },
      })
    );
    assertEqual(state, "BLOCKED", "pct=75 + writerName only (no publisher/PRO) → BLOCKED");
  }

  {
    const { state } = evaluateRightsState(
      makeInput({
        usage_rights: { isOneStop: true, masterOwnershipSplits: null },
      })
    );
    // hasRightsProfile: isOneStop !== null → true
    // hasMasterConflict: pct=null → false
    // rule3: !publisherName && !ascapWorkId && !bmiWorkId && !writerIpi && hasPartialData(isOneStop !== null)
    assertEqual(state, "BLOCKED", "isOneStop=true, no publisher/PRO/IPI → BLOCKED");
  }

  // Rule 4: all CLEAR conditions met → CLEAR
  {
    const { state, trace } = evaluateRightsState(
      makeInput({
        ownership: CLEAR_OWNERSHIP,
        publishing: CLEAR_PUBLISHING,
        usage_rights: CLEAR_USAGE,
      })
    );
    assertEqual(state, "CLEAR", "all conditions → CLEAR");
    const rule4 = trace.find((t) => t.to === "CLEAR" && t.triggered);
    if (!rule4) fail("CLEAR trace", "expected rule4 triggered in trace");
    pass("CLEAR trace contains triggered rule4");
  }

  // CLEAR requires ISRC
  {
    const { state } = evaluateRightsState(
      makeInput({
        metadata: { ...BASE_METADATA, isrc: null },
        ownership: CLEAR_OWNERSHIP,
        publishing: CLEAR_PUBLISHING,
        usage_rights: CLEAR_USAGE,
      })
    );
    assertEqual(state, "PARTIALLY_CLEAR", "CLEAR conditions met but ISRC missing → PARTIALLY_CLEAR");
  }

  // CLEAR requires writerIpi
  {
    const { state } = evaluateRightsState(
      makeInput({
        ownership: CLEAR_OWNERSHIP,
        publishing: { ...CLEAR_PUBLISHING, writerIpi: null },
        usage_rights: CLEAR_USAGE,
      })
    );
    assertEqual(state, "PARTIALLY_CLEAR", "CLEAR conditions met but writerIpi missing → PARTIALLY_CLEAR");
  }

  // Rule 5: partial data present but not enough for CLEAR → PARTIALLY_CLEAR
  {
    const { state } = evaluateRightsState(
      makeInput({
        ownership: { ...NULL_OWNERSHIP, masterOwnershipPct: 50 },
        publishing: { ...NULL_PUBLISHING, publisherName: "Publisher", ascapWorkId: "123" },
      })
    );
    assertEqual(state, "PARTIALLY_CLEAR", "pct=50 + publisher → PARTIALLY_CLEAR");
  }

  // Rule 6: rights profile present but all actionable fields null → UNVERIFIED
  {
    const { state } = evaluateRightsState(
      makeInput({ ownership: { ...NULL_OWNERSHIP, masterOwnershipType: "UNKNOWN" } })
    );
    // masterOwnershipType present → hasRightsProfile = true
    // no conflict, no partial data (pct null, all publishing null, isOneStop null)
    assertEqual(state, "UNVERIFIED", "only masterOwnershipType (no numeric data) → UNVERIFIED");
  }
}

// ── evaluateTrack / evaluateBlockers tests ────────────────────────────────────

function testEvaluateTrack(): void {
  console.log("\n=== evaluateTrack (blockers + confidence) ===\n");

  // CLEAR track: 0 blockers, confidence = 1.0
  {
    const result = evaluateTrack(
      makeInput({
        ownership: CLEAR_OWNERSHIP,
        publishing: CLEAR_PUBLISHING,
        usage_rights: CLEAR_USAGE,
      })
    );
    assertEqual(result.rights_state, "CLEAR", "CLEAR track state");
    assertEqual(result.blockers, [], "CLEAR track → 0 blockers");
    assertEqual(result.confidence_score, 1.0, "CLEAR track → confidence 1.0");
  }

  // INGESTED track: all 9 blocker conditions fire (except MASTER_OWNERSHIP_CONFLICT)
  {
    const result = evaluateTrack(makeInput({ metadata: { isrc: null, title: null, artistName: null } }));
    assertEqual(result.rights_state, "INGESTED", "INGESTED track state");
    const expected = [
      "ISRC_MISSING",
      "TITLE_MISSING",
      "MASTER_PCT_UNSET",
      "WRITER_UNIDENTIFIED",
      "WRITER_IPI_MISSING",
      "PUBLISHER_UNKNOWN",
      "PRO_WORK_ID_MISSING",
      "ONE_STOP_NOT_CONFIRMED",
    ];
    assertEqual(result.blockers, expected, "INGESTED track → 8 blockers");
  }

  // BLOCKED via conflict: MASTER_OWNERSHIP_CONFLICT blocker present
  {
    const result = evaluateTrack(
      makeInput({
        ownership: { ...NULL_OWNERSHIP, masterOwnershipPct: 0, masterOwnedBy: "Label A" },
      })
    );
    assertEqual(result.rights_state, "BLOCKED", "conflict → BLOCKED state");
    if (!result.blockers.includes("MASTER_OWNERSHIP_CONFLICT")) {
      fail("conflict blockers", "expected MASTER_OWNERSHIP_CONFLICT in blockers");
    }
    pass("conflict → MASTER_OWNERSHIP_CONFLICT blocker");
    // pct=0 (not null) so MASTER_PCT_UNSET should NOT fire
    if (result.blockers.includes("MASTER_PCT_UNSET")) {
      fail("conflict blockers", "MASTER_PCT_UNSET should not fire when pct=0 (it is set)");
    }
    pass("conflict → no spurious MASTER_PCT_UNSET");
  }

  // Confidence score: CLEAR track title present → 9/9 = 1.0
  {
    const result = evaluateTrack(
      makeInput({
        metadata: { ...BASE_METADATA, title: "Track Title" },
        ownership: CLEAR_OWNERSHIP,
        publishing: CLEAR_PUBLISHING,
        usage_rights: CLEAR_USAGE,
      })
    );
    assertEqual(result.confidence_score, 1.0, "full data → confidence 1.0");
  }

  // Confidence score: BLOCKED (conflict) removes the !hasMasterConflict point
  {
    const result = evaluateTrack(
      makeInput({
        ownership: { ...NULL_OWNERSHIP, masterOwnershipPct: 0, masterOwnedBy: "Label A" },
      })
    );
    // !hasMasterConflict = false → only 1 point (present(title)=true) for non-conflict minus that
    // checks: isrc=T, title=T, !conflict=F, masterVerified=F, writerName=F, writerIpi=F, publisherName=F, proId=F, oneStop=F
    // passed = 2 → 2/9 ≈ 0.22
    assertEqual(result.confidence_score, 0.22, "conflict track → confidence 0.22");
  }

  // Audit hash is deterministic
  {
    const input = makeInput({
      ownership: CLEAR_OWNERSHIP,
      publishing: CLEAR_PUBLISHING,
      usage_rights: CLEAR_USAGE,
    });
    const r1 = evaluateTrack(input);
    const r2 = evaluateTrack(input);
    assertEqual(r1.audit_hash.hash, r2.audit_hash.hash, "audit hash is deterministic");
  }

  // Blocker list is sorted in audit hash
  {
    const result = evaluateTrack(makeInput());
    const hashBlockers = result.audit_hash.input.blocker_codes;
    const sorted = [...hashBlockers].sort();
    assertEqual(hashBlockers, sorted, "audit hash blocker_codes are sorted");
  }
}

// ── computeRightsState tests ──────────────────────────────────────────────────

function testComputeRightsState(): void {
  console.log("\n=== computeRightsState ===\n");

  assertEqual(computeRightsState(null), "INGESTED", "null → INGESTED");
  assertEqual(computeRightsState(undefined), "INGESTED", "undefined → INGESTED");
  assertEqual(computeRightsState({}), "UNVERIFIED", "empty profile → UNVERIFIED");

  assertEqual(
    computeRightsState({ masterOwnershipType: "DISPUTED" }),
    "BLOCKED",
    "DISPUTED → BLOCKED"
  );

  const clearProfile: RightsProfileForState = {
    ascapWorkId: "123456789",
    isOneStop: true,
    masterOwnershipType: "EXCLUSIVE",
    masterVerifiedAt: new Date("2024-01-01"),
  };
  assertEqual(computeRightsState(clearProfile), "CLEAR", "all 3 conditions → CLEAR");

  // 2 of 3 → PARTIALLY_CLEAR
  assertEqual(
    computeRightsState({ ascapWorkId: "123", isOneStop: true }),
    "PARTIALLY_CLEAR",
    "workId + oneStop (no verifiedOwnership) → PARTIALLY_CLEAR"
  );

  // 1 of 3 → PARTIALLY_CLEAR
  assertEqual(
    computeRightsState({ ascapWorkId: "123" }),
    "PARTIALLY_CLEAR",
    "workId only → PARTIALLY_CLEAR"
  );

  // masterOwnershipType = "UNKNOWN" counts as NOT verified
  assertEqual(
    computeRightsState({
      ascapWorkId: "123",
      isOneStop: true,
      masterOwnershipType: "UNKNOWN",
      masterVerifiedAt: new Date(),
    }),
    "PARTIALLY_CLEAR",
    "masterOwnershipType=UNKNOWN → not verified → PARTIALLY_CLEAR"
  );

  // masterVerifiedAt null even with non-UNKNOWN type → not verified
  assertEqual(
    computeRightsState({
      ascapWorkId: "123",
      isOneStop: true,
      masterOwnershipType: "EXCLUSIVE",
      masterVerifiedAt: null,
    }),
    "PARTIALLY_CLEAR",
    "masterVerifiedAt=null → not verified → PARTIALLY_CLEAR"
  );

  // 0 of 3 → UNVERIFIED
  assertEqual(
    computeRightsState({ masterOwnershipType: "EXCLUSIVE", masterVerifiedAt: new Date() }),
    "PARTIALLY_CLEAR",
    "verifiedOwnership only → PARTIALLY_CLEAR (1/3)"
  );

  assertEqual(computeRightsState({ proAffiliation: "ASCAP" }), "UNVERIFIED", "unknown field only → UNVERIFIED");
}

// ── Run all ──────────────────────────────────────────────────────────────────

testEvaluateRightsState();
testEvaluateTrack();
testComputeRightsState();

console.log("\nAll rights state machine tests passed.\n");
