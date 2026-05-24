import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — flag `return <expr> as T` inside a function with an explicit return-type
 * annotation.
 *
 * When the function already declares its return type, casting the returned value
 * forces it to match the annotation instead of *producing* a value of that type.
 * That defeats the very check the annotation exists for, hiding a real mismatch.
 * Return a correctly-typed value, or make the function generic so the caller's
 * type flows through.
 */
export const rule = defineRule(
  {
    id: "no-cast-in-return",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Casting at the return boundary hides a type mismatch; return a correctly-typed value or make the function generic.",
  },
  () => ({
    [ts.SyntaxKind.ReturnStatement]: (node, ctx) => {
      if (!ts.isReturnStatement(node)) return;
      if (node.expression === undefined) return;

      // Unwrap parentheses around the returned expression.
      let inner: ts.Expression = node.expression;
      while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
      if (!ts.isAsExpression(inner)) return;

      // Walk up to the nearest function-like ancestor.
      let fn: ts.Node | undefined = node.parent;
      while (
        fn !== undefined &&
        !ts.isFunctionDeclaration(fn) &&
        !ts.isFunctionExpression(fn) &&
        !ts.isArrowFunction(fn) &&
        !ts.isMethodDeclaration(fn) &&
        !ts.isGetAccessorDeclaration(fn)
      ) {
        fn = fn.parent;
      }
      if (fn === undefined) return;

      // Only flag when the function declares an explicit return type — that's the
      // contract the cast is papering over.
      const fnLike = fn as ts.SignatureDeclaration;
      if (fnLike.type === undefined) return;

      const start = inner.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Casting at the return boundary hides a type mismatch against the declared return type.",
        help: "Return a correctly-typed value, or make the function generic so the caller's type flows through, instead of `return x as T`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
