/**
 * `@ts-doctor/rules-exhaustiveness-effect` — the `exhaustiveness` rule category
 * ("Exhaustiveness & Narrowing", RULE-025), a SYN/TYP-mixed rule-category slice on
 * the Effect-native substrate.
 *
 * Eight rules ported verbatim from legacy
 * `packages/ts-doctor-rules/src/rules/exhaustiveness/`:
 *
 *   SYN (3) — AST-only, driven by `runRule`:
 *     - `defaultCaseLast` — a `switch` whose `default` clause isn't last.
 *     - `noConstantCondition` — an `if`/ternary with a literal condition
 *       (`while (true)` is intentionally exempt).
 *     - `preferDiscriminatedUnion` — manual `typeof`/`instanceof` discrimination
 *       (RULE-016: the if-chain form fires ONLY on ≥2 arms where every arm is a
 *       type-test on the same first non-null discriminant — preserved verbatim).
 *
 *   TYP (5) — type-aware (require `ctx.checker`), driven by `runTypeAwareRule`:
 *     - `noForInArray` — `for...in` over an array(-like).
 *     - `noUnnecessaryBooleanLiteralCompare` — `x === true` / `x !== false`.
 *     - `noUnnecessaryCondition` — an always-truthy non-empty-object condition.
 *     - `preferNullishCoalescing` — `||` whose left operand is nullable.
 *     - `switchExhaustivenessCheck` — a non-exhaustive `switch` over a literal
 *       union. (RULE-025: FALSE-NEGATIVE-biased — bails if any union member is
 *       non-literal OR a `default` clause exists — preserved verbatim.)
 *
 * Each rule is a plain-TS `ts.SyntaxKind → visitor` map (NOT Effect-wrapped) built
 * with `defineRule` from `@ts-doctor/rules-core-effect`; the engine drives them via
 * the shared `runRule` (SYN) / `runTypeAwareRule` (TYP) walk/dispatch. The data
 * CONTRACTS (`Diagnostic`, `RuleMeta`) live in `@ts-doctor/contracts-effect` and the
 * substrate (`defineRule`, `Rule`, `RuleContext`, `runRule`, `runTypeAwareRule`) in
 * `@ts-doctor/rules-core-effect` — this slice consumes both and re-exports NOTHING it
 * does not own (barrel hygiene). See TRANSFORMATION_NOTES.md for the legacy → target
 * mapping.
 */

import type { Rule } from "@ts-doctor/rules-core-effect";

import { rule as defaultCaseLast } from "./default-case-last.js";
import { rule as noConstantCondition } from "./no-constant-condition.js";
import { rule as preferDiscriminatedUnion } from "./prefer-discriminated-union.js";
import { rule as noForInArray } from "./no-for-in-array.js";
import { rule as noUnnecessaryBooleanLiteralCompare } from "./no-unnecessary-boolean-literal-compare.js";
import { rule as noUnnecessaryCondition } from "./no-unnecessary-condition.js";
import { rule as preferNullishCoalescing } from "./prefer-nullish-coalescing.js";
import { rule as switchExhaustivenessCheck } from "./switch-exhaustiveness-check.js";

// The eight rules (3 SYN + 5 TYP), exported by stable name.
export {
  defaultCaseLast,
  noConstantCondition,
  preferDiscriminatedUnion,
  noForInArray,
  noUnnecessaryBooleanLiteralCompare,
  noUnnecessaryCondition,
  preferNullishCoalescing,
  switchExhaustivenessCheck,
};

/** The `exhaustiveness` category as a registry-ready array (codegen seam). */
export const exhaustivenessRules: ReadonlyArray<Rule> = [
  defaultCaseLast,
  noConstantCondition,
  preferDiscriminatedUnion,
  noForInArray,
  noUnnecessaryBooleanLiteralCompare,
  noUnnecessaryCondition,
  preferNullishCoalescing,
  switchExhaustivenessCheck,
];
