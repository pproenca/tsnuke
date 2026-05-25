import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * TYP (Tier-2, type-aware) — flag a call whose callee is typed `any`. Calling an
 * `any`-typed value is unchecked: arguments aren't validated and the result is
 * `any`, so type errors propagate silently. Deciding the callee's type needs the
 * `ts.TypeChecker`, so the body early-returns when no checker is present (Tier-1 /
 * broken-project path) — which is why `runRule` (no checker) still yields nothing.
 */
export const rule = defineRule(
  {
    id: "no-unsafe-call",
    severity: "error",
    category: "Type Safety",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["type-safety"],
    recommendation:
      "Give the callee a precise function type before invoking it. Calling an `any`-typed value skips argument checking and yields `any`, propagating errors silently.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isCallExpression(node)) return;

      const type = checker.getTypeAtLocation(node.expression);
      if ((type.flags & ts.TypeFlags.Any) === 0) return;

      const start = node.expression.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Unsafe call: calling an `any`-typed value.",
        help: "Type the callee as a function before invoking it. Arguments go unchecked and the result is `any`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
