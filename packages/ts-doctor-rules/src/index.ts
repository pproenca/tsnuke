/**
 * `@ts-doctor/rules` — the rule catalog + activation substrate, plus the
 * producer-side domain types. Downstream packages (`@ts-doctor/core`, CLI)
 * import the types via `import type` and consume the registry/predicate here.
 */

// Producer-side domain types (the cross-package contract).
export type {
  Severity,
  Tier,
  FixKind,
  TextEdit,
  Fix,
  Diagnostic,
  Capability,
  RuleMeta,
  ModuleGraph,
} from "./types.js";

// Visitor model + GRAPH-tier model.
export {
  defineRule,
  defineGraphRule,
  createRuleContext,
  createGraphRuleContext,
  PLUGIN_NAME,
} from "./define-rule.js";
export type {
  Rule,
  RuleContext,
  RuleVisitors,
  ReportInput,
  GraphRule,
  GraphRuleContext,
} from "./define-rule.js";

// Deterministic identity (BC-13).
export { diagnosticIdentity } from "./identity.js";

// Activation predicate (BC-08, BC-09).
export { shouldActivate, resolveSeverity } from "./capabilities.js";

// Codegen registry (C20) — per-file rules + GRAPH-tier rules.
export { ruleRegistry, graphRuleRegistry } from "./rule-registry.generated.js";

// Presets (projections of the registry).
export { presets, recommended, buildPreset } from "./presets.js";
export type { Preset } from "./presets.js";
