/**
 * `@ts-doctor/rules-generics-effect` — the `generics` ("Generics & Type-Level
 * Complexity") rule category: 4 SYN + 1 TYP.
 *
 * Five predicates that plug into the `@ts-doctor/rules-core-effect` substrate
 * (`defineRule` + the per-file `SyntaxKind → visitor` shape). The engine drives the
 * SYN rules via the SAME walk/dispatch as `runRule`, and the single TYP rule via the
 * checker-carrying `runTypeAwareRule` path:
 *   - {@link genericNameConvention} (SYN) — type-parameter name not PascalCase.
 *   - {@link genericParamCountBudget} (SYN, RULE-007) — declaration with > 4 type
 *     parameters (exclusive budget); only the 5 named declaration kinds, not arrows /
 *     function expressions.
 *   - {@link noGenericWithDefaultAny} (SYN) — type-parameter default of `any`
 *     (`<T = any>`).
 *   - {@link noUnnecessaryTypeConstraint} (SYN) — no-op `extends any` / `extends unknown`.
 *   - {@link preferGenericOverAnyPassthrough} (TYP, requires `typecheck:ok`) — an
 *     `any` parameter that flows to an `any` return; uses `ctx.checker`.
 *
 * The substrate (`defineRule`/`runRule`/`runTypeAwareRule`/`Rule`/`RuleContext`) is
 * imported from `@ts-doctor/rules-core-effect`; the data contracts
 * (`Diagnostic`/`RuleMeta`) live in `@ts-doctor/contracts-effect`. This slice does NOT
 * re-export either's symbols (barrel hygiene — it publishes only what it owns: the five
 * rules + the category registry). See TRANSFORMATION_NOTES.md for the legacy → target
 * mapping.
 */

import type { Rule } from "@ts-doctor/rules-core-effect";

import { rule as genericNameConvention } from "./generic-name-convention.js";
import { rule as genericParamCountBudget } from "./generic-param-count-budget.js";
import { rule as noGenericWithDefaultAny } from "./no-generic-with-default-any.js";
import { rule as noUnnecessaryTypeConstraint } from "./no-unnecessary-type-constraint.js";
import { rule as preferGenericOverAnyPassthrough } from "./prefer-generic-over-any-passthrough.js";

// The five rules, exported by stable name.
export {
  genericNameConvention,
  genericParamCountBudget,
  noGenericWithDefaultAny,
  noUnnecessaryTypeConstraint,
  preferGenericOverAnyPassthrough,
};

/**
 * The `generics` category registry (4 SYN + 1 TYP). The full-catalog codegen
 * (legacy `scripts/generate-rule-registry.mjs`) folds these into the global
 * `ruleRegistry`; here the list is hand-written, mirroring the v1 manual-registry seam
 * in rules-core.
 */
export const genericsRules: ReadonlyArray<Rule> = [
  genericNameConvention,
  genericParamCountBudget,
  noGenericWithDefaultAny,
  noUnnecessaryTypeConstraint,
  preferGenericOverAnyPassthrough,
];
