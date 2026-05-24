import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — flag `JSON.parse(...) as T`.
 *
 * Asserting a type onto the output of `JSON.parse` (which returns `any`) trusts
 * untrusted, unvalidated data: the cast just silences the checker rather than
 * proving the shape. The fix is to validate the parsed value at runtime (a type
 * guard or a schema library) instead of asserting it away.
 */
export const rule = defineRule(
  {
    id: "no-assertion-on-json-parse",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Asserting a type onto `JSON.parse` output trusts unvalidated data; validate it with a type guard or schema (zod/valibot) instead of casting.",
  },
  () => ({
    [ts.SyntaxKind.AsExpression]: (node, ctx) => {
      if (!ts.isAsExpression(node)) return;

      // Unwrap parentheses to find the asserted expression.
      let inner: ts.Expression = node.expression;
      while (ts.isParenthesizedExpression(inner)) inner = inner.expression;

      if (!ts.isCallExpression(inner)) return;
      const callee = inner.expression;
      if (!ts.isPropertyAccessExpression(callee)) return;
      if (!ts.isIdentifier(callee.expression) || callee.expression.text !== "JSON") {
        return;
      }
      if (callee.name.text !== "parse") return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Asserting a type onto `JSON.parse` output trusts unvalidated data.",
        help: "Validate the parsed value with a type guard or schema (zod/valibot) instead of casting it with `as`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
