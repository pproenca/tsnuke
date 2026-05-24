import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — budget on `any` density. A single `any` is flagged by `no-explicit-any`;
 * this rule complements it with a *file-level* health signal: a file with many
 * `any` annotations has effectively opted large swaths of itself out of type
 * checking. No checker needed — `AnyKeyword` is a syntactic token. Fires ONCE per
 * file (keyed on `SourceFile`) at the file start when the count exceeds the budget.
 */
const ANY_DENSITY_THRESHOLD = 5;

export const rule = defineRule(
  {
    id: "any-density-budget",
    severity: "warning",
    category: "Type Safety",
    tier: "SYN",
    fixKind: "manual",
    tags: ["type-safety"],
    recommendation:
      "Reduce the number of `any` annotations in this file. A high `any` density opts large parts of the file out of type checking; replace them with precise types, `unknown` (then narrow), or generics.",
  },
  () => ({
    [ts.SyntaxKind.SourceFile]: (node, ctx) => {
      if (!ts.isSourceFile(node)) return;

      let count = 0;
      const walk = (n: ts.Node): void => {
        if (n.kind === ts.SyntaxKind.AnyKeyword) count += 1;
        ts.forEachChild(n, walk);
      };
      walk(node);

      if (count <= ANY_DENSITY_THRESHOLD) return;

      // Report once, at the start of the file (1:1 by convention).
      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Too many \`any\` annotations: ${count} found (budget is ${ANY_DENSITY_THRESHOLD}).`,
        help: "A high `any` density opts large parts of this file out of type checking. Replace with precise types, `unknown` (then narrow), or generics.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
