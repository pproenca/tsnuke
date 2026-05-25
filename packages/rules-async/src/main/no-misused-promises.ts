import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";
import type { RuleContext } from "@ts-fix/rules-core-effect";

/**
 * TYP (Tier-2, type-aware) — flag a Promise used directly as a boolean
 * condition. A Promise object is always truthy, so `if (promise)` always takes
 * the truthy branch — almost certainly a missing `await`.
 *
 * Registered with `tier:"TYP"` and `requires:["typecheck:ok"]` so it activates
 * only under a clean type-check (BC-10). Deciding whether a condition's type is
 * Promise-like needs the `ts.TypeChecker`, so the body early-returns when no
 * checker is present (Tier-1 / broken-project path) — which is why `runRule`
 * (no checker) yields nothing.
 *
 * Ported VERBATIM from legacy
 * `packages/ts-fix-rules/src/rules/async/no-misused-promises.ts`; the only change
 * is importing `defineRule`/`RuleContext` from `@ts-fix/rules-core-effect`.
 */

/** True iff `type` (or any union constituent) has a callable `then` member. */
function isThenable(
  checker: ts.TypeChecker,
  node: ts.Node,
  type: ts.Type,
): boolean {
  const constituents = type.isUnion() ? type.types : [type];
  return constituents.some((constituent) => {
    const then = constituent.getProperty("then");
    if (then === undefined) return false;
    return checker.getTypeOfSymbolAtLocation(then, node).getCallSignatures().length > 0;
  });
}

export const rule = defineRule(
  {
    id: "no-misused-promises",
    severity: "error",
    category: "Async / Promises",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["async", "correctness"],
    recommendation:
      "A Promise is always truthy, so using one as a condition always takes the truthy branch. `await` the promise (inside an async function) before testing it, or test the resolved value instead.",
  },
  () => {
    const check = (condition: ts.Expression, ctx: RuleContext): void => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.

      const type = checker.getTypeAtLocation(condition);
      if (!isThenable(checker, condition, type)) return;

      const start = condition.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Promise used as a condition: a Promise is always truthy (missing `await`?).",
        help: "Prefix with `await` (inside an async function) so the condition tests the resolved value.",
        line: line + 1,
        column: character + 1,
      });
    };

    return {
      [ts.SyntaxKind.IfStatement]: (node, ctx) => {
        if (!ts.isIfStatement(node)) return;
        check(node.expression, ctx);
      },
      [ts.SyntaxKind.WhileStatement]: (node, ctx) => {
        if (!ts.isWhileStatement(node)) return;
        check(node.expression, ctx);
      },
      [ts.SyntaxKind.DoStatement]: (node, ctx) => {
        if (!ts.isDoStatement(node)) return;
        check(node.expression, ctx);
      },
      [ts.SyntaxKind.ConditionalExpression]: (node, ctx) => {
        if (!ts.isConditionalExpression(node)) return;
        check(node.condition, ctx);
      },
    };
  },
);
