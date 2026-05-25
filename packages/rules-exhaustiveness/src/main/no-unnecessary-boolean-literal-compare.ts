import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * TYP (Tier-2, type-aware) — flag a (in)equality comparison between a `boolean`
 * value and a boolean literal (`x === true`, `x !== false`, …). The comparison
 * is redundant: the boolean value can be used directly (`x`, `!x`). Restricted
 * to operands whose type is exactly `boolean` so we never rewrite a comparison
 * against a nullable/`unknown` value where the truthiness differs.
 *
 * Registered with `tier:"TYP"` and `requires:["typecheck:ok"]`; activates only
 * under a clean type-check (BC-10). Confirming the other side is exactly
 * `boolean` needs the `ts.TypeChecker`, so the body early-returns without one
 * (Tier-1 / broken-project path) — which is why `runRule` yields nothing.
 */

/** True iff `node` is a `true`/`false` keyword literal. */
function isBooleanLiteral(node: ts.Node): boolean {
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  );
}

const COMPARISON_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

export const rule = defineRule(
  {
    id: "no-unnecessary-boolean-literal-compare",
    severity: "warning",
    category: "Exhaustiveness & Narrowing",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["exhaustiveness", "style"],
    recommendation:
      "Comparing a boolean to a boolean literal is redundant; use the value directly (`x` / `!x`) instead of `x === true` / `x === false`.",
  },
  () => ({
    [ts.SyntaxKind.BinaryExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isBinaryExpression(node)) return;
      if (!COMPARISON_OPERATORS.has(node.operatorToken.kind)) return;

      // Exactly one side must be a boolean literal; the OTHER side's type must be `boolean`.
      const leftIsLiteral = isBooleanLiteral(node.left);
      const rightIsLiteral = isBooleanLiteral(node.right);
      if (leftIsLiteral === rightIsLiteral) return; // neither, or both — out of scope.

      const valueSide = leftIsLiteral ? node.right : node.left;
      const valueType = checker.getTypeAtLocation(valueSide);
      if ((valueType.flags & ts.TypeFlags.BooleanLike) === 0) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Comparing a boolean to a boolean literal is redundant; use the value directly.",
        help: "Drop the `=== true` / `!== false` comparison and use the boolean value (or its negation) directly.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
