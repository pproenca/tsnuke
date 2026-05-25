/**
 * The versioned JSON report wire contract, as `effect/Schema` (RULE-034).
 *
 * Per the Modernization Brief (line 92) the report shape is EXPLICITLY modeled as
 * an `effect/Schema` — it is a versioned wire schema that external consumers parse,
 * so a single runtime `Schema.decode`/`Schema.encode` gate and a generated JSON
 * Schema are worth having. The pure builder functions (`buildReport`/`summarize`/
 * `serializeError`) stay plain synchronous functions (Brief line 91); they PRODUCE
 * values of these schema types but are not themselves `Effect`-wrapped.
 *
 * VENDORED from legacy `packages/core/src/types.ts` (`JsonReportV1` family). These
 * report-aggregation types are OWNED by `@ts-doctor/core`; vendored here so the
 * slice is self-contained — DE-VENDOR as a follow-up when the core Effect slice lands.
 *
 * ⚠ WIRE-COMPAT (RULE-034): `JsonReportSummary.scoreLabel` keeps the legacy WIRE
 * field name `scoreLabel`, even though the score slice's result field is `band`.
 * The builder maps `band` → this `scoreLabel` field (see buildReport.ts). Renaming
 * the wire field would break report consumers — out of scope for this slice.
 */

import { Schema } from "effect";
import { Diagnostic } from "@ts-doctor/contracts-effect";

/** The report schema version. Bump (and add a new union arm) on breaking change (RULE-034). */
export const JSON_REPORT_SCHEMA_VERSION = 1 as const;

/**
 * Aggregate counts + score carried in a report's `summary` (RULE-004, BC-23).
 *
 * Two distinct counting semantics coexist BY DESIGN and must stay separate
 * (RULE-004 flagged defect): `totalDiagnosticCount` counts OCCURRENCES, while
 * `summary.score` (computed elsewhere) reflects DISTINCT rules (RULE-001). The
 * `scoreLabel` field is the WIRE name; it carries the score slice's `band` value.
 */
export const JsonReportSummary = Schema.Struct({
  /** Occurrences with `severity === "error"`. */
  errorCount: Schema.Int,
  /** All NON-error occurrences (binary split, same as RULE-001). */
  warningCount: Schema.Int,
  /** Size of the set of DISTINCT `filePath`s across the flat diagnostic union. */
  affectedFileCount: Schema.Int,
  /** Total OCCURRENCES — NOT distinct rules (RULE-004 flagged defect). */
  totalDiagnosticCount: Schema.Int,
  /** MIN over per-project scores (RULE-003); `null` when nothing is scored. */
  score: Schema.NullOr(Schema.Int),
  /** Band label of `score` — WIRE field carrying the score slice's `band`; `null` iff `score` is null. */
  scoreLabel: Schema.NullOr(Schema.String),
  /** Logical OR of per-project partial flags. */
  scorePartial: Schema.Boolean,
});
export type JsonReportSummary = typeof JsonReportSummary.Type;

/** Per-project entry in a (possibly monorepo) report. */
export const JsonReportProjectEntry = Schema.Struct({
  directory: Schema.String,
  diagnostics: Schema.Array(Diagnostic),
  score: Schema.NullOr(Schema.Int),
  scorePartial: Schema.Boolean,
  skippedChecks: Schema.Array(Schema.String),
  elapsedMilliseconds: Schema.Number,
});
export type JsonReportProjectEntry = typeof JsonReportProjectEntry.Type;

/** A serialized error, carried when a run fails (`ok:false`). The `.cause` chain flattened root-LAST. */
export const JsonReportError = Schema.Struct({
  message: Schema.String,
  name: Schema.String,
  /** The `.cause` chain flattened to messages, ROOT-LAST. */
  chain: Schema.Array(Schema.String),
});
export type JsonReportError = typeof JsonReportError.Type;

/** Diff/staged-mode metadata (present only when `mode !== "full"`). */
export const JsonReportDiffInfo = Schema.Struct({
  baseBranch: Schema.String,
  currentBranch: Schema.NullOr(Schema.String),
  changedFileCount: Schema.Int,
  isCurrentChanges: Schema.Boolean,
});
export type JsonReportDiffInfo = typeof JsonReportDiffInfo.Type;

/** Report scan mode (RULE-033). */
export const ReportMode = Schema.Literal("full", "diff", "staged");
export type ReportMode = typeof ReportMode.Type;

/**
 * The versioned JSON report (RULE-034, BC-23). A single-arm union keyed on
 * `schemaVersion` for forward-compat; v1 is the only arm today.
 */
export const JsonReportV1 = Schema.Struct({
  schemaVersion: Schema.Literal(JSON_REPORT_SCHEMA_VERSION),
  version: Schema.String,
  ok: Schema.Boolean,
  directory: Schema.String,
  mode: ReportMode,
  diff: Schema.NullOr(JsonReportDiffInfo),
  diagnostics: Schema.Array(Diagnostic),
  summary: JsonReportSummary,
  projects: Schema.Array(JsonReportProjectEntry),
  elapsedMilliseconds: Schema.Number,
  error: Schema.NullOr(JsonReportError),
});
export type JsonReportV1 = typeof JsonReportV1.Type;
