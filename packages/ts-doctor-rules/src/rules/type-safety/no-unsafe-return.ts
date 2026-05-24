import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * TYP (Tier-2, type-aware) — flag a `return` of an `any`-typed expression. Even
 * when a function declares a precise return type, returning `any` launders an
 * unchecked value past the boundary, defeating the annotation. Deciding the
 * returned expression's type needs the `ts.TypeChecker`, so the body early-returns
 * when no checker is present (Tier-1 / broken-project path) — which is why
 * `runRule` (no checker) still yields nothing.
 */
export const rule = defineRule(
  {
    id: "no-unsafe-return",
    severity: "warning",
    category: "Type Safety",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["type-safety"],
    recommendation:
      "Narrow the value to a precise type before returning it. Returning `any` launders an unchecked value past the function boundary and defeats the declared return type.",
  },
  () => ({
    [ts.SyntaxKind.ReturnStatement]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isReturnStatement(node)) return;

      const expr = node.expression;
      if (expr === undefined) return; // bare `return;` — nothing to check.

      const type = checker.getTypeAtLocation(expr);
      if ((type.flags & ts.TypeFlags.Any) === 0) return;

      const start = expr.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Unsafe return: returning an `any`-typed value.",
        help: "Narrow to a precise type before returning. Returning `any` defeats the function's declared return type.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
