/**
 * `@ts-fix/rules-type-safety-effect` — the `type-safety` rule category
 * (RULE-006 + the RULE-025 type-safety row, "Type Safety"): 12 plain-TS predicates
 * ported verbatim from the legacy
 * `packages/ts-fix-rules/src/rules/type-safety/**`.
 *
 *   - 6 SYN (syntactic, AST-only — the engine drives them via `runRule`):
 *     `any-density-budget` (RULE-006, fires once per file when the `AnyKeyword`
 *     count exceeds the exclusive threshold of 5), `no-explicit-any`,
 *     `no-record-string-unknown`, `no-unknown-return`, `no-wrapper-object-types`,
 *     `prefer-type-guard-predicate`.
 *   - 6 TYP (type-aware — the `no-unsafe-*` family + the two unnecessary-guard
 *     rules, each early-returns when `ctx.checker` is absent; the engine drives
 *     them via `runTypeAwareRule`, which supplies a live `ts.TypeChecker`):
 *     `no-unnecessary-instanceof`, `no-unnecessary-typeof`, `no-unsafe-argument`,
 *     `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`.
 *
 * Each rule is a pure `SyntaxKind → visitor` map plugging into the rule substrate
 * (`defineRule` / `RuleContext` / `runRule` / `runTypeAwareRule`) from
 * `@ts-fix/rules-core-effect`. The data CONTRACTS (`Diagnostic`, `RuleMeta`,
 * `Rule`) live in `@ts-fix/contracts-effect` / `@ts-fix/rules-core-effect`
 * and are NOT re-exported here (barrel hygiene — this slice does not re-publish
 * symbols it does not own).
 *
 * `any-density-budget` scans the whole file via a `SourceFile`-keyed visitor
 * (`runRule` fires it once for the file) and reports a single diagnostic at the
 * file start. That mechanism is ported verbatim.
 *
 * Equivalence proof = the ported legacy test vectors in `src/test/**` (every
 * legacy case carried over, plus any-density boundary cases and no-unsafe-*
 * negatives, and each TYP rule proven inert under `runRule`).
 */

import type { Rule } from "@ts-fix/rules-core-effect";

import { rule as anyDensityBudget } from "./any-density-budget.js";
import { rule as noExplicitAny } from "./no-explicit-any.js";
import { rule as noRecordStringUnknown } from "./no-record-string-unknown.js";
import { rule as noUnknownReturn } from "./no-unknown-return.js";
import { rule as noUnnecessaryInstanceof } from "./no-unnecessary-instanceof.js";
import { rule as noUnnecessaryTypeof } from "./no-unnecessary-typeof.js";
import { rule as noUnsafeArgument } from "./no-unsafe-argument.js";
import { rule as noUnsafeCall } from "./no-unsafe-call.js";
import { rule as noUnsafeMemberAccess } from "./no-unsafe-member-access.js";
import { rule as noUnsafeReturn } from "./no-unsafe-return.js";
import { rule as noWrapperObjectTypes } from "./no-wrapper-object-types.js";
import { rule as preferTypeGuardPredicate } from "./prefer-type-guard-predicate.js";

// Each rule exported by stable name.
export {
  anyDensityBudget,
  noExplicitAny,
  noRecordStringUnknown,
  noUnknownReturn,
  noUnnecessaryInstanceof,
  noUnnecessaryTypeof,
  noUnsafeArgument,
  noUnsafeCall,
  noUnsafeMemberAccess,
  noUnsafeReturn,
  noWrapperObjectTypes,
  preferTypeGuardPredicate,
};

/**
 * The 12 `type-safety` rules, in id order — the category bundle the engine
 * registers. 6 SYN (driven via `runRule`) + 6 TYP (the `no-unsafe-*` family +
 * the unnecessary-guard rules, driven via `runTypeAwareRule`).
 */
export const typeSafetyRules: ReadonlyArray<Rule> = [
  anyDensityBudget,
  noExplicitAny,
  noRecordStringUnknown,
  noUnknownReturn,
  noUnnecessaryInstanceof,
  noUnnecessaryTypeof,
  noUnsafeArgument,
  noUnsafeCall,
  noUnsafeMemberAccess,
  noUnsafeReturn,
  noWrapperObjectTypes,
  preferTypeGuardPredicate,
];

// Self-barrel: `import { RulesTypeSafety } from "@ts-fix/rules-type-safety-effect"`
// resolves to this module's namespace. Additive — the named exports above stay stable.
export * as RulesTypeSafety from "./index.js";
