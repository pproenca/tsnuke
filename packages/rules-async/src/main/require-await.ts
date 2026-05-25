import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * SYN — an `async` function with no `await` in its own body doesn't need to be
 * `async` (the wrapper allocates a Promise and obscures intent).
 *
 * Ported VERBATIM from legacy
 * `packages/tsnuke-rules/src/rules/async/require-await.ts`; the only change is
 * importing `defineRule`/`RuleContext` from `@tsnuke/rules-core-effect`.
 */

/** True iff the node carries the `async` modifier. */
function isAsyncFn(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
}

/** True iff `body` contains an `await` (or `for await`) NOT inside a nested function scope. */
function bodyHasAwait(body: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isAwaitExpression(n)) {
      found = true;
      return;
    }
    if (ts.isForOfStatement(n) && n.awaitModifier !== undefined) {
      found = true;
      return;
    }
    n.forEachChild((child) => {
      if (found) return;
      // Do not descend into nested function scopes — their awaits don't count.
      if (
        ts.isFunctionDeclaration(child) ||
        ts.isFunctionExpression(child) ||
        ts.isArrowFunction(child) ||
        ts.isMethodDeclaration(child) ||
        ts.isConstructorDeclaration(child) ||
        ts.isGetAccessorDeclaration(child) ||
        ts.isSetAccessorDeclaration(child)
      ) {
        return;
      }
      visit(child);
    });
  };
  visit(body);
  return found;
}

export const rule = defineRule(
  {
    id: "require-await",
    severity: "warning",
    category: "Async / Promises",
    tier: "SYN",
    fixKind: "manual",
    tags: ["async"],
    recommendation:
      "Drop the `async` keyword if the function never awaits, or add the missing `await`. (`async` wraps the return value in a Promise unnecessarily.)",
  },
  () => {
    const check = (node: ts.Node, ctx: RuleContext): void => {
      if (!isAsyncFn(node)) return;
      const body = (node as ts.FunctionLikeDeclaration).body;
      if (body === undefined) return;
      if (bodyHasAwait(body)) return;
      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "`async` function has no `await` expression.",
        help: "Remove `async`, or add the `await` this function was meant to use.",
        line: line + 1,
        column: character + 1,
      });
    };
    return {
      [ts.SyntaxKind.FunctionDeclaration]: check,
      [ts.SyntaxKind.FunctionExpression]: check,
      [ts.SyntaxKind.ArrowFunction]: check,
      [ts.SyntaxKind.MethodDeclaration]: check,
    };
  },
);
