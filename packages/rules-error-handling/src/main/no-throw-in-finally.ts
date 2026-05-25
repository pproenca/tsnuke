import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag a `throw` or `return` inside a `finally` block. Either one
 * completes the `finally` abruptly, which discards (masks) any exception or
 * return value already in flight from the corresponding `try`/`catch`. Scans
 * the finally block recursively but stops at nested function scopes (a throw
 * inside a closure declared in `finally` belongs to that closure, not the
 * `finally` completion).
 */
function isFunctionScope(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function reportOffending(node: ts.Node, ctx: RuleContext): void {
  const start = node.getStart(ctx.sourceFile);
  const { line, character } =
    ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message:
      "A `throw`/`return` in `finally` masks the original error/return.",
    help: "Move the throw/return out of `finally`; let the original exception or return value propagate.",
    line: line + 1,
    column: character + 1,
  });
}

function scanFinally(node: ts.Node, ctx: RuleContext): void {
  // Do not descend into nested function scopes — their throw/return is theirs.
  if (isFunctionScope(node)) return;

  if (ts.isThrowStatement(node) || ts.isReturnStatement(node)) {
    reportOffending(node, ctx);
    return;
  }

  ts.forEachChild(node, (child) => scanFinally(child, ctx));
}

export const rule = defineRule(
  {
    id: "no-throw-in-finally",
    severity: "warning",
    category: "Error Handling",
    tier: "SYN",
    fixKind: "manual",
    tags: ["error-handling"],
    recommendation:
      "Avoid `throw`/`return` in a `finally` block — they complete the block abruptly and discard any in-flight exception or return value from the `try`/`catch`.",
  },
  () => ({
    [ts.SyntaxKind.TryStatement]: (node, ctx) => {
      if (!ts.isTryStatement(node)) return;
      if (node.finallyBlock === undefined) return;

      for (const stmt of node.finallyBlock.statements) {
        scanFinally(stmt, ctx);
      }
    },
  }),
);
