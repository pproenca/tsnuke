import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — budget on `any` density. A single `any` is flagged by `no-explicit-any`;
 * this rule complements it with a *file-level* health signal: a file with many
 * `any` annotations has effectively opted large swaths of itself out of type
 * checking. No checker needed — `AnyKeyword` is a syntactic token. Fires ONCE per
 * file (keyed on `SourceFile`) at the file start when the count exceeds the budget.
 */
const ANY_DENSITY_THRESHOLD = 5;

/** Count every `any` keyword token in the subtree (a syntactic walk). */
function countAny(node: ts.Node): number {
  let sum = node.kind === ts.SyntaxKind.AnyKeyword ? 1 : 0;
  ts.forEachChild(node, (child) => {
    sum += countAny(child);
  });
  return sum;
}

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

      const count = countAny(node);
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
