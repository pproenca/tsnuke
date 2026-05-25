/**
 * `@ts-doctor/cli-effect` — public surface of the user-facing CLI, re-imagined on
 * `@effect/cli`.
 *
 * The CLI is normally invoked via the `ts-doctor` bin (`bin.ts`); this barrel exports the
 * testable building blocks so the behavioral contract can be exercised without spawning a
 * process:
 *   - the command tree (`command`, `run`) and the per-command `Command`s,
 *   - the pure flag contract + RULE-028 validation (`InspectFlags`, `validateModeFlags`,
 *     `parseFileLine`),
 *   - the inspect handler over the injectable IO seam (`runInspect`, `InspectIo`,
 *     `toDiagnoseOptions`, `buildJsonString`, `findDiagnosticAt`),
 *   - the install handler over `@effect/platform` FileSystem (`runInstall`, `planInstall`,
 *     `buildSkillMarkdown`, `InstallFlags`).
 *
 * Pure formatting/exit/score/fix logic is CONSUMED from the proven slices and is NOT
 * re-exported here (those stay owned by their slices).
 */

// ── Command tree (the `@effect/cli` entry) ──
export { command, run } from "./cli.js";
export { inspectCommand, resolveInspectFlags, VERSION } from "./inspectCommand.js";
export { installCommand } from "./installCommand.js";

// ── Pure flag contract + RULE-028 validation ──
export {
  FlagError,
  parseFileLine,
  validateModeFlags,
  type FailOn,
  type FileLine,
  type InspectFlags,
  type OutputFormat,
} from "./flags.js";

// ── Inspect handler (the `runInspect` flow over the IO seam) ──
export {
  runInspect,
  toDiagnoseOptions,
  buildJsonString,
  findDiagnosticAt,
  type InspectIo,
} from "./inspectHandler.js";

// ── Install handler (RULE-038) ──
export {
  runInstall,
  planInstall,
  buildSkillMarkdown,
  type InstallFlags,
  type PlannedWrite,
} from "./installHandler.js";
