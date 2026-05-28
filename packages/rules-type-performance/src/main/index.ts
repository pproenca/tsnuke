/**
 * `@tsnuke/rules-type-performance-effect` — the `type-performance` SYN rule category.
 *
 * Two pure AST predicates that plug into the `@tsnuke/rules-core-effect` substrate
 * (`defineRule` + the per-file `SyntaxKind → visitor` shape); the engine drives them via
 * the SAME walk/dispatch as `runRule`:
 *   - {@link noLargeUnionType} (RULE-008) — `type` alias whose RHS is a union of >12 members.
 *   - {@link noLargeIntersectionType} (RULE-009) — any `IntersectionTypeNode` with >5 members.
 *
 * RETIRED (2026-05-28): `prefer-interface-for-large-object-type` (RULE-010). It was a
 * strict subset of `consistent-type-definitions` (Naming & Idioms category) — any
 * `type T = { ... }` alias is already flagged by `consistent-type-definitions` regardless
 * of member count. Stacking the two produced duplicate findings on the same `type` alias
 * with weaker (size-threshold) and stronger (always-interface) remediation text. See the
 * 2026-05-28 catalog audit. The test file and rule file are deleted; legacy `RULE-010`
 * lives on only as a historical reference in the brief.
 *
 * The substrate (`defineRule`/`runRule`/`Rule`/`RuleContext`) is imported from
 * `@tsnuke/rules-core-effect`; the data contracts (`Diagnostic`/`RuleMeta`) live in
 * `@tsnuke/contracts-effect`. This slice does NOT re-export either's symbols (barrel
 * hygiene — it publishes only what it owns: the two rules + the category registry).
 * See TRANSFORMATION_NOTES.md for the legacy → target mapping.
 */

import type { Rule } from "@tsnuke/rules-core-effect";

import { rule as noLargeUnionType } from "./no-large-union-type.js";
import { rule as noLargeIntersectionType } from "./no-large-intersection-type.js";

export {
  noLargeUnionType,
  noLargeIntersectionType,
};

/**
 * The `type-performance` category registry (RULE-008/009). The full-catalog
 * codegen (legacy `scripts/generate-rule-registry.mjs`) folds these into the global
 * `ruleRegistry`; here the list is hand-written, mirroring the v1 manual-registry seam
 * in rules-core.
 */
export const typePerformanceRules: ReadonlyArray<Rule> = [
  noLargeUnionType,
  noLargeIntersectionType,
];

// Self-barrel: `import { RulesTypePerformance } from "@tsnuke/rules-type-performance-effect"`
// resolves to this module's namespace. Additive — the named exports above stay the surface.
export * as RulesTypePerformance from "./index.js";
