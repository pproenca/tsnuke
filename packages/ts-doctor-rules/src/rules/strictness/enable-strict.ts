import { defineRule } from "../../define-rule.js";

/**
 * CFG (inverted gating, BC-09) — recommend enabling tsconfig `strict`.
 *
 * This rule does NOT inspect the file AST. It is evaluated at the project level
 * by the activation predicate: `requires:["tsconfig"]` (a tsconfig exists) and
 * `disabledBy:["strict"]` (the `strict` capability token is present when the
 * flag is already ON). So it fires *only when `strict` is OFF* — and
 * self-disables the moment the goal is met. `create` is intentionally a no-op;
 * core surfaces the project-level finding from the activation decision.
 */
export const rule = defineRule(
  {
    id: "enable-strict",
    severity: "warning",
    category: "Compiler Strictness Gaps",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["strict"],
    fixKind: "manual",
    tags: ["strictness", "tsconfig"],
    message:
      "tsconfig `strict` is off — the full strict-mode check family is disabled.",
    recommendation:
      'Set `"strict": true` in tsconfig.json. It enables the full family of strict-mode checks (strictNullChecks, noImplicitAny, etc.) and is the single highest-leverage type-safety setting.',
  },
  // Project-level rule: no per-file AST work. Activation is the whole behavior.
  () => ({}),
);
