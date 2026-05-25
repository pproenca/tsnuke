import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * SYN — flag reassigning the caught exception variable inside a `catch` block.
 *
 * Overwriting the binding (`catch (e) { e = ... }`) discards the original error,
 * losing its stack/cause and making the failure harder to diagnose.
 */
export const rule = defineRule(
  {
    id: "no-ex-assign",
    severity: "error",
    category: "Error Handling",
    tier: "SYN",
    fixKind: "manual",
    tags: ["error-handling"],
    recommendation:
      "Don't reassign the caught exception variable; introduce a new variable instead so the original error is preserved.",
  },
  () => ({
    [ts.SyntaxKind.CatchClause]: (node, ctx) => {
      if (!ts.isCatchClause(node)) return;
      const decl = node.variableDeclaration;
      if (decl === undefined) return;
      if (!ts.isIdentifier(decl.name)) return;
      const exName = decl.name.text;

      // Compound assignment tokens (e.g. `+=`, `??=`) also reassign the binding.
      const isAssignmentToken = (kind: ts.SyntaxKind): boolean =>
        kind === ts.SyntaxKind.EqualsToken ||
        (kind >= ts.SyntaxKind.FirstCompoundAssignment &&
          kind <= ts.SyntaxKind.LastCompoundAssignment);

      const scan = (n: ts.Node): void => {
        if (
          ts.isBinaryExpression(n) &&
          isAssignmentToken(n.operatorToken.kind) &&
          ts.isIdentifier(n.left) &&
          n.left.text === exName
        ) {
          const start = n.getStart(ctx.sourceFile);
          const { line, character } =
            ctx.sourceFile.getLineAndCharacterOfPosition(start);
          ctx.report({
            filePath: ctx.filePath,
            message: `Don't reassign the caught exception variable \`${exName}\`; it loses the original error.`,
            help: "Preserve the caught error — assign to a new variable instead of overwriting the catch binding.",
            line: line + 1,
            column: character + 1,
          });
        }
        ts.forEachChild(n, scan);
      };
      scan(node.block);
    },
  }),
);
