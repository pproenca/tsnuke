/**
 * `@ts-doctor/rules-core-effect` — the RULE SUBSTRATE plus the AST-free `strictness`
 * rule category (RULE-020) as the first proof-of-pattern.
 *
 * This is the foundation the ~88 rule predicates and the engine plug into:
 *   - `defineRule` / `RuleContext` / `RuleVisitors` / `createRuleContext` (+ GRAPH
 *     variants) — the per-file & whole-graph rule shapes the engine drives.
 *   - `diagnosticIdentity` (BC-13) — deterministic finding identity.
 *   - `ModuleGraph` — the GRAPH-tier input, OWNED here (not in contracts).
 *   - the 4 `strictness` CFG rules (RULE-020 inverted gating) + a hand-written
 *     `ruleRegistry` (the v1 codegen seam).
 *
 * The data CONTRACTS (`Diagnostic`, `RuleMeta`, `Severity`, `Tier`, `FixKind`, `Fix`,
 * `TextEdit`, `Capability`) are NOT re-exported here — import them from
 * `@ts-doctor/contracts-effect`. This slice is the first NEW consumer of contracts and
 * deliberately does not re-publish symbols it does not own (barrel hygiene). See
 * TRANSFORMATION_NOTES.md for the legacy → target mapping.
 */

// The substrate (plain-TS wrappers of the TS compiler API — NOT Effect-wrapped).
export {
  PLUGIN_NAME,
  defineRule,
  defineGraphRule,
  createRuleContext,
  createGraphRuleContext,
} from "./defineRule.js";
export type {
  Rule,
  RuleContext,
  RuleVisitors,
  ReportInput,
  GraphRule,
  GraphRuleContext,
} from "./defineRule.js";

// Deterministic identity (BC-13).
export { diagnosticIdentity } from "./identity.js";

// The GRAPH-tier graph contract, owned by this slice.
export type { ModuleGraph } from "./ModuleGraph.js";

// The 4 AST-free strictness rules (RULE-020), exported by stable name.
export { rule as enableStrict } from "./rules/strictness/enable-strict.js";
export { rule as enableNoUncheckedIndexedAccess } from "./rules/strictness/enable-no-unchecked-indexed-access.js";
export { rule as enableExactOptionalPropertyTypes } from "./rules/strictness/enable-exact-optional-property-types.js";
export { rule as enableUseUnknownInCatch } from "./rules/strictness/enable-use-unknown-in-catch.js";

// The v1 manual rule registry (the C20 codegen seam).
export { ruleRegistry } from "./registry.js";

// The rule drivers — shared by the rule-category slices' tests and (the same logic) the
// engine. `runRule` is Tier-1 (SYN; parse/walk/dispatch); `runTypeAwareRule` is Tier-2
// (TYP; one-file `ts.Program` + checker); `runGraphRule` is the GRAPH tier (whole-graph
// `analyze` over a `ModuleGraph`).
export { runRule, runTypeAwareRule, runGraphRule } from "./runRule.js";

// Self-barrel: `import { RulesCore } from "@ts-doctor/rules-core-effect"` resolves to the
// namespace of this module (the opencode-ts module shape). Additive — the named re-exports
// above remain the canonical import surface the 14 consumers depend on.
export * as RulesCore from "./index.js";
