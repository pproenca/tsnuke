/**
 * `@tsnuke/format-effect` — public surface of the output-formatter slice.
 *
 * Three groups of PURE formatters over structural inputs (NOT Effect-wrapped — pure
 * string formatting, no IO):
 *   - `formatAgentReport` (+ the `Agent*`/`TierBreakdown`/`FixSummary`/`NextAction`
 *     projection types): the `--format agent` report. Rule-deduplicated, tier-sorted,
 *     cheapest-action-first (auto-fix → codemod → manual), with `fixSummary` /
 *     `tierBreakdown` / `nextAction` headlines so an agent doesn't recompute them.
 *   - `renderScoreLine` / `renderPretty` / `renderWorkspacePretty`: human terminal
 *     output. `renderHeader` is exposed too (the workspace renderer composes it).
 *   - `asRuleLookup` / `explain` / `explainDiagnostic`: the offline `--explain` card.
 *
 * Consumes `@tsnuke/contracts-effect` for the `Diagnostic`/`RuleMeta` contracts.
 */

export {
  formatAgentReport,
  type AgentOccurrence,
  type AgentRuleEntry,
  type AgentCategoryGroup,
  type AgentReport,
  type AgentReportMeta,
  type AgentScoreInput,
  type TierStat,
  type TierBreakdown,
} from "./format-agent.js";

export {
  deriveNextAction,
  summarizeFixes,
  type FixSummary,
  type NextAction,
  type NextActionKind,
} from "./nextAction.js";

export {
  renderScoreLine,
  renderPretty,
  type RenderScoreResult,
  type RenderPrettyOptions,
} from "./render.js";

export { renderHeader, type ScoreHeaderInput } from "./renderHeader.js";

export {
  renderWorkspacePretty,
  type WorkspaceView,
  type WorkspaceProjectView,
  type RenderWorkspaceOptions,
} from "./renderWorkspace.js";

export {
  asRuleLookup,
  explain,
  explainDiagnostic,
  type RuleLookup,
  type ExplainContext,
} from "./explain.js";

// Theme helpers that external consumers need. The full palette
// (red/green/yellow/blue/magenta/cyan) stays internal to the slice.
export { bold, dim, gray, colorForScore, formatDuration } from "./theme.js";

export * as Format from "./index.js";
