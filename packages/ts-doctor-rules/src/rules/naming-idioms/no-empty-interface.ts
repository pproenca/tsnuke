import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — flag an empty `interface X {}` with no members and no heritage clauses.
 *
 * An empty interface with no `extends` is structurally equivalent to `{}` (which
 * accepts almost anything), so it's near-useless. An empty interface that DOES
 * extend a base is a meaningful alias and is left alone.
 */
export const rule = defineRule(
  {
    id: "no-empty-interface",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "manual",
    tags: ["idioms"],
    recommendation:
      "An empty interface with no `extends` is equivalent to `{}`; remove it or replace it with a type alias.",
  },
  () => ({
    [ts.SyntaxKind.InterfaceDeclaration]: (node, ctx) => {
      if (!ts.isInterfaceDeclaration(node)) return;
      if (node.members.length !== 0) return;
      // An empty interface that extends a base is a meaningful alias — keep it.
      if (node.heritageClauses !== undefined && node.heritageClauses.length !== 0) {
        return;
      }
      const start = node.name.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `An empty interface \`${node.name.text}\` is equivalent to \`{}\`.`,
        help: "Remove the empty interface or replace it with a type alias.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
