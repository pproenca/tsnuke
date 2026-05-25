import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag a double assertion `x as A as B` (commonly `x as unknown as T` or
 * `x as any as T`), which fully launders the type past the checker.
 */
export const rule = defineRule(
  {
    id: "no-double-assertion",
    severity: "error",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["escape-hatch"],
    recommendation:
      "A double assertion defeats type-checking entirely. Narrow the value, fix the source type, or use a single, justified assertion.",
  },
  () => ({
    [ts.SyntaxKind.AsExpression]: (node, ctx) => {
      if (!ts.isAsExpression(node)) return;
      // Unwrap parentheses to find the inner expression of the outer assertion.
      let inner: ts.Expression = node.expression;
      while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
      if (!ts.isAsExpression(inner)) return; // not a chained assertion.

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Double type assertion launders the type past the checker.",
        help: "Avoid `x as A as B`. Narrow the value or fix the underlying type instead.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
