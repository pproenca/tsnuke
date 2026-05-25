import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag a `catch` block that silently swallows the error. A comment-only
 * catch is allowed (it documents the intentional swallow).
 */
export const rule = defineRule(
  {
    id: "no-empty-catch",
    severity: "warning",
    category: "Error Handling",
    tier: "SYN",
    fixKind: "manual",
    tags: ["error-handling"],
    recommendation:
      "Handle, log, or rethrow the error. If swallowing is intentional, leave a comment in the catch block explaining why.",
  },
  () => ({
    [ts.SyntaxKind.CatchClause]: (node, ctx) => {
      if (!ts.isCatchClause(node)) return;
      if (node.block.statements.length > 0) return;
      // Allow a comment-only catch: only flag a truly empty `{}`.
      const blockText = node.block.getText(ctx.sourceFile).replace(/\s/g, "");
      if (blockText !== "{}") return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Empty catch block silently swallows the error.",
        help: "Handle, log, or rethrow — or add a comment explaining the intentional swallow.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
