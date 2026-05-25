/**
 * Versioned JSON report builder (RULE-004 summary rollup, RULE-034 schema & ok).
 *
 * THE STRANGLER-FIG POINT: this module CONSUMES the already-completed `score`
 * slice (`@ts-doctor/score-effect`) for the monorepo MIN score (RULE-003) and the
 * band label (RULE-002) — it does not re-derive them. A legacy `number | null`
 * per-project score is bridged into the score slice's `Option<Score>` API at the
 * trust boundary via `Option.fromNullable(n).pipe(Option.flatMap(decodeScore))`.
 *
 * Per the Modernization Brief (line 91) `buildReport`/`summarize` stay PLAIN
 * synchronous pure functions — NOT `Effect`-wrapped. The Effect ecosystem appears
 * only in the wire contract (`effect/Schema`, see Report.ts) and in the consumed
 * score slice's `Option<Score>` bridge. Deterministic record-building over an
 * in-memory diagnostic set buys nothing from a fiber.
 *
 * NO ROUNDING DEVIATION here (unlike the score slice): the summary MINs
 * ALREADY-ROUNDED per-project scores, so this builder is FULLY equivalent to
 * legacy `build-report.ts:63-124`. The half-even deviation lives only in score
 * computation, which this slice does not perform.
 */

import { Option } from "effect";
import {
  decodeScore,
  scoreLabel,
  summarizeMonorepoScore,
  type Score,
} from "@ts-doctor/score-effect";
import type { Diagnostic } from "@ts-doctor/contracts-effect";
import {
  JSON_REPORT_SCHEMA_VERSION,
  type JsonReportDiffInfo,
  type JsonReportError,
  type JsonReportProjectEntry,
  type JsonReportSummary,
  type JsonReportV1,
  type ReportMode,
} from "./Report.js";

/** Per-project input the report builder aggregates (legacy `build-report.ts:27-34`). */
export interface BuildReportProject {
  directory: string;
  diagnostics: ReadonlyArray<Diagnostic>;
  /** Legacy nullable per-project score; bridged to the score slice's `Option<Score>`. */
  score: number | null;
  scorePartial: boolean;
  skippedChecks: ReadonlyArray<string>;
  elapsedMilliseconds: number;
}

/** Inputs to {@link buildReport} (legacy `build-report.ts:37-47`). */
export interface BuildReportInput {
  version: string;
  directory: string;
  mode: ReportMode;
  /** Diff/staged metadata; `null`/omitted in full mode (RULE-033). */
  diff?: JsonReportDiffInfo | null;
  projects: ReadonlyArray<BuildReportProject>;
  elapsedMilliseconds: number;
  /** When set, the run failed; `ok` becomes false (RULE-034). */
  error?: JsonReportError | null;
}

/**
 * Bridge a legacy `number | null` per-project score into the score slice's
 * `Option<Score>` trust-boundary type. `null` (unscored) and any out-of-range /
 * non-integer value collapse to `Option.none()` (skipped by the MIN), exactly as
 * legacy's `null`-skipping did for `null`.
 */
const toScoreOption = (n: number | null): Option.Option<Score> =>
  Option.fromNullable(n).pipe(Option.flatMap(decodeScore));

/**
 * Roll per-project results into the report `summary` (RULE-004).
 *
 * - `errorCount` / `warningCount`: OCCURRENCE counts via a STRUCTURAL severity
 *   split (`=== "error"`, else warning) — matching legacy/RULE-001 binary bucketing.
 * - `affectedFileCount`: size of the DISTINCT `filePath` set.
 * - `totalDiagnosticCount`: total OCCURRENCES (NOT distinct rules — kept separate
 *   from the score's distinct-rule semantics, RULE-004 flagged defect).
 * - `score` / `scoreLabel`: from the pre-computed monorepo MIN `Option<Score>`;
 *   `scoreLabel` (the WIRE field) carries the score slice's `band`, set ONLY when
 *   `score !== null`.
 */
function summarize(
  allDiagnostics: ReadonlyArray<Diagnostic>,
  summaryScore: Option.Option<Score>,
  summaryPartial: boolean,
): JsonReportSummary {
  // OCCURRENCE counts via a STRUCTURAL severity split — commutative, so a functional
  // pass is provably identical to the legacy accumulator loop (proven by equivalence.test).
  const errorCount = allDiagnostics.filter((d) => d.severity === "error").length;
  const affectedFiles = new Set(allDiagnostics.map((d) => d.filePath));
  return {
    errorCount,
    warningCount: allDiagnostics.length - errorCount,
    affectedFileCount: affectedFiles.size,
    totalDiagnosticCount: allDiagnostics.length,
    score: Option.getOrNull(summaryScore),
    // band -> the `scoreLabel` WIRE field (RULE-034 wire compat); null when unscored.
    scoreLabel: Option.match(summaryScore, {
      onNone: () => null,
      onSome: (s) => scoreLabel(s),
    }),
    scorePartial: summaryPartial,
  };
}

/**
 * Build the versioned report (RULE-004, RULE-034). The top-level `diagnostics` is
 * the FLAT union of every project's diagnostics; `summary.score` is the MIN over
 * scored projects (RULE-003, via the score slice); `summary.scorePartial` is the
 * logical OR over projects; `ok` is false when an `error` is supplied.
 */
export function buildReport(input: BuildReportInput): JsonReportV1 {
  const projects: JsonReportProjectEntry[] = input.projects.map((p) => ({
    directory: p.directory,
    diagnostics: p.diagnostics,
    score: p.score,
    scorePartial: p.scorePartial,
    skippedChecks: p.skippedChecks,
    elapsedMilliseconds: p.elapsedMilliseconds,
  }));

  const allDiagnostics: Diagnostic[] = input.projects.flatMap(
    (p) => p.diagnostics,
  );
  const summaryScore = summarizeMonorepoScore(
    input.projects.map((p) => toScoreOption(p.score)),
  );
  const summaryPartial = input.projects.some((p) => p.scorePartial);

  const error = input.error ?? null;

  return {
    schemaVersion: JSON_REPORT_SCHEMA_VERSION,
    version: input.version,
    ok: error === null,
    directory: input.directory,
    mode: input.mode,
    diff: input.diff ?? null,
    diagnostics: allDiagnostics,
    summary: summarize(allDiagnostics, summaryScore, summaryPartial),
    projects,
    elapsedMilliseconds: input.elapsedMilliseconds,
    error,
  };
}
