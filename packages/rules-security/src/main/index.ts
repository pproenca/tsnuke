/**
 * `@ts-doctor/rules-security-effect` — the `security` rule category (RULE-025):
 * 5 SYN AST/regex predicates ported VERBATIM from the legacy catalog.
 *
 *   - `no-eval-or-function-constructor` — `eval(...)` / `new Function(...)` (error)
 *   - `no-implied-eval`               — string-arg `setTimeout`/`setInterval` (error)
 *   - `no-insecure-url`               — hard-coded `http://` literals, loopback exempt (warning)
 *   - `no-new-buffer`                 — `new Buffer(...)` (error)
 *   - `no-secrets-in-source`          — vendor-anchored AWS/GitHub/Stripe key shapes (error)
 *
 * Per RULE-025 this category is vendor-anchored regex scanning ONLY — no entropy
 * heuristic. The credential regexes in `no-secrets-in-source` are FROZEN
 * (vendor-anchored prefixes + fixed token lengths) and kept byte-for-byte.
 *
 * The substrate (`defineRule`/`runRule`/`Rule`/`RuleContext`) is consumed from
 * `@ts-doctor/rules-core-effect`; the data contracts (`Diagnostic`/`RuleMeta`) from
 * `@ts-doctor/contracts-effect`. This barrel does NOT re-export those upstream
 * symbols — import them from their owning packages (barrel hygiene).
 */

import type { Rule } from "@ts-doctor/rules-core-effect";

import { rule as noEvalOrFunctionConstructor } from "./no-eval-or-function-constructor.js";
import { rule as noImpliedEval } from "./no-implied-eval.js";
import { rule as noInsecureUrl } from "./no-insecure-url.js";
import { rule as noNewBuffer } from "./no-new-buffer.js";
import { rule as noSecretsInSource } from "./no-secrets-in-source.js";

// Each rule by stable name (the legacy per-file `rule` export, aliased).
export {
  noEvalOrFunctionConstructor,
  noImpliedEval,
  noInsecureUrl,
  noNewBuffer,
  noSecretsInSource,
};

/**
 * The 5 `security` rules as a registry slice. Order mirrors the legacy codegen's
 * alphabetical-by-file ordering (the same convention `rules-core`'s `ruleRegistry`
 * uses) so it concatenates cleanly when the full catalog registry lands.
 */
export const securityRules: ReadonlyArray<Rule> = [
  noEvalOrFunctionConstructor,
  noImpliedEval,
  noInsecureUrl,
  noNewBuffer,
  noSecretsInSource,
];
