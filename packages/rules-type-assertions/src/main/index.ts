/**
 * `@ts-doctor/rules-type-assertions-effect` — the `type-assertions` rule category
 * (RULE-025, "Type Assertions & Escapes"): 13 plain-TS predicates ported verbatim
 * from the legacy `packages/ts-doctor-rules/src/rules/type-assertions/**`.
 *
 *   - 12 SYN (syntactic, AST/comment-only — the engine drives them via `runRule`).
 *   - 1 TYP (type-aware: `no-unnecessary-non-null-assertion`, which early-returns
 *     when `ctx.checker` is absent — the engine drives it via `runTypeAwareRule`,
 *     which supplies a live `ts.TypeChecker`).
 *
 * Each rule is a pure `SyntaxKind → visitor` map plugging into the rule substrate
 * (`defineRule` / `RuleContext` / `runRule` / `runTypeAwareRule`) from
 * `@ts-doctor/rules-core-effect`. The data CONTRACTS (`Diagnostic`, `RuleMeta`,
 * `Rule`) live in `@ts-doctor/contracts-effect` / `@ts-doctor/rules-core-effect`
 * and are NOT re-exported here (barrel hygiene — this slice does not re-publish
 * symbols it does not own).
 *
 * Three comment-directive rules — `no-ts-ignore`, `no-ts-nocheck`,
 * `ts-expect-error-requires-description` — scan the SourceFile's full text via a
 * `SourceFile`-keyed visitor (comments are trivia, not nodes). That mechanism is
 * ported verbatim; `runRule` fires the SourceFile visitor once for the whole file.
 *
 * Equivalence proof = the ported legacy test vectors in `src/test/**` (every
 * legacy case carried over, plus negatives and comment-rule edges).
 */

import type { Rule } from "@ts-doctor/rules-core-effect";

import { rule as noAngleBracketAssertion } from "./no-angle-bracket-assertion.js";
import { rule as noAssertionOnJsonParse } from "./no-assertion-on-json-parse.js";
import { rule as noCastAfterGuard } from "./no-cast-after-guard.js";
import { rule as noCastInReturn } from "./no-cast-in-return.js";
import { rule as noDoubleAssertion } from "./no-double-assertion.js";
import { rule as noNonNullAssertedOptionalChain } from "./no-non-null-asserted-optional-chain.js";
import { rule as noNonNullAssertion } from "./no-non-null-assertion.js";
import { rule as noTsIgnore } from "./no-ts-ignore.js";
import { rule as noTsNocheck } from "./no-ts-nocheck.js";
import { rule as noUnnecessaryNonNullAssertion } from "./no-unnecessary-non-null-assertion.js";
import { rule as noUnsafeObjectAssertion } from "./no-unsafe-object-assertion.js";
import { rule as preferSatisfiesOverAs } from "./prefer-satisfies-over-as.js";
import { rule as tsExpectErrorRequiresDescription } from "./ts-expect-error-requires-description.js";

// Each rule exported by stable name.
export {
  noAngleBracketAssertion,
  noAssertionOnJsonParse,
  noCastAfterGuard,
  noCastInReturn,
  noDoubleAssertion,
  noNonNullAssertedOptionalChain,
  noNonNullAssertion,
  noTsIgnore,
  noTsNocheck,
  noUnnecessaryNonNullAssertion,
  noUnsafeObjectAssertion,
  preferSatisfiesOverAs,
  tsExpectErrorRequiresDescription,
};

/**
 * The 13 `type-assertions` rules, in id order — the category bundle the engine
 * registers. 12 SYN (driven via `runRule`) + 1 TYP (`no-unnecessary-non-null-assertion`,
 * driven via `runTypeAwareRule`).
 */
export const typeAssertionsRules: ReadonlyArray<Rule> = [
  noAngleBracketAssertion,
  noAssertionOnJsonParse,
  noCastAfterGuard,
  noCastInReturn,
  noDoubleAssertion,
  noNonNullAssertedOptionalChain,
  noNonNullAssertion,
  noTsIgnore,
  noTsNocheck,
  noUnnecessaryNonNullAssertion,
  noUnsafeObjectAssertion,
  preferSatisfiesOverAs,
  tsExpectErrorRequiresDescription,
];
