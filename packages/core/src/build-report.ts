/**
 * Versioned JSON report builder (C9, BC-23, BC-05).
 *
 * Produces a {@link JsonReportV1} with `schemaVersion:1` inside a forward-compat
 * single-arm union. The summary carries counts + score + label + `scorePartial`;
 * for a monorepo the summary score is the MIN over per-project scores (worst
 * project represents the whole — BC-05) and `scorePartial` is true if ANY project
 * is partial.
 *
 * See AI_NATIVE_SPEC.md §3.3 (BC-23) and REIMAGINED_ARCHITECTURE.md §4.3 (BC-05).
 */

import type { Diagnostic } from "@ts-doctor/rules";
import { scoreLabel, summarizeMonorepoScore } from "./score.js";
import type {
  JsonReportDiffInfo,
  JsonReportError,
  JsonReportProjectEntry,
  JsonReportSummary,
  JsonReportV1,
} from "./types.js";

/** The report schema version. Bump (and add a new union arm) on breaking change. */
export const JSON_REPORT_SCHEMA_VERSION = 1 as const;

/** Per-project input the report builder aggregates. */
export interface BuildReportProject {
  directory: string;
  diagnostics: Diagnostic[];
  score: number | null;
  scorePartial: boolean;
  skippedChecks: string[];
  elapsedMilliseconds: number;
}

/** Inputs to {@link buildReport}. */
export interface BuildReportInput {
  version: string;
  directory: string;
  mode: "full" | "diff" | "staged";
  /** Diff/staged metadata; `null`/omitted in full mode. */
  diff?: JsonReportDiffInfo | null;
  projects: BuildReportProject[];
  elapsedMilliseconds: number;
  /** When set, the run failed; `ok` becomes false. */
  error?: JsonReportError | null;
}

/** Flatten an error and its `.cause` chain to messages, root-last. */
export function serializeError(err: unknown): JsonReportError {
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

function summarize(
  allDiagnostics: readonly Diagnostic[],
  summaryScore: number | null,
  summaryPartial: boolean,
): JsonReportSummary {
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
    scoreLabel: summaryScore !== null ? scoreLabel(summaryScore) : null,
    scorePartial: summaryPartial,
  };
}

/**
 * Build the versioned report (BC-23). The top-level `diagnostics` is the flat
 * union of every project's diagnostics; `summary.score` is the MIN over scored
 * projects (BC-05); `summary.scorePartial` is true if any project is partial.
 * `ok` is false when an `error` is supplied.
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

  const allDiagnostics = input.projects.flatMap((p) => p.diagnostics);
  const summaryScore = summarizeMonorepoScore(
    input.projects.map((p) => p.score),
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
