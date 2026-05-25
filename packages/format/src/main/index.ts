/**
 * `@ts-doctor/format-effect` — public surface of the Effect-TS output-formatter slice.
 *
 * Three PURE formatters over structural inputs (NOT Effect-wrapped — pure string
 * formatting, no IO):
 *   - `formatAgentReport` (+ the `Agent*` projection types): the `--format agent`
 *     report, RULE-032 cheapest-action-first ordering (auto-fix 0 < codemod 1 <
 *     manual 2; no-fix → manual) + category grouping.
 *   - `renderScoreLine` / `renderPretty`: human terminal output. Consume the legacy
 *     structural `ScoreResult` shape `{ score; label; partial }` (the CLI maps the
 *     engine's `band` → `label`).
 *   - `asRuleLookup` / `explain` / `explainDiagnostic`: the offline `--explain` text
 *     (no model call), generic over the rule-registry `Record<string, RuleMeta>` shape.
 *
 * Consumes `@ts-doctor/contracts-effect` for the `Diagnostic`/`RuleMeta` contract.
 * It does NOT re-export any contracts symbols — those stay owned by contracts-effect.
 * See TRANSFORMATION_NOTES.md for the legacy → target mapping and deviations.
 */

export {
  formatAgentReport,
  type AgentOccurrence,
  type AgentRuleEntry,
  type AgentCategoryGroup,
  type AgentReport,
  type AgentScoreInput,
} from "./format-agent.js";

export {
  renderScoreLine,
  renderPretty,
  type RenderScoreResult,
} from "./render.js";

export {
  asRuleLookup,
  explain,
  explainDiagnostic,
  type RuleLookup,
  type ExplainContext,
} from "./explain.js";
