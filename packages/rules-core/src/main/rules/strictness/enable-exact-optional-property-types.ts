import { defineRule } from "../../defineRule.js";

/**
 * CFG (inverted gating, RULE-020) — recommend enabling `exactOptionalPropertyTypes`.
 *
 * `requires:["tsconfig"]`, `disabledBy:["exactOptionalPropertyTypes"]`: fires
 * only when the flag is OFF, self-disables once enabled. Project-level; no AST.
 */
export const rule = defineRule(
  {
    id: "enable-exact-optional-property-types",
    severity: "warning",
    category: "Compiler Strictness Gaps",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["exactOptionalPropertyTypes"],
    fixKind: "manual",
    tags: ["strictness", "tsconfig"],
    message:
      "tsconfig `exactOptionalPropertyTypes` is off — `{ x?: T }` silently accepts `undefined` writes.",
    recommendation:
      'Set `"exactOptionalPropertyTypes": true` so an optional property `x?: T` is not implicitly `T | undefined`; an explicit `undefined` must then be opted into.',
  },
  () => ({}),
);
