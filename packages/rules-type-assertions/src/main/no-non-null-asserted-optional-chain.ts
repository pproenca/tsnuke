import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag a non-null assertion applied to the result of an optional chain
 * (`a?.b!`). The `?.` exists precisely so the expression yields `undefined` when
 * a link is nullish; slapping `!` on the result asserts that `undefined` away,
 * re-introducing the exact crash the chain was written to prevent. Purely
 * syntactic (no checker needed): we unwrap parentheses and look for a `?.` on the
 * asserted expression.
 */
export const rule = defineRule(
  {
    id: "no-non-null-asserted-optional-chain",
    severity: "error",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["escape-hatch", "correctness"],
    recommendation:
      "Drop the `!` after an optional chain. `a?.b!` asserts away the `undefined` the `?.` deliberately produces, re-introducing the nullish crash the chain guards against.",
  },
  (ctx) => ({
    [ts.SyntaxKind.NonNullExpression]: (node) => {
      if (!ts.isNonNullExpression(node)) return;

      // Unwrap parentheses so `(a?.b)!` is caught as well as `a?.b!`.
      let inner: ts.Expression = node.expression;
      while (ts.isParenthesizedExpression(inner)) {
        inner = inner.expression;
      }

      const isOptionalChainLink =
        (ts.isPropertyAccessExpression(inner) ||
          ts.isElementAccessExpression(inner) ||
          ts.isCallExpression(inner)) &&
        (inner.questionDotToken !== undefined ||
          (inner.flags & ts.NodeFlags.OptionalChain) !== 0);

      if (!isOptionalChainLink) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "`!` after an optional chain `?.` defeats the chain's nullish-safety.",
        help: "Remove the `!`; the optional chain already yields `undefined` when a link is nullish — handle that instead of asserting it away.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
