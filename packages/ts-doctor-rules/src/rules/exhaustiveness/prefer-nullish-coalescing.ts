import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * TYP (Tier-2, type-aware) — flag `a || b` whose LEFT operand can be
 * `null`/`undefined`. With `||` the fallback fires for ALL falsy values
 * (`""`, `0`, `false`, `NaN`, …), not just nullish ones — usually a bug when
 * the intent is "use `b` only when `a` is absent". `??` (nullish coalescing)
 * triggers solely on `null`/`undefined`.
 *
 * Registered with `tier:"TYP"` and `requires:["typecheck:ok"]`; activates only
 * under a clean type-check (BC-10). Deciding nullability needs the
 * `ts.TypeChecker`, so the body early-returns without one (Tier-1 / broken-
 * project path) — which is why `runRule` (no checker) yields nothing.
 */

/** True iff `type` (or any union constituent) is `null` or `undefined`. */
function isNullable(type: ts.Type): boolean {
  const constituents = type.isUnion() ? type.types : [type];
  const nullish = ts.TypeFlags.Null | ts.TypeFlags.Undefined;
  for (const c of constituents) {
    if ((c.flags & nullish) !== 0) return true;
  }
  return false;
}

export const rule = defineRule(
  {
    id: "prefer-nullish-coalescing",
    severity: "warning",
    category: "Exhaustiveness & Narrowing",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["exhaustiveness", "correctness"],
    recommendation:
      "Use `??` instead of `||` so the fallback only applies to `null`/`undefined`, not to every falsy value (`\"\"`, `0`, `false`).",
  },
  () => ({
    [ts.SyntaxKind.BinaryExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isBinaryExpression(node)) return;
      if (node.operatorToken.kind !== ts.SyntaxKind.BarBarToken) return;

      const leftType = checker.getTypeAtLocation(node.left);
      if (!isNullable(leftType)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Prefer `??` over `||`: the left operand is nullable, so `||` would also fall back on other falsy values.",
        help: "Replace `||` with `??` so only `null`/`undefined` trigger the fallback.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
