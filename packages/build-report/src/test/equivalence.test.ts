/**
 * THE EQUIVALENCE PROOF — differential test, modern vs legacy oracle (RULE-004, RULE-034).
 *
 * Goal: prove the Effect-TS `buildReport` / `summarize` / `serializeError` are
 * STRUCTURALLY byte-for-byte equivalent to the legacy `build-report.ts` algorithm
 * over crafted multi-project fixtures. Expect 100% equality — unlike the `score`
 * slice, build-report has NO rounding deviation: it MINs ALREADY-ROUNDED per-project
 * scores (the half-even deviation lives only in score computation, not here), so
 * the modern report is fully equivalent to legacy.
 *
 * Strategy:
 *   1. Vendored, ATTRIBUTED frozen copies of the legacy algorithm as the oracle:
 *      - legacy `build-report.ts:50-124` (serializeError / summarize / buildReport)
 *      - legacy `score.ts:72-92` (scoreLabel / summarizeMonorepoScore) — the
 *        oracle's score helpers. `scoreLabel` is half-up-irrelevant (it labels an
 *        ALREADY-rounded integer); `summarizeMonorepoScore` is a pure MIN. Vendored
 *        so the oracle is self-contained and does NOT import the modern score slice.
 *   2. Crafted multi-project fixtures exercising: error/warning split, duplicate
 *      filePaths within/across projects, the same rule firing N times (occurrences
 *      vs distinct-rules), null/all-null/mixed scores, partial OR, full/diff/staged
 *      modes, error vs no-error (ok), and deep cause chains.
 *   3. Assert modern buildReport output === legacy buildReport output via
 *      `toStrictEqual` (full structural equality of the whole JsonReportV1).
 */

import { describe, expect, it } from "vitest";
import { buildReport, serializeError } from "../main/index.js";
import type { BuildReportInput, Diagnostic } from "../main/index.js";

// ===========================================================================
// ORACLE — frozen copy of legacy/tsnuke/packages/core/src/score.ts:72-92.
// scoreLabel + summarizeMonorepoScore. For differential testing ONLY.
// (Legacy scoreLabel returns plain `string`; the half-UP rounding lives in
//  legacy computeScore which is NOT used here — build-report MINs already-rounded
//  scores, so this oracle is numerically identical to the modern path.)
// ===========================================================================
const LEGACY_SCORE_GOOD = 75;
const LEGACY_SCORE_OK = 50;
const LEGACY_LABEL_GREAT = "Great";
const LEGACY_LABEL_NEEDS_WORK = "Needs work";
const LEGACY_LABEL_CRITICAL = "Critical";

function legacyScoreLabel(score: number): string {
  if (score >= LEGACY_SCORE_GOOD) return LEGACY_LABEL_GREAT;
  if (score >= LEGACY_SCORE_OK) return LEGACY_LABEL_NEEDS_WORK;
  return LEGACY_LABEL_CRITICAL;
}

function legacySummarizeMonorepoScore(
  perProjectScores: readonly (number | null)[],
): number | null {
  let min: number | null = null;
  for (const s of perProjectScores) {
    if (s === null) continue;
    min = min === null ? s : Math.min(min, s);
  }
  return min;
}

// ===========================================================================
// ORACLE — frozen copy of legacy/tsnuke/packages/core/src/build-report.ts:50-124.
// serializeError / summarize / buildReport. For differential testing ONLY — do
// not "fix" it; it defines legacy behavior we are proving equivalence to.
// ===========================================================================
const LEGACY_JSON_REPORT_SCHEMA_VERSION = 1 as const;

interface LegacyJsonReportError {
  message: string;
  name: string;
  chain: string[];
}

function legacySerializeError(err: unknown): LegacyJsonReportError {
  if (err instanceof Error) {
    const chain: string[] = [];
    let cause: unknown = (err as { cause?: unknown }).cause;
    while (cause instanceof Error) {
      chain.push(cause.message);
      cause = (cause as { cause?: unknown }).cause;
    }
    return { message: err.message, name: err.name, chain };
  }
  return { message: String(err), name: "UnknownError", chain: [] };
}

function legacySummarize(
  allDiagnostics: readonly Diagnostic[],
  summaryScore: number | null,
  summaryPartial: boolean,
) {
  let errorCount = 0;
  let warningCount = 0;
  const affectedFiles = new Set<string>();
  for (const d of allDiagnostics) {
    if (d.severity === "error") errorCount++;
    else warningCount++;
    affectedFiles.add(d.filePath);
  }
  return {
    errorCount,
    warningCount,
    affectedFileCount: affectedFiles.size,
    totalDiagnosticCount: allDiagnostics.length,
    score: summaryScore,
    scoreLabel: summaryScore !== null ? legacyScoreLabel(summaryScore) : null,
    scorePartial: summaryPartial,
  };
}

function legacyBuildReport(input: BuildReportInput) {
  const projects = input.projects.map((p) => ({
    directory: p.directory,
    diagnostics: p.diagnostics,
    score: p.score,
    scorePartial: p.scorePartial,
    skippedChecks: p.skippedChecks,
    elapsedMilliseconds: p.elapsedMilliseconds,
  }));

  const allDiagnostics = input.projects.flatMap((p) => p.diagnostics);
  const summaryScore = legacySummarizeMonorepoScore(
    input.projects.map((p) => p.score),
  );
  const summaryPartial = input.projects.some((p) => p.scorePartial);

  const error = input.error ?? null;

  return {
    schemaVersion: LEGACY_JSON_REPORT_SCHEMA_VERSION,
    version: input.version,
    ok: error === null,
    directory: input.directory,
    mode: input.mode,
    diff: input.diff ?? null,
    diagnostics: allDiagnostics,
    summary: legacySummarize(allDiagnostics, summaryScore, summaryPartial),
    projects,
    elapsedMilliseconds: input.elapsedMilliseconds,
    error,
  };
}

// ---------------------------------------------------------------------------
// Fixture builders.
// ---------------------------------------------------------------------------
let seq = 0;
function diag(
  over: Partial<Diagnostic> & Pick<Diagnostic, "rule" | "severity" | "filePath">,
): Diagnostic {
  return {
    plugin: "tsnuke",
    message: `msg-${seq++}`,
    help: "h",
    line: 1,
    column: 1,
    category: "c",
    tier: "SYN",
    ...over,
  } as Diagnostic;
}

type Project = BuildReportInput["projects"][number];
function project(over: Partial<Project> & Pick<Project, "directory">): Project {
  return {
    diagnostics: [],
    score: null,
    scorePartial: false,
    skippedChecks: [],
    elapsedMilliseconds: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Crafted multi-project fixtures — each a complete BuildReportInput.
// ---------------------------------------------------------------------------
const FIXTURES: ReadonlyArray<{ name: string; input: BuildReportInput }> = [
  {
    name: "empty monorepo (no projects, full mode)",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [],
      elapsedMilliseconds: 7,
    },
  },
  {
    name: "single project, mixed severities + duplicate filePath",
    input: {
      version: "1.2.3",
      directory: "/repo",
      mode: "full",
      projects: [
        project({
          directory: "/repo/a",
          diagnostics: [
            diag({ rule: "no-any", severity: "error", filePath: "/a/x.ts" }),
            diag({ rule: "no-any", severity: "error", filePath: "/a/x.ts" }), // occurrence dup
            diag({ rule: "prefer-const", severity: "warning", filePath: "/a/y.ts" }),
          ],
          score: 90,
          scorePartial: false,
          skippedChecks: ["GRAPH"],
          elapsedMilliseconds: 12,
        }),
      ],
      elapsedMilliseconds: 20,
    },
  },
  {
    name: "multi-project: MIN score, cross-project duplicate file, partial OR true",
    input: {
      version: "2.0.0",
      directory: "/repo",
      mode: "full",
      projects: [
        project({
          directory: "/repo/a",
          diagnostics: [diag({ rule: "r1", severity: "error", filePath: "/shared/x.ts" })],
          score: 88,
          scorePartial: false,
          elapsedMilliseconds: 5,
        }),
        project({
          directory: "/repo/b",
          diagnostics: [
            diag({ rule: "r2", severity: "warning", filePath: "/shared/x.ts" }), // dup path
            diag({ rule: "r3", severity: "warning", filePath: "/b/y.ts" }),
          ],
          score: 40,
          scorePartial: true, // forces summary.scorePartial = true
          skippedChecks: ["TYP"],
          elapsedMilliseconds: 9,
        }),
      ],
      elapsedMilliseconds: 30,
    },
  },
  {
    name: "mixed null + scored projects (null skipped in MIN)",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [
        project({ directory: "/a", score: 90 }),
        project({ directory: "/b", score: null }),
        project({ directory: "/c", score: 55 }),
      ],
      elapsedMilliseconds: 3,
    },
  },
  {
    name: "all-null scores -> summary.score & scoreLabel null",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [project({ directory: "/a", score: null }), project({ directory: "/b", score: null })],
      elapsedMilliseconds: 3,
    },
  },
  {
    name: "zero score project drags MIN to 0 (Critical band)",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [project({ directory: "/a", score: 100 }), project({ directory: "/b", score: 0 })],
      elapsedMilliseconds: 3,
    },
  },
  {
    name: "band boundary: MIN exactly 75 -> Great",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [project({ directory: "/a", score: 75 }), project({ directory: "/b", score: 80 })],
      elapsedMilliseconds: 3,
    },
  },
  {
    name: "band boundary: MIN exactly 50 -> Needs work",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [project({ directory: "/a", score: 50 }), project({ directory: "/b", score: 99 })],
      elapsedMilliseconds: 3,
    },
  },
  {
    name: "diff mode with diff metadata",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "diff",
      diff: {
        baseBranch: "main",
        currentBranch: "feature/x",
        changedFileCount: 4,
        isCurrentChanges: false,
      },
      projects: [project({ directory: "/a", score: 70, diagnostics: [diag({ rule: "r", severity: "warning", filePath: "/a/z.ts" })] })],
      elapsedMilliseconds: 11,
    },
  },
  {
    name: "staged mode (diff omitted -> null)",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "staged",
      projects: [project({ directory: "/a", score: 60 })],
      elapsedMilliseconds: 6,
    },
  },
  {
    name: "failed run: error present -> ok false",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [project({ directory: "/a", score: 90 })],
      elapsedMilliseconds: 4,
      error: { message: "discovery failed", name: "DiscoveryError", chain: ["fs gone"] },
    },
  },
  {
    name: "error explicitly null -> ok true",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [project({ directory: "/a", score: 90 })],
      elapsedMilliseconds: 4,
      error: null,
    },
  },
];

describe("equivalence — RULE-004/034 buildReport vs legacy oracle (full structural equality)", () => {
  for (const { name, input } of FIXTURES) {
    it(`modern buildReport === legacy buildReport: ${name}`, () => {
      const modern = buildReport(input);
      const legacy = legacyBuildReport(input);
      expect(modern).toStrictEqual(legacy);
    });
  }

  it("traverses every fixture (harness guard)", () => {
    expect(FIXTURES.length).toBeGreaterThan(10);
  });
});

describe("equivalence — RULE-034 serializeError vs legacy oracle", () => {
  const root = new Error("root");
  const mid = new Error("mid", { cause: root });
  const top = new Error("top", { cause: mid });

  class Tagged extends Error {
    override name = "DiscoveryError";
  }

  const CASES: ReadonlyArray<{ name: string; err: unknown }> = [
    { name: "plain Error", err: new Error("plain") },
    { name: "named Error", err: new Tagged("tagged") },
    { name: "deep cause chain (root-last)", err: top },
    { name: "string cause terminates the walk", err: new Error("x", { cause: "str" }) },
    { name: "object cause terminates the walk", err: new Error("x", { cause: { a: 1 } }) },
    { name: "non-Error: string", err: "boom" },
    { name: "non-Error: number", err: 42 },
    { name: "non-Error: null", err: null },
    { name: "non-Error: undefined", err: undefined },
    { name: "non-Error: object", err: { a: 1 } },
  ];

  for (const { name, err } of CASES) {
    it(`modern serializeError === legacy serializeError: ${name}`, () => {
      expect(serializeError(err)).toStrictEqual(legacySerializeError(err));
    });
  }
});

describe("RULE-004 / D2 — out-of-range per-project scores: validated-and-skipped (DELIBERATE divergence)", () => {
  // build-report bridges a legacy `number | null` per-project score through the score
  // slice's `decodeScore` (validates integer ∈ [0,100]). A score outside that domain
  // collapses to `Option.none` and is SKIPPED by the MIN — a deliberate boundary
  // hardening that DIVERGES from legacy's blind `Math.min`. In the real pipeline a
  // per-project score always comes from `computeScore` ∈ [0,100], so this never fires;
  // it is pinned here so the divergence is a PROVEN decision, not an unproven footnote
  // (architecture review). Cleaner long-term fix: tighten the input contract to
  // `Score | null` (see TRANSFORMATION_NOTES Follow-ups). These cases intentionally do
  // NOT go in the equality fixtures above, because modern ≠ legacy here by design.
  it("a negative score is skipped (modern) where legacy would MIN it", () => {
    const input: BuildReportInput = {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [
        project({ directory: "/a", score: 50 }),
        project({ directory: "/b", score: -5 }),
      ],
      elapsedMilliseconds: 0,
    };
    expect(buildReport(input).summary.score).toBe(50); // out-of-range -5 skipped
    expect(legacyBuildReport(input).summary.score).toBe(-5); // legacy blindly MINs
  });

  it("a non-integer score is skipped (modern) where legacy would keep it", () => {
    const input: BuildReportInput = {
      version: "1.0.0",
      directory: "/repo",
      mode: "full",
      projects: [project({ directory: "/a", score: 50.5 })],
      elapsedMilliseconds: 0,
    };
    expect(buildReport(input).summary.score).toBeNull(); // 50.5 not an int → skipped → nothing scored
    expect(legacyBuildReport(input).summary.score).toBe(50.5); // legacy keeps it
  });
});
