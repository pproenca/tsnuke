import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — prefer optional chaining over a manual `a && a.b` guard.
 *
 * The classic `a && a.b` pattern is more concisely (and more safely) expressed
 * as `a?.b`, which reads better and avoids subtle falsy-value pitfalls.
 */
export const rule = defineRule(
  {
    id: "prefer-optional-chain",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["idioms"],
    recommendation:
      "Replace the `a && a.b` guard with optional chaining (`a?.b`) — shorter and intent-revealing.",
  },
  () => ({
    [ts.SyntaxKind.BinaryExpression]: (node, ctx) => {
      if (!ts.isBinaryExpression(node)) return;
      if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken)
        return;
      if (!ts.isIdentifier(node.left)) return;
      if (!ts.isPropertyAccessExpression(node.right)) return;
      if (!ts.isIdentifier(node.right.expression)) return;
      if (node.right.expression.text !== node.left.text) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Use optional chaining: \`${node.left.text}?.${node.right.name.getText(ctx.sourceFile)}\`.`,
        help: "Replace the `a && a.b` guard with `a?.b`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
