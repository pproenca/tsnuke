import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * TYP (Tier-2, type-aware) — flag an `await` whose operand is NOT thenable.
 * `await` on a non-Promise resolves immediately to the value unchanged, so the
 * `await` is a no-op and almost always signals a mistake (e.g. forgetting to
 * actually return a promise, or awaiting the wrong expression).
 *
 * Registered with `tier:"TYP"` and `requires:["typecheck:ok"]`; activates only
 * under a clean type-check (BC-10). Deciding thenability genuinely needs the
 * `ts.TypeChecker`, so the body early-returns without one (Tier-1 / broken-
 * project path) — which is why `runRule` (no checker) yields nothing.
 *
 * Ported VERBATIM from legacy
 * `packages/ts-doctor-rules/src/rules/async/await-thenable.ts`; the only change is
 * importing `defineRule` from `@ts-doctor/rules-core-effect`.
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
    id: "await-thenable",
    severity: "warning",
    category: "Async / Promises",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["async", "correctness"],
    recommendation:
      "Remove the `await` (awaiting a non-Promise is a no-op), or fix the operand to be the Promise you intended to await.",
  },
  () => ({
    [ts.SyntaxKind.AwaitExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isAwaitExpression(node)) return;

      const type = checker.getTypeAtLocation(node.expression);
      if (isThenable(checker, node.expression, type)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Awaiting a non-Promise is a no-op, likely a bug.",
        help: "Remove the redundant `await`, or fix the operand to be a Promise.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
