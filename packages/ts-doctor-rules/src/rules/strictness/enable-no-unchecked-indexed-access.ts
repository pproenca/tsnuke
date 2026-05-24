import { defineRule } from "../../define-rule.js";

/**
 * CFG (inverted gating, BC-09) — recommend enabling `noUncheckedIndexedAccess`.
 *
 * The canonical inverted-gating example. `requires:["tsconfig"]` and
 * `disabledBy:["noUncheckedIndexedAccess"]`: the token is present only when the
 * flag is already ON, so the rule fires *only when the flag is OFF* (token
 * absent) and self-disables once it is enabled. No file AST inspection.
 */
export const rule = defineRule(
  {
    id: "enable-no-unchecked-indexed-access",
    severity: "warning",
    category: "Compiler Strictness Gaps",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["noUncheckedIndexedAccess"],
    fixKind: "manual",
    tags: ["strictness", "tsconfig"],
    message:
      "tsconfig `noUncheckedIndexedAccess` is off — indexed access is not typed as possibly `undefined`.",
    recommendation:
      'Set `"noUncheckedIndexedAccess": true` in tsconfig.json so indexed access (e.g. `arr[i]`, `record[key]`) is typed as possibly `undefined`, surfacing a large class of runtime errors at compile time.',
  },
  // Project-level rule: no per-file AST work. Activation is the whole behavior.
  () => ({}),
);
