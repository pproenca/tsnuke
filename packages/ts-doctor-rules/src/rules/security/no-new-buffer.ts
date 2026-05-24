import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — flag `new Buffer(...)`. The `Buffer` constructor is deprecated and
 * unsafe: depending on the argument type it can return uninitialized memory
 * (leaking old heap contents) and its overloads are easy to misuse. AST-only
 * (no checker): match a `NewExpression` whose callee is the `Buffer` identifier.
 */
export const rule = defineRule(
  {
    id: "no-new-buffer",
    severity: "error",
    category: "Security",
    tier: "SYN",
    fixKind: "manual",
    tags: ["security"],
    recommendation:
      "Avoid `new Buffer()`; it is deprecated and can expose uninitialized memory. Use `Buffer.from()` for data or `Buffer.alloc()` for a zero-filled buffer.",
  },
  () => ({
    [ts.SyntaxKind.NewExpression]: (node, ctx) => {
      if (!ts.isNewExpression(node)) return;
      const { expression } = node;
      if (!ts.isIdentifier(expression) || expression.text !== "Buffer") return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "`new Buffer()` is deprecated and unsafe.",
        help: "`new Buffer()` is deprecated and unsafe (uninitialized memory); use `Buffer.from()` / `Buffer.alloc()`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
