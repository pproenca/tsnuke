import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * SYN — flag an `await` that sits (directly) inside a loop body. Awaiting per
 * iteration serializes the loop: each iteration blocks on the previous one's
 * promise. When the iterations are independent, `Promise.all` (or
 * `Promise.allSettled`) over a mapped array runs them concurrently instead.
 *
 * AST-only: walk up the `parent` chain from the `await`. If we hit a loop node
 * before crossing a function boundary, the `await` is in that loop's body. We
 * stop at the first function boundary (or `SourceFile`) so an `await` inside a
 * callback passed to (say) `.forEach` inside a loop does NOT count against the
 * outer loop.
 *
 * Ported VERBATIM from legacy
 * `packages/ts-fix-rules/src/rules/async/no-await-in-loop.ts`; the only change is
 * importing `defineRule` from `@ts-fix/rules-core-effect`.
 */

/** True iff `node` is a loop statement we care about. */
function isLoop(node: ts.Node): boolean {
  return (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  );
}

/** True iff `node` introduces a new function scope (an `await` boundary). */
function isFunctionBoundary(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

export const rule = defineRule(
  {
    id: "no-await-in-loop",
    severity: "warning",
    category: "Async / Promises",
    tier: "SYN",
    fixKind: "manual",
    tags: ["async", "performance"],
    recommendation:
      "Await in a loop serializes iterations. If they're independent, collect the promises and `await Promise.all(...)` once after the loop.",
  },
  () => ({
    [ts.SyntaxKind.AwaitExpression]: (node, ctx) => {
      if (!ts.isAwaitExpression(node)) return;

      // Walk up to (but not past) the enclosing function scope or the file.
      let current: ts.Node | undefined = node.parent;
      while (current !== undefined && !ts.isSourceFile(current)) {
        if (isFunctionBoundary(current)) return; // crossed a scope before any loop.
        if (isLoop(current)) {
          const start = node.getStart(ctx.sourceFile);
          const { line, character } =
            ctx.sourceFile.getLineAndCharacterOfPosition(start);
          ctx.report({
            filePath: ctx.filePath,
            message:
              "`await` in a loop serializes iterations; consider `Promise.all`.",
            help: "If the iterations are independent, build an array of promises and `await Promise.all(...)` after the loop.",
            line: line + 1,
            column: character + 1,
          });
          return;
        }
        current = current.parent;
      }
    },
  }),
);
