/**
 * `@ts-doctor/rules-type-performance-effect` — the `type-performance` SYN rule category.
 *
 * Three pure AST predicates that plug into the `@ts-doctor/rules-core-effect` substrate
 * (`defineRule` + the per-file `SyntaxKind → visitor` shape); the engine drives them via
 * the SAME walk/dispatch as `runRule`:
 *   - {@link noLargeUnionType} (RULE-008) — `type` alias whose RHS is a union of >12 members.
 *   - {@link noLargeIntersectionType} (RULE-009) — any `IntersectionTypeNode` with >5 members.
 *   - {@link preferInterfaceForLargeObjectType} (RULE-010) — `type` alias of an object
 *     literal with >12 members; recommend an `interface`.
 *
 * The substrate (`defineRule`/`runRule`/`Rule`/`RuleContext`) is imported from
 * `@ts-doctor/rules-core-effect`; the data contracts (`Diagnostic`/`RuleMeta`) live in
 * `@ts-doctor/contracts-effect`. This slice does NOT re-export either's symbols (barrel
 * hygiene — it publishes only what it owns: the three rules + the category registry).
 * See TRANSFORMATION_NOTES.md for the legacy → target mapping.
 */

import type { Rule } from "@ts-doctor/rules-core-effect";

import { rule as noLargeUnionType } from "./no-large-union-type.js";
import { rule as noLargeIntersectionType } from "./no-large-intersection-type.js";
import { rule as preferInterfaceForLargeObjectType } from "./prefer-interface-for-large-object-type.js";

// The three rules, exported by stable name.
export {
  noLargeUnionType,
  noLargeIntersectionType,
  preferInterfaceForLargeObjectType,
};

/**
 * The `type-performance` category registry (RULE-008/009/010). The full-catalog
 * codegen (legacy `scripts/generate-rule-registry.mjs`) folds these into the global
 * `ruleRegistry`; here the list is hand-written, mirroring the v1 manual-registry seam
 * in rules-core.
 */
export const typePerformanceRules: ReadonlyArray<Rule> = [
  noLargeUnionType,
  noLargeIntersectionType,
  preferInterfaceForLargeObjectType,
];

// Self-barrel: `import { RulesTypePerformance } from "@ts-doctor/rules-type-performance-effect"`
// resolves to this module's namespace. Additive — the named exports above stay the surface.
export * as RulesTypePerformance from "./index.js";
