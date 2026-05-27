/**
 * `@tsnuke/rules-security-effect` — the `security` rule category (RULE-025):
 * 5 SYN AST/regex predicates ported VERBATIM from the legacy catalog, plus
 * 1 SYN rule extracted from the `opencode-ts` skill catalog
 * (`no-math-random-for-id`, CWE-330).
 *
 *   - `no-eval-or-function-constructor` — `eval(...)` / `new Function(...)` (error)
 *   - `no-implied-eval`               — string-arg `setTimeout`/`setInterval` (error)
 *   - `no-insecure-url`               — hard-coded `http://` literals, loopback exempt (warning)
 *   - `no-math-random-for-id`         — `Math.random().toString(36|16)` (CWE-330, warning)
 *   - `no-new-buffer`                 — `new Buffer(...)` (error)
 *   - `no-secrets-in-source`          — vendor-anchored AWS/GitHub/Stripe key shapes (error)
 *
 * Per RULE-025 this category is vendor-anchored regex scanning ONLY — no entropy
 * heuristic. The credential regexes in `no-secrets-in-source` are FROZEN
 * (vendor-anchored prefixes + fixed token lengths) and kept byte-for-byte.
 *
 * The substrate (`defineRule`/`runRule`/`Rule`/`RuleContext`) is consumed from
 * `@tsnuke/rules-core-effect`; the data contracts (`Diagnostic`/`RuleMeta`) from
 * `@tsnuke/contracts-effect`. This barrel does NOT re-export those upstream
 * symbols — import them from their owning packages (barrel hygiene).
 */

import type { Rule } from "@tsnuke/rules-core-effect";

import { rule as noEvalOrFunctionConstructor } from "./no-eval-or-function-constructor.js";
import { rule as noImpliedEval } from "./no-implied-eval.js";
import { rule as noInsecureUrl } from "./no-insecure-url.js";
import { rule as noMathRandomForId } from "./no-math-random-for-id.js";
import { rule as noNewBuffer } from "./no-new-buffer.js";
import { rule as noSecretsInSource } from "./no-secrets-in-source.js";

// Each rule by stable name (the legacy per-file `rule` export, aliased).
export {
  noEvalOrFunctionConstructor,
  noImpliedEval,
  noInsecureUrl,
  noMathRandomForId,
  noNewBuffer,
  noSecretsInSource,
};

/**
 * The 6 `security` rules as a registry slice. Order mirrors the legacy codegen's
 * alphabetical-by-file ordering (the same convention `rules-core`'s `ruleRegistry`
 * uses) so it concatenates cleanly when the full catalog registry lands.
 */
export const securityRules: ReadonlyArray<Rule> = [
  noEvalOrFunctionConstructor,
  noImpliedEval,
  noInsecureUrl,
  noMathRandomForId,
  noNewBuffer,
  noSecretsInSource,
];

// Self-barrel: `import { RulesSecurity } from "@tsnuke/rules-security-effect"`
// resolves to this module's namespace. Additive — the named exports above stay the surface.
export * as RulesSecurity from "./index.js";
