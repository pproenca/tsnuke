import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — flag a template literal that has no interpolation.
 *
 * A backtick string with no `${}` (a `NoSubstitutionTemplateLiteral`) gains
 * nothing over a regular quoted string. We only flag the trivially-safe case:
 * no newline and no embedded quote, so a `'…'` / `"…"` swap can't change meaning.
 */
export const rule = defineRule(
  {
    id: "no-unnecessary-template-literal",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["idioms"],
    recommendation:
      "Use a regular quoted string when a template literal has no interpolation.",
  },
  () => ({
    [ts.SyntaxKind.NoSubstitutionTemplateLiteral]: (node, ctx) => {
      if (!ts.isNoSubstitutionTemplateLiteral(node)) return;
      const { text } = node;
      // Only flag when conversion to a quoted string is trivially safe.
      if (text.includes("\n")) return;
      if (text.includes("'")) return;
      if (text.includes('"')) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Template literal with no interpolation; use a regular quoted string.",
        help: "Replace the backtick template with a `'…'` or `\"…\"` string.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
