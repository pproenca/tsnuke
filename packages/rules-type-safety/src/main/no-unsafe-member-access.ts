import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * TYP (Tier-2, type-aware) — flag a property/element access whose receiver is
 * typed `any`. Once a value is `any`, every member read off it is unchecked: the
 * accessed member is also `any` and the error silently propagates. Deciding the
 * receiver's type genuinely needs the `ts.TypeChecker`, so the body early-returns
 * when no checker is present (Tier-1 / broken-project path) — which is why
 * `runRule` (no checker) still yields nothing.
 */
export const rule = defineRule(
  {
    id: "no-unsafe-member-access",
    severity: "error",
    category: "Type Safety",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["type-safety"],
    recommendation:
      "Give the receiver a precise type (or `unknown`, then narrow) before accessing members. Member access on an `any`-typed value defeats the checker — the result is `any` and propagates silently.",
  },
  () => ({
    [ts.SyntaxKind.PropertyAccessExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isPropertyAccessExpression(node)) return;
      reportIfAnyReceiver(node.expression, ctx, checker);
    },
    [ts.SyntaxKind.ElementAccessExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isElementAccessExpression(node)) return;
      reportIfAnyReceiver(node.expression, ctx, checker);
    },
  }),
);

/** Report when `expression`'s type is `any`. Shared by both access forms. */
function reportIfAnyReceiver(
  expression: ts.Expression,
  ctx: RuleContext,
  checker: ts.TypeChecker,
): void {
  const type = checker.getTypeAtLocation(expression);
  if ((type.flags & ts.TypeFlags.Any) === 0) return;

  const start = expression.getStart(ctx.sourceFile);
  const { line, character } =
    ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message:
      "Unsafe member access: member access on an `any`-typed value defeats the checker.",
    help: "Type the receiver precisely (or `unknown`, then narrow). The accessed member is also `any` and propagates silently.",
    line: line + 1,
    column: character + 1,
  });
}
