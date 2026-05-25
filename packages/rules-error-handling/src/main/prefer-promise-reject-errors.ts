import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

const PRIMITIVE_REJECT =
  ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike;

/** True when `node` is the `Promise.reject(...)` static call. */
function isPromiseReject(node: ts.CallExpression): boolean {
  const { expression } = node;
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (expression.name.text !== "reject") return false;
  return (
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "Promise"
  );
}

/**
 * TYP (Tier-2, type-aware) — `Promise.reject` should reject with an `Error`,
 * not a primitive. Rejecting with a string/number/boolean loses the stack trace
 * and breaks `instanceof` checks downstream. Conservative: only flags the
 * unambiguous primitive cases; requires the checker.
 */
export const rule = defineRule(
  {
    id: "prefer-promise-reject-errors",
    severity: "warning",
    category: "Error Handling",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["error-handling", "correctness"],
    recommendation:
      "Reject promises with an `Error` (or subclass) so consumers get a stack trace and `instanceof` checks work, e.g. `Promise.reject(new Error(...))`.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return;
      if (!ts.isCallExpression(node)) return;
      if (!isPromiseReject(node)) return;
      const first = node.arguments[0];
      if (first === undefined) return;

      const type = checker.getTypeAtLocation(first);
      if ((type.flags & PRIMITIVE_REJECT) === 0) return; // not a clear primitive.

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `reject with an Error, not a primitive (${checker.typeToString(type)}).`,
        help: "Reject with an `Error` subclass, e.g. `Promise.reject(new Error(...))`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
