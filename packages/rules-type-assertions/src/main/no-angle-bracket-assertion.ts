import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the angle-bracket cast form `<T>x` and prefer `x as T`.
 *
 * Angle-bracket casts are ambiguous with JSX (a `.tsx` file can't use them), so
 * the `as` form is the portable, idiomatic choice across the whole codebase.
 */
export const rule = defineRule(
  {
    id: "no-angle-bracket-assertion",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["idioms"],
    recommendation:
      "Use the `x as T` assertion form instead of `<T>x`; angle-bracket casts clash with JSX and aren't usable in `.tsx` files.",
  },
  () => ({
    [ts.SyntaxKind.TypeAssertionExpression]: (node, ctx) => {
      if (!ts.isTypeAssertionExpression(node)) return;
      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Prefer `x as T`; angle-bracket casts clash with JSX.",
        help: "Rewrite `<T>x` as `x as T`. Angle-bracket casts aren't usable in `.tsx` files.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
