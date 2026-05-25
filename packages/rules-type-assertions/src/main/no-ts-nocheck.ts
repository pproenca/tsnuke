import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

// A `@ts-nocheck` directive in a line- or block-comment at the start of a line.
// Anchoring to line start avoids matching the token inside a string literal.
const NOCHECK = /^[ \t]*\/[/*][ \t]*@ts-nocheck\b/m;

/**
 * SYN — ban `// @ts-nocheck`, which disables type-checking for an entire file.
 */
export const rule = defineRule(
  {
    id: "no-ts-nocheck",
    severity: "error",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["escape-hatch"],
    recommendation:
      "Remove `@ts-nocheck` and fix the underlying type errors, or scope suppression to specific lines with `@ts-expect-error -- reason`.",
  },
  () => ({
    [ts.SyntaxKind.SourceFile]: (node, ctx) => {
      if (!ts.isSourceFile(node)) return;
      const match = NOCHECK.exec(node.getFullText());
      if (match === null) return;
      const { line, character } = node.getLineAndCharacterOfPosition(match.index);
      ctx.report({
        filePath: ctx.filePath,
        message: "`@ts-nocheck` disables type-checking for the entire file.",
        help: "Remove it and fix the errors, or use line-scoped `@ts-expect-error -- reason`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
