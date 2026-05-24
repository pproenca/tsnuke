/**
 * `@ts-doctor/api` — the programmatic API.
 *
 * A thin, stable re-export of `@ts-doctor/core`'s public boundary (AI_NATIVE_SPEC
 * §3.2 / REIMAGINED_ARCHITECTURE.md §3.4, critic m5): core already exposes the
 * exact `diagnose(dir, opts) => DiagnoseResult` surface, so this package is a
 * literal re-export rather than a re-design.
 *
 * @example
 * ```ts
 * import { diagnose } from "@ts-doctor/api";
 * const result = await diagnose("./my-project");
 * console.log(result.score, result.diagnostics.length);
 * ```
 */

export { diagnose } from "@ts-doctor/core";

export type {
  DiagnoseOptions,
  DiagnoseResult,
  ProjectInfo,
  ScoreResult,
  JsonReportV1,
  JsonReportSummary,
  TsDoctorConfig,
} from "@ts-doctor/core";

export {
  TsDoctorError,
  ProjectNotFoundError,
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
  AmbiguousProjectError,
  isTsDoctorError,
} from "@ts-doctor/core";

// Producer-side diagnostic types flow through from the engine for convenience.
export type { Diagnostic, Severity, Tier, Fix } from "@ts-doctor/rules";
