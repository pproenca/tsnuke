import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag `==` / `!=` (loose equality), which performs error-prone type
 * coercion. Google TS Style Guide: "Always use triple equals (`===`) and not
 * equals (`!==`)." The one sanctioned exception is comparing against the literal
 * `null` (`x == null`), which conveniently covers both `null` and `undefined`;
 * that idiom is allowed.
 *
 * Loose equality delegates correctness to JavaScript's coercion rules rather
 * than the type system — the canonical coercion-shortcut "slop".
 *
 * RULE-026 (broken auto-fix): declares `fixKind: "auto-fix"` but attaches NO
 * `fix` payload — preserved verbatim from the legacy rule. (The `fixed` string is
 * embedded in the message text only; no `fix.edits` are produced.)
 */

/** True if either operand is the literal `null` (or `undefined`), the allowed `== null` idiom. */
function comparesToNullish(node: ts.BinaryExpression): boolean {
  const isNullish = (e: ts.Expression): boolean =>
    e.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(e) && e.text === "undefined");
  return isNullish(node.left) || isNullish(node.right);
}

export const rule = defineRule(
  {
    id: "triple-equals",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "auto-fix",
    tags: ["ts-idiom"],
    recommendation:
      "Use `===` / `!==` instead of `==` / `!=`. Loose equality performs JavaScript type coercion (`'' == 0`, `'1' == 1`), delegating correctness to runtime coercion rules. The only allowed loose form is `x == null` to test for both null and undefined.",
  },
  () => ({
    [ts.SyntaxKind.BinaryExpression]: (node, ctx) => {
      if (!ts.isBinaryExpression(node)) return;
      const op = node.operatorToken.kind;
      const isLoose =
        op === ts.SyntaxKind.EqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsToken;
      if (!isLoose) return;
      // Allowed idiom: `x == null` / `x != null` covers null + undefined.
      if (comparesToNullish(node)) return;

      const opText = op === ts.SyntaxKind.EqualsEqualsToken ? "==" : "!=";
      const fixed = op === ts.SyntaxKind.EqualsEqualsToken ? "===" : "!==";
      const start = node.operatorToken.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Use \`${fixed}\` instead of \`${opText}\` (loose equality coerces types).`,
        help: "Replace with strict equality; only `x == null` is allowed (to match both null and undefined).",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
