import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag a `catch` that does nothing but re-throw the caught value
 * unchanged (`catch (e) { throw e; }`). Such a try/catch is inert: it adds
 * noise without altering control flow or the error. AST-only.
 */
export const rule = defineRule(
  {
    id: "no-useless-catch",
    severity: "warning",
    category: "Error Handling",
    tier: "SYN",
    fixKind: "manual",
    tags: ["error-handling"],
    recommendation:
      "A catch that only rethrows is a no-op; remove the try/catch, or actually handle / wrap the error (e.g. `throw new Error('...', { cause: e })`).",
  },
  () => ({
    [ts.SyntaxKind.CatchClause]: (node, ctx) => {
      if (!ts.isCatchClause(node)) return;

      // The catch must bind a simple identifier, e.g. `catch (e)`.
      const decl = node.variableDeclaration;
      if (decl === undefined) return;
      if (!ts.isIdentifier(decl.name)) return;
      const boundName = decl.name.text;

      // Body must be exactly one statement: `throw <ident>;`.
      const statements = node.block.statements;
      if (statements.length !== 1) return;
      const only = statements[0]!;
      if (!ts.isThrowStatement(only)) return;
      const thrown = only.expression;
      if (thrown === undefined) return;
      if (!ts.isIdentifier(thrown) || thrown.text !== boundName) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "this catch only rethrows; remove the try/catch",
        help: "Drop the try/catch, or handle / wrap the error (e.g. `throw new Error('...', { cause: e })`).",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
