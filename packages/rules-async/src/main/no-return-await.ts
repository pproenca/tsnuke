import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";
import type { RuleContext } from "@ts-fix/rules-core-effect";

/**
 * SYN — `return await x` is redundant: an `async` function already wraps its
 * return value in a Promise, so awaiting only to immediately return adds an
 * extra microtask tick with no benefit. The one EXCEPTION is inside a `try`
 * block, where the `await` is meaningful — it keeps the awaited promise's
 * rejection inside the surrounding `try`/`catch`/`finally` rather than letting
 * it escape the function. So we report `return await` everywhere EXCEPT when the
 * return lives directly in a `try` block (before crossing a function boundary).
 *
 * Ported VERBATIM from legacy
 * `packages/ts-fix-rules/src/rules/async/no-return-await.ts`; the only change is
 * importing `defineRule`/`RuleContext` from `@ts-fix/rules-core-effect`.
 */

/**
 * True iff `node` sits inside a `try` block — i.e. walking up the parent chain
 * we reach a `Block` that is the `tryBlock` of a `TryStatement`, BEFORE crossing
 * any function boundary (a nested function's `try` doesn't count).
 */
function isInsideTryBlock(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return false; // crossed a function boundary before finding a try block.
    }
    if (
      ts.isBlock(current) &&
      current.parent !== undefined &&
      ts.isTryStatement(current.parent) &&
      current.parent.tryBlock === current
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export const rule = defineRule(
  {
    id: "no-return-await",
    severity: "warning",
    category: "Async / Promises",
    tier: "SYN",
    fixKind: "manual",
    tags: ["async"],
    recommendation:
      "Drop the `await` and return the promise directly — an async function already wraps its return value in a Promise, so `return await` only adds a redundant tick. (Inside a `try` the `await` is meaningful and is left alone.)",
  },
  () => {
    const check = (node: ts.Node, ctx: RuleContext): void => {
      if (!ts.isReturnStatement(node)) return;
      const expr = node.expression;
      if (expr === undefined || !ts.isAwaitExpression(expr)) return;
      if (isInsideTryBlock(node)) return; // await is meaningful inside try.

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "redundant `return await`; return the promise directly",
        help: "Remove the `await` and return the promise directly (the async wrapper already produces a Promise).",
        line: line + 1,
        column: character + 1,
      });
    };
    return {
      [ts.SyntaxKind.ReturnStatement]: check,
    };
  },
);
