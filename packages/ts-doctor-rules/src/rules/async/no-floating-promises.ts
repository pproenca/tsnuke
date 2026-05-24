import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * TYP (Tier-2, type-aware) — flag a Promise-valued expression statement that is
 * never awaited, returned, `void`-ed, or otherwise handled (a "floating" promise
 * swallows rejections and reorders execution unpredictably).
 *
 * Registered with `tier:"TYP"` and `requires:["typecheck:ok"]` so it only ever
 * activates under a clean type-check (BC-10). Detection genuinely needs the
 * `ts.TypeChecker` to decide whether an expression's type is Promise-like, so the
 * body early-returns when no checker is present (Tier-1 / broken-project path) —
 * which is why `runRule` (no checker) still yields nothing.
 */

/** True iff `type` (or any union constituent) has a callable `then` member. */
function isThenable(
  checker: ts.TypeChecker,
  node: ts.Node,
  type: ts.Type,
): boolean {
  const constituents = type.isUnion() ? type.types : [type];
  for (const constituent of constituents) {
    const then = constituent.getProperty("then");
    if (then === undefined) continue;
    const thenType = checker.getTypeOfSymbolAtLocation(then, node);
    if (thenType.getCallSignatures().length > 0) return true;
  }
  return false;
}

export const rule = defineRule(
  {
    id: "no-floating-promises",
    severity: "error",
    category: "Async / Promises",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "auto-fix",
    tags: ["async", "correctness"],
    recommendation:
      "Await the promise, return it, or attach a `.catch()` handler. A floating promise swallows rejections and reorders execution unpredictably.",
  },
  () => ({
    [ts.SyntaxKind.ExpressionStatement]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isExpressionStatement(node)) return;

      const expr = node.expression;
      // Already handled forms are not floating.
      if (ts.isAwaitExpression(expr) || ts.isVoidExpression(expr)) return;
      // Assignments / compound assignments consume the value — not floating.
      if (
        ts.isBinaryExpression(expr) &&
        expr.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        return;
      }

      const type = checker.getTypeAtLocation(expr);
      if (!isThenable(checker, expr, type)) return;

      const start = expr.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Floating promise: this Promise is never awaited or handled.",
        help: "Prefix with `await` (inside an async function), `return` it, or `void` it to explicitly ignore.",
        line: line + 1,
        column: character + 1,
        fix: {
          kind: "auto-fix",
          // Insert `void ` before the expression to explicitly mark it ignored.
          edits: [{ start, end: start, replacement: "void " }],
          inferredType: checker.typeToString(type),
        },
      });
    },
  }),
);
