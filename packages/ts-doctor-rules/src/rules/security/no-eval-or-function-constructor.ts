import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — flag `eval(...)` and `new Function(...)`. Both execute arbitrary code
 * from a string at runtime: they defeat the type system, are an injection
 * vector, and block bundler optimizations. AST-only (no checker): match by
 * callee identifier name.
 */
export const rule = defineRule(
  {
    id: "no-eval-or-function-constructor",
    severity: "error",
    category: "Security",
    tier: "SYN",
    fixKind: "manual",
    tags: ["security"],
    recommendation:
      "Avoid `eval` / `new Function`; they execute arbitrary code. Refactor to call the code directly, or parse data with `JSON.parse`.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      if (!ts.isCallExpression(node)) return;
      const { expression } = node;
      if (!ts.isIdentifier(expression) || expression.text !== "eval") return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "`new Function` / `eval` execute arbitrary code.",
        help: "Call the code directly, or parse data with `JSON.parse`.",
        line: line + 1,
        column: character + 1,
      });
    },
    [ts.SyntaxKind.NewExpression]: (node, ctx) => {
      if (!ts.isNewExpression(node)) return;
      const { expression } = node;
      if (!ts.isIdentifier(expression) || expression.text !== "Function") return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "`new Function` / `eval` execute arbitrary code.",
        help: "Call the code directly, or parse data with `JSON.parse`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
