/**
 * `@ts-doctor/build-report-effect` — public surface of the Effect-TS report-builder slice.
 *
 * Implements RULE-004 (summary counts & rollup) and RULE-034 (schema version & `ok`).
 * A true strangler-fig slice: it CONSUMES `@ts-doctor/score-effect` for the monorepo
 * MIN score (RULE-003) and band label (RULE-002) rather than re-deriving them. See
 * TRANSFORMATION_NOTES.md for the legacy → target mapping and the `band`→`scoreLabel`
 * wire mapping.
 */

// The wire contract (effect/Schema), per Brief line 92.
export {
  JSON_REPORT_SCHEMA_VERSION,
  JsonReportV1,
  JsonReportSummary,
  JsonReportProjectEntry,
  JsonReportError,
  JsonReportDiffInfo,
  ReportMode,
} from "./Report.js";

// The diagnostic domain type — DE-VENDORED to `@ts-doctor/contracts-effect` (the local
// `Diagnostic.ts` was deleted; the canonical Schema is field-identical). Barrel keeps
// re-exporting `Diagnostic` + `Severity` as before.
export { Diagnostic, Severity } from "@ts-doctor/contracts-effect";

// The pure builder functions (NOT Effect-wrapped, per Brief line 91).
export {
  buildReport,
  type BuildReportInput,
  type BuildReportProject,
} from "./buildReport.js";
export { serializeError } from "./serializeError.js";

// Self-barrel: backs `import { BuildReport } from "@ts-doctor/build-report-effect"`
// then `BuildReport.buildReport(...)` — additive, all named exports above stay.
export * as BuildReport from "./index.js";
