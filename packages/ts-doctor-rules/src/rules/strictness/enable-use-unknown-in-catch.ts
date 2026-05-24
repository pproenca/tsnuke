import { defineRule } from "../../define-rule.js";

/**
 * CFG (inverted gating, BC-09) — recommend `useUnknownInCatchVariables`.
 *
 * `disabledBy:["useUnknownInCatchVariables", "strict"]`: `strict` implies this
 * flag, so the rule self-disables under either. Fires only when catch variables
 * are still typed `any`. Project-level; no AST.
 */
export const rule = defineRule(
  {
    id: "enable-use-unknown-in-catch",
    severity: "warning",
    category: "Compiler Strictness Gaps",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["useUnknownInCatchVariables", "strict"],
    fixKind: "manual",
    tags: ["strictness", "tsconfig"],
    message:
      "tsconfig `useUnknownInCatchVariables` is off — `catch (e)` types `e` as `any`.",
    recommendation:
      'Set `"useUnknownInCatchVariables": true` (or `"strict": true`) so caught values are `unknown` and must be narrowed before use.',
  },
  () => ({}),
);
