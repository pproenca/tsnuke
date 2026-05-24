/**
 * Public surface of the `ts-doctor` CLI package — the pure functions tests (and,
 * eventually, embedders) import. The CLI binary itself is `cli.ts`; this module
 * intentionally exports only the side-effect-free building blocks.
 */

// Flag parsing + mode validation.
export {
  parseInspectFlags,
  validateModeFlags,
  parseFileLine,
  FlagError,
} from "./flags.js";
export type {
  InspectFlags,
  FailOn,
  OutputFormat,
  FileLine,
} from "./flags.js";

// Fix application (BC-14).
export {
  applyFixes,
  applyFixesToFiles,
  groupFixesByFile,
} from "./fix-applier.js";
export type {
  ApplyResult,
  ApplyFilesResult,
  FileFixGroup,
  FileIo,
  DiagnosticWithFix,
} from "./fix-applier.js";

// Exit-code gate (BC-21).
export { shouldFailForDiagnostics, resolveExitCode } from "./exit-code.js";
export type { ExitCodeInputs } from "./exit-code.js";

// Agent-tuned output (C14).
export { formatAgentReport } from "./format-agent.js";
export type {
  AgentReport,
  AgentCategoryGroup,
  AgentRuleEntry,
  AgentOccurrence,
} from "./format-agent.js";

// Offline explain (critic m3).
export { explain, explainDiagnostic, asRuleLookup } from "./explain.js";
export type { RuleLookup, ExplainContext } from "./explain.js";

// Renderers.
export { renderPretty, renderScoreLine } from "./render.js";

// Commands (orchestration; mostly for embedding/tests).
export { runInspect, buildJsonReport, findDiagnosticAt } from "./commands/inspect.js";
export type { InspectIo, InspectRunOptions } from "./commands/inspect.js";
export {
  runInstall,
  planInstall,
  parseInstallFlags,
  buildSkillMarkdown,
} from "./commands/install.js";
export type { InstallFlags, InstallIo, PlannedWrite } from "./commands/install.js";
