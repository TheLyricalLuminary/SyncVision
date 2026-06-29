/**
 * Mirror Benchmark Runner
 *
 * Executes mirror-search test cases, measures runtime, and detects score
 * drift between runs.
 *
 * Usage:
 *   tsx src/scripts/benchmarkMirror.ts \
 *     --catalog <catalogId>           \   (required)
 *     [--self-match]                  \   auto-generate self-match cases
 *     [--cases cases.json]            \   additional specific test cases
 *     [--output results.json]         \   save current results (default: benchmark_<ts>.json)
 *     [--prev results.json]           \   compare against prior run for regression
 *     [--top-n 10]                    \   candidates to return per search
 *
 * Self-match mode: for every fingerprinted track in the catalog, search for
 * that track's own timeline and expect it to rank #1. Any track that does not
 * rank #1 is reported as a regression.
 *
 * Specific test case format (cases.json):
 *   [
 *     {
 *       "id": "case-001",
 *       "description": "Artist A is like catalog track T",
 *       "tempTrackPath": "/absolute/path/to/temp.mp3",
 *       "expectedTrackId": "cjx123...",
 *       "expectedMaxRank": 3
 *     }
 *   ]
 *
 * Regression detection thresholds (applied when --prev is provided):
 *   - Rank shift        > 0 on a previously-passing case → REGRESSION
 *   - Overall score ±5  on any case                     → DRIFT_WARNING
 *   - Component ±10 on any case                          → DRIFT_WARNING
 */

import path from "path";
import fs from "fs";
import "dotenv/config";
import prisma from "../lib/prisma";
import { transcodeAndAnalyze } from "../services/processAudio";
import {
  buildFingerprintData,
  buildCoarseEnvelope,
  prefilterCandidates,
  rankCandidates,
  DEFAULT_MIRROR_WEIGHTS,
  type MirrorWeights,
  type MirrorMatchResult,
  type MirrorComponents,
  type CoarseEnvelope,
} from "../scoring/mirrorMatch";
import {
  loadCoarseFingerprints,
  loadFullFingerprints,
} from "../services/catalogFingerprint";
import type { ForensicTimeline } from "../services/processAudio";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpecificCase {
  id:              string;
  description:     string;
  tempTrackPath:   string;
  expectedTrackId: string;
  expectedMaxRank: number;
}

interface BenchmarkResult {
  caseId:          string;
  caseType:        "self" | "specific";
  description:     string;
  passed:          boolean;
  actualRank:      number | null;  // null if expectedTrackId not in results
  expectedMaxRank: number;
  runtimeMs:       number;
  overall:         number | null;
  components:      MirrorComponents | null;
  alignmentOffsetSecs: number | null;
  confidence:      string | null;
  topResults:      Array<{ trackId: string; trackTitle: string; overall: number }>;
}

interface BenchmarkRun {
  timestamp:         string;
  modelVersion:      string;
  catalogId:         string;
  weights:           MirrorWeights;
  totalCases:        number;
  passed:            number;
  failed:            number;
  totalRuntimeMs:    number;
  avgCaseRuntimeMs:  number;
  results:           BenchmarkResult[];
}

interface RegressionReport {
  regressions:    string[];
  driftWarnings:  string[];
  newCases:       string[];
  resolvedCases:  string[];
}

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  catalogId:   string;
  selfMatch:   boolean;
  casesFile:   string | null;
  outputFile:  string | null;
  prevFile:    string | null;
  topN:        number;
} {
  let catalogId:  string | null = null;
  let selfMatch   = false;
  let casesFile:  string | null = null;
  let outputFile: string | null = null;
  let prevFile:   string | null = null;
  let topN        = 10;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--catalog"    && argv[i + 1]) { catalogId  = argv[++i]; continue; }
    if (a === "--cases"      && argv[i + 1]) { casesFile  = argv[++i]; continue; }
    if (a === "--output"     && argv[i + 1]) { outputFile = argv[++i]; continue; }
    if (a === "--prev"       && argv[i + 1]) { prevFile   = argv[++i]; continue; }
    if (a === "--top-n"      && argv[i + 1]) { topN       = parseInt(argv[++i], 10); continue; }
    if (a === "--self-match")                 { selfMatch  = true; continue; }
  }

  if (!catalogId) {
    console.error("ERROR: --catalog <catalogId> is required");
    process.exit(1);
  }

  return { catalogId, selfMatch, casesFile, outputFile, prevFile, topN };
}

// ── Search runner (shared by self-match and specific cases) ───────────────────

async function runSearch(
  queryTimeline:  ForensicTimeline,
  queryInputHash: string,
  catalogId:      string,
  weights:        MirrorWeights,
  topN:           number,
): Promise<MirrorMatchResult[]> {
  const queryCoarse: CoarseEnvelope = {
    subZero:        buildCoarseEnvelope(queryTimeline.subZero),
    zeroPocketZone: buildCoarseEnvelope(queryTimeline.zeroPocketZone),
    presence:       buildCoarseEnvelope(queryTimeline.presence),
    cmamTension:    buildCoarseEnvelope(queryTimeline.cmamTension),
  };

  const allCoarse  = await loadCoarseFingerprints(catalogId);
  const preFiltered = prefilterCandidates(queryCoarse, allCoarse, 50);
  const full       = await loadFullFingerprints(preFiltered.map(f => f.trackId));

  const candidates = full.map(fp => ({
    trackId:      fp.trackId,
    trackTitle:   fp.trackTitle,
    artistName:   fp.artistName,
    fps:          fp.fps,
    inputHash:    fp.inputHash,
    fullTimeline: fp.fullTimeline,
  }));

  return rankCandidates(queryTimeline, queryInputHash, candidates, weights).slice(0, topN);
}

// ── Self-match cases ──────────────────────────────────────────────────────────

async function runSelfMatchCases(
  catalogId: string,
  weights:   MirrorWeights,
  topN:      number,
): Promise<BenchmarkResult[]> {
  const fingerprints = await prisma.mirrorFingerprint.findMany({
    where: { track: { catalogId, isArchived: false } },
    select: {
      trackId:      true,
      fullTimeline: true,
      fps:          true,
      inputHash:    true,
      modelVersion: true,
      track: { select: { title: true, artistName: true } },
    },
  });

  if (fingerprints.length === 0) {
    console.warn("[benchmark] No fingerprints found. Run fingerprinting first.");
    return [];
  }

  const results: BenchmarkResult[] = [];

  for (const fp of fingerprints) {
    const caseId     = `self_${fp.trackId}`;
    const description = `Self-match: ${fp.track.title}${fp.track.artistName ? ` — ${fp.track.artistName}` : ""}`;
    const started    = Date.now();

    const timeline: ForensicTimeline = fp.fullTimeline as unknown as ForensicTimeline;

    try {
      const ranked = await runSearch(timeline, fp.inputHash, catalogId, weights, topN);
      const rank   = ranked.findIndex(r => r.trackId === fp.trackId) + 1;
      const top    = ranked[0];

      results.push({
        caseId,
        caseType:       "self",
        description,
        passed:         rank === 1,
        actualRank:     rank > 0 ? rank : null,
        expectedMaxRank: 1,
        runtimeMs:      Date.now() - started,
        overall:        top?.trackId === fp.trackId ? top.overall : null,
        components:     top?.trackId === fp.trackId ? top.components : null,
        alignmentOffsetSecs: top?.trackId === fp.trackId ? top.alignmentOffsetSecs : null,
        confidence:     top?.trackId === fp.trackId ? top.confidence : null,
        topResults:     ranked.slice(0, 5).map(r => ({
          trackId:    r.trackId,
          trackTitle: r.trackTitle,
          overall:    r.overall,
        })),
      });

      const status = rank === 1 ? "PASS" : `FAIL (rank=${rank ?? "not found"})`;
      console.log(`  [${status}] ${description}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [ERROR] ${description}: ${msg}`);
      results.push({
        caseId,
        caseType:       "self",
        description,
        passed:         false,
        actualRank:     null,
        expectedMaxRank: 1,
        runtimeMs:      Date.now() - started,
        overall:        null,
        components:     null,
        alignmentOffsetSecs: null,
        confidence:     null,
        topResults:     [],
      });
    }
  }

  return results;
}

// ── Specific cases ────────────────────────────────────────────────────────────

async function runSpecificCases(
  cases:     SpecificCase[],
  catalogId: string,
  weights:   MirrorWeights,
  topN:      number,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const c of cases) {
    const started = Date.now();

    try {
      if (!fs.existsSync(c.tempTrackPath)) {
        throw new Error(`tempTrackPath not found: ${c.tempTrackPath}`);
      }

      const analysis = await transcodeAndAnalyze(c.tempTrackPath, 25);
      const ranked   = await runSearch(
        analysis.forensicTimeline,
        analysis.inputHash,
        catalogId,
        weights,
        topN,
      );

      const idx    = ranked.findIndex(r => r.trackId === c.expectedTrackId);
      const rank   = idx >= 0 ? idx + 1 : null;
      const passed = rank !== null && rank <= c.expectedMaxRank;
      const match  = ranked[idx];

      results.push({
        caseId:         c.id,
        caseType:       "specific",
        description:    c.description,
        passed,
        actualRank:     rank,
        expectedMaxRank: c.expectedMaxRank,
        runtimeMs:      Date.now() - started,
        overall:        match?.overall         ?? null,
        components:     match?.components      ?? null,
        alignmentOffsetSecs: match?.alignmentOffsetSecs ?? null,
        confidence:     match?.confidence      ?? null,
        topResults:     ranked.slice(0, 5).map(r => ({
          trackId:    r.trackId,
          trackTitle: r.trackTitle,
          overall:    r.overall,
        })),
      });

      const status = passed
        ? `PASS (rank=${rank})`
        : `FAIL (rank=${rank ?? "not found"}, expected ≤${c.expectedMaxRank})`;
      console.log(`  [${status}] ${c.description}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [ERROR] ${c.id}: ${msg}`);
      results.push({
        caseId:         c.id,
        caseType:       "specific",
        description:    c.description,
        passed:         false,
        actualRank:     null,
        expectedMaxRank: c.expectedMaxRank,
        runtimeMs:      Date.now() - started,
        overall:        null,
        components:     null,
        alignmentOffsetSecs: null,
        confidence:     null,
        topResults:     [],
      });
    }
  }

  return results;
}

// ── Regression detection ──────────────────────────────────────────────────────

function detectRegressions(
  current: BenchmarkRun,
  prev:    BenchmarkRun,
): RegressionReport {
  const regressions:   string[] = [];
  const driftWarnings: string[] = [];
  const newCases:      string[] = [];
  const resolvedCases: string[] = [];

  const prevById = new Map(prev.results.map(r => [r.caseId, r]));
  const curById  = new Map(current.results.map(r => [r.caseId, r]));

  for (const cur of current.results) {
    const p = prevById.get(cur.caseId);
    if (!p) {
      newCases.push(`${cur.caseId} (${cur.description})`);
      continue;
    }

    // Rank regression: was passing, now failing
    if (p.passed && !cur.passed) {
      regressions.push(
        `${cur.caseId}: rank regressed from ≤${p.expectedMaxRank} → ` +
        `actual ${cur.actualRank ?? "not found"} (${cur.description})`,
      );
    }

    // Previously failing, now passing
    if (!p.passed && cur.passed) {
      resolvedCases.push(`${cur.caseId} (${cur.description})`);
    }

    // Score drift
    if (cur.overall !== null && p.overall !== null) {
      const drift = Math.abs(cur.overall - p.overall);
      if (drift > 5) {
        driftWarnings.push(
          `${cur.caseId}: overall drifted ${p.overall} → ${cur.overall} (Δ${drift}) (${cur.description})`,
        );
      }
    }

    // Component drift
    if (cur.components && p.components) {
      const dims = ["structural", "energy", "harmonic", "dialogueSafety"] as const;
      for (const dim of dims) {
        const prev = p.components[dim];
        const curV = cur.components[dim];
        if (Math.abs(curV - prev) > 10) {
          driftWarnings.push(
            `${cur.caseId}.${dim}: ${prev} → ${curV} (Δ${Math.abs(curV - prev)})`,
          );
        }
      }
    }
  }

  for (const p of prev.results) {
    if (!curById.has(p.caseId)) {
      resolvedCases.push(`${p.caseId} removed`);
    }
  }

  return { regressions, driftWarnings, newCases, resolvedCases };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { catalogId, selfMatch, casesFile, outputFile, prevFile, topN } =
    parseArgs(process.argv.slice(2));

  const weights = DEFAULT_MIRROR_WEIGHTS;

  // Resolve model version from the catalog's latest fingerprint
  const sampleFp = await prisma.mirrorFingerprint.findFirst({
    where:  { track: { catalogId } },
    select: { modelVersion: true },
  });
  const modelVersion = sampleFp?.modelVersion ?? "unknown";

  const allResults: BenchmarkResult[] = [];

  if (selfMatch) {
    console.log("\n── Self-match cases ─────────────────────────────────────────\n");
    const selfResults = await runSelfMatchCases(catalogId, weights, topN);
    allResults.push(...selfResults);
  }

  if (casesFile) {
    const casesPath = path.resolve(casesFile);
    if (!fs.existsSync(casesPath)) {
      console.error(`ERROR: cases file not found: ${casesPath}`);
      process.exit(1);
    }
    const cases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as SpecificCase[];
    console.log(`\n── Specific cases (${cases.length}) ─────────────────────────\n`);
    const specific = await runSpecificCases(cases, catalogId, weights, topN);
    allResults.push(...specific);
  }

  if (allResults.length === 0) {
    console.log("No cases to run. Pass --self-match and/or --cases <file>.");
    await prisma.$disconnect();
    return;
  }

  const passed       = allResults.filter(r => r.passed).length;
  const failed       = allResults.length - passed;
  const totalRuntime = allResults.reduce((s, r) => s + r.runtimeMs, 0);

  const run: BenchmarkRun = {
    timestamp:        new Date().toISOString(),
    modelVersion,
    catalogId,
    weights,
    totalCases:       allResults.length,
    passed,
    failed,
    totalRuntimeMs:   totalRuntime,
    avgCaseRuntimeMs: Math.round(totalRuntime / allResults.length),
    results:          allResults,
  };

  // Summary
  console.log(`\n── Summary ──────────────────────────────────────────────────\n`);
  console.log(`  Total:   ${run.totalCases}`);
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Runtime: ${totalRuntime}ms (avg ${run.avgCaseRuntimeMs}ms/case)`);

  // Regression check
  if (prevFile) {
    const prevPath = path.resolve(prevFile);
    if (!fs.existsSync(prevPath)) {
      console.warn(`[benchmark] --prev file not found: ${prevPath} — skipping regression check`);
    } else {
      const prev = JSON.parse(fs.readFileSync(prevPath, "utf8")) as BenchmarkRun;
      const report = detectRegressions(run, prev);

      console.log(`\n── Regression report ────────────────────────────────────────\n`);

      if (report.regressions.length > 0) {
        console.log("  REGRESSIONS:");
        report.regressions.forEach(r => console.log(`    ✗ ${r}`));
      } else {
        console.log("  No regressions.");
      }

      if (report.driftWarnings.length > 0) {
        console.log("  DRIFT WARNINGS:");
        report.driftWarnings.forEach(d => console.log(`    ~ ${d}`));
      }

      if (report.newCases.length > 0) {
        console.log("  NEW CASES:");
        report.newCases.forEach(c => console.log(`    + ${c}`));
      }

      if (report.resolvedCases.length > 0) {
        console.log("  RESOLVED:");
        report.resolvedCases.forEach(c => console.log(`    ✓ ${c}`));
      }

      (run as BenchmarkRun & { regressionReport?: RegressionReport }).regressionReport = report;
    }
  }

  // Save output
  const outPath = outputFile
    ?? `benchmark_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  fs.writeFileSync(path.resolve(outPath), JSON.stringify(run, null, 2));
  console.log(`\n  Saved results → ${outPath}\n`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
