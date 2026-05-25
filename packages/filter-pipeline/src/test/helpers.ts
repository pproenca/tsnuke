/**
 * Shared test helpers for the filter-pipeline characterization suite.
 *
 * `diag(...)` mirrors the legacy test's `diag()` (legacy
 * `packages/core/src/filter-pipeline.test.ts:9-25`): a fully-formed
 * `DiagnosticWithTags` with sensible defaults, overridable per case. Only the
 * fields the pipeline reads (`tags`, `plugin`, `rule`, `severity`, `category`,
 * `filePath`, `line`) usually matter; the rest are realistic filler so the
 * emitted public `Diagnostic` is a faithful shape.
 */

import type { DiagnosticWithTags } from "../main/index.js";

export function diag(
  over: Partial<DiagnosticWithTags> & Pick<DiagnosticWithTags, "rule">,
): DiagnosticWithTags {
  return {
    filePath: over.filePath ?? "/x/a.ts",
    plugin: "ts-doctor",
    severity: "error",
    message: "m",
    help: "h",
    line: over.line ?? 1,
    column: 1,
    category: "Type Safety",
    tier: "SYN",
    ...over,
  };
}
