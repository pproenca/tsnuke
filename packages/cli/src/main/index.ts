/**
 * `tsnuke` — public surface of the user-facing CLI, re-imagined on
 * `@effect/cli`.
 *
 * The CLI is normally invoked via the `tsnuke` bin (`bin.ts`); this barrel exports the
 * testable building blocks so the behavioral contract can be exercised without spawning a
 * process:
 *   - the command tree (`command`, `run`) and the per-command `Command`s,
 *   - the pure flag contract + RULE-028 validation (`InspectFlags`, `validateModeFlags`,
 *     `parseFileLine`),
 *   - the inspect handler over the injectable IO seam (`runInspect`, `InspectIo`,
 *     `toDiagnoseOptions`, `buildJsonString`, `findDiagnosticAt`),
 *   - the install handler over `@effect/platform` FileSystem (`runInstall`, `planInstall`,
 *     `PRE_PUSH_HOOK`, `InstallFlags`). The skill markdown is built by the shared
 *     `buildAgentsMarkdown` (format slice) — single source of truth for `tsnuke agents`
 *     output and the on-disk `SKILL.md` written by install.
 *   - the `agents` command for the AGENTS.md discovery payload.
 *
 * Pure formatting/exit/score/fix logic is CONSUMED from the proven slices and is NOT
 * re-exported here (those stay owned by their slices).
 */

// ── Command tree (the `@effect/cli` entry) ──
export { command, run } from "./cli.js";
export { inspectCommand, resolveInspectFlags, VERSION } from "./inspectCommand.js";
export { installCommand } from "./installCommand.js";
export { agentsCommand } from "./agentsCommand.js";

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
  buildWorkspaceJsonString,
  findDiagnosticAt,
  type InspectIo,
} from "./inspectHandler.js";

// ── Install handler (RULE-038) ──
export {
  runInstall,
  planInstall,
  PRE_PUSH_HOOK,
  type InstallFlags,
  type PlannedWrite,
} from "./installHandler.js";

// ── Self-barrel: lets `import { Cli } from "tsnuke"` resolve to the
//    module namespace, while the named re-exports above stay for direct imports. ──
export * as Cli from "./index.js";
