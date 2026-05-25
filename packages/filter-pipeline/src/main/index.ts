/**
 * `@ts-doctor/filter-pipeline-effect` — public surface of the Effect-TS
 * filter-pipeline slice.
 *
 * Implements RULE-023 (four-stage diagnostic filter), RULE-040 (config severity
 * vocabulary & precedence, consolidated to a single canonical vocabulary — D1), and
 * the relevant part of RULE-024's vocab (`warn`→`warning`). See TRANSFORMATION_NOTES.md
 * for the legacy → target mapping and deviations.
 *
 * The pipeline + stages are plain synchronous pure functions (Brief lines 25/91);
 * the Effect ecosystem appears only in the `Diagnostic`/`Config` Schema contracts.
 */

// Contract layer (effect/Schema). `Diagnostic`/`Severity` are DE-VENDORED — re-exported
// from `@ts-doctor/contracts-effect` via `./Diagnostic.js` (the canonical Schemas).
// `Fix`/`TextEdit`/`Tier`/`FixKind` are available from contracts but NOT re-exported here
// (this slice keeps its narrow public surface). `DiagnosticWithTags` stays LOCAL — the
// engine-only input carry, now a type-only `interface` extending the canonical
// `Diagnostic`, so it is re-exported as a type.
export { Diagnostic, Severity } from "./Diagnostic.js";
export type { DiagnosticWithTags } from "./Diagnostic.js";
export { ConfigSeverity, TsDoctorConfig } from "./Config.js";

// Stage functions + helpers (RULE-023 / RULE-040). Exported so each stage can be
// characterized in isolation and reused; the orchestrator wires them in fixed order.
export {
  AUTO_SUPPRESS_TAGS,
  normalizeConfigSeverity,
  stageAutoSuppress,
  makeSeverityStage,
  makeIgnoreStage,
  makeInlineDisableStage,
  fileMatches,
  parseInlineDisables,
  type SourceTextMap,
  type Stage,
  type InlineDirective,
} from "./stages.js";

// The orchestrator — the public entry point (RULE-023, BC-11).
export { runFilterPipeline, type FilterPipelineOptions } from "./runFilterPipeline.js";

// Self-barrel: opt-in namespace import (`import { FilterPipeline } from "..."`). ADDITIVE —
// the named re-exports above remain the byte-stable surface every consumer imports from.
export * as FilterPipeline from "./index.js";
