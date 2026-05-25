/**
 * The rule registry — the v1 MANUAL seam.
 *
 * Legacy assembles this list by CODEGEN: `scripts/generate-rule-registry.mjs` scans
 * every `defineRule(`/`defineGraphRule(` call site under `rules/` and emits
 * `rule-registry.generated.ts`. In this first substrate slice only the 4 AST-free
 * `strictness` rules exist (RULE-020), so the registry is a hand-written list. When
 * the full ~88-rule catalog lands the codegen REPLACES this manual list (see
 * TRANSFORMATION_NOTES Follow-ups) — this file is the intentional v1 seam, with the
 * same `ReadonlyArray<Rule>` shape the codegen output will have.
 *
 * The four strictness rules are imported by their stable `rule` export (the legacy
 * per-file convention) and aliased for readability — matching the codegen's
 * `import { rule as enableStrictRule } from "./rules/strictness/enable-strict.js"`.
 */

import type { Rule } from "./defineRule.js";
import { rule as enableExactOptionalPropertyTypesRule } from "./rules/strictness/enable-exact-optional-property-types.js";
import { rule as enableNoUncheckedIndexedAccessRule } from "./rules/strictness/enable-no-unchecked-indexed-access.js";
import { rule as enableStrictRule } from "./rules/strictness/enable-strict.js";
import { rule as enableUseUnknownInCatchRule } from "./rules/strictness/enable-use-unknown-in-catch.js";

/**
 * Per-file (SYN/TYP/CFG) rules. In v1 this is the 4 strictness CFG rules only;
 * order mirrors the legacy codegen's alphabetical-by-file ordering.
 */
export const ruleRegistry: ReadonlyArray<Rule> = [
  enableExactOptionalPropertyTypesRule,
  enableNoUncheckedIndexedAccessRule,
  enableStrictRule,
  enableUseUnknownInCatchRule,
];
