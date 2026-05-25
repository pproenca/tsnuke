/**
 * `@ts-fix/rules-error-handling-effect` — the `error-handling` rule category
 * (RULE-025), the FIRST rule-category slice on the Effect-native substrate to mix
 * SYN and TYP (type-aware) tiers.
 *
 * Eight rules ported verbatim from legacy
 * `packages/ts-fix-rules/src/rules/error-handling/`:
 *
 *   SYN (6) — AST-only, driven by `runRule`:
 *     - `noEmptyCatch` — a `catch {}` that silently swallows the error.
 *     - `noErrorMessageMatching` — classifying an error by matching its message string.
 *     - `noExAssign` — reassigning the caught exception binding inside `catch`.
 *     - `noThrowInFinally` — `throw`/`return` inside a `finally` block.
 *     - `noUselessCatch` — a `catch` that only rethrows the caught value.
 *     - `preferErrorInstantiation` — calling an error constructor without `new`.
 *       (RULE-026: declares `fixKind: "auto-fix"` but emits NO `fix` payload —
 *       preserved verbatim. RULE-017: the `*Error` name heuristic — preserved verbatim.)
 *
 *   TYP (2) — type-aware (require `ctx.checker`), driven by `runTypeAwareRule`:
 *     - `onlyThrowError` — throwing a non-Error primitive value.
 *     - `preferPromiseRejectErrors` — `Promise.reject` with a primitive, not an Error.
 *
 * Each rule is a plain-TS `ts.SyntaxKind → visitor` map (NOT Effect-wrapped) built
 * with `defineRule` from `@ts-fix/rules-core-effect`; the engine drives them via
 * the shared `runRule` (SYN) / `runTypeAwareRule` (TYP) walk/dispatch. The data
 * CONTRACTS (`Diagnostic`, `RuleMeta`) live in `@ts-fix/contracts-effect` and the
 * substrate (`defineRule`, `Rule`, `RuleContext`, `runRule`, `runTypeAwareRule`) in
 * `@ts-fix/rules-core-effect` — this slice consumes both and re-exports NOTHING it
 * does not own (barrel hygiene). See TRANSFORMATION_NOTES.md for the legacy → target
 * mapping.
 */

import type { Rule } from "@ts-fix/rules-core-effect";

import { rule as noEmptyCatch } from "./no-empty-catch.js";
import { rule as noErrorMessageMatching } from "./no-error-message-matching.js";
import { rule as noExAssign } from "./no-ex-assign.js";
import { rule as noThrowInFinally } from "./no-throw-in-finally.js";
import { rule as noUselessCatch } from "./no-useless-catch.js";
import { rule as preferErrorInstantiation } from "./prefer-error-instantiation.js";
import { rule as onlyThrowError } from "./only-throw-error.js";
import { rule as preferPromiseRejectErrors } from "./prefer-promise-reject-errors.js";

// The eight rules (6 SYN + 2 TYP), exported by stable name.
export {
  noEmptyCatch,
  noErrorMessageMatching,
  noExAssign,
  noThrowInFinally,
  noUselessCatch,
  preferErrorInstantiation,
  onlyThrowError,
  preferPromiseRejectErrors,
};

/** The `error-handling` category as a registry-ready array (codegen seam). */
export const errorHandlingRules: ReadonlyArray<Rule> = [
  noEmptyCatch,
  noErrorMessageMatching,
  noExAssign,
  noThrowInFinally,
  noUselessCatch,
  preferErrorInstantiation,
  onlyThrowError,
  preferPromiseRejectErrors,
];

// Self-barrel: makes `import { RulesErrorHandling } from
// "@ts-fix/rules-error-handling-effect"` resolve to this module's namespace
// (additive — the named exports above stay byte-stable).
export * as RulesErrorHandling from ".";
