import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — prefer a string-literal union type over a TypeScript `enum`.
 *
 * Enums emit runtime code, are not erasable (a problem under `isolatedModules` /
 * transpile-only builds), and a string-literal union is usually a cleaner fit.
 */
export const rule = defineRule(
  {
    id: "prefer-union-over-enum",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["idioms"],
    recommendation:
      "Replace the `enum` with a string-literal union (e.g. `type T = 'a' | 'b'`) — no runtime cost, fully erasable, and `isolatedModules`-safe.",
  },
  () => ({
    [ts.SyntaxKind.EnumDeclaration]: (node, ctx) => {
      if (!ts.isEnumDeclaration(node)) return;
      const start = node.name.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Prefer a string-literal union over \`enum ${node.name.text}\`.`,
        help: "Enums emit runtime code and aren't erasable; a literal union is usually a better fit.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
