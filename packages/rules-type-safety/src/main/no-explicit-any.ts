import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * SYN — flag the `any` keyword used as a type annotation.
 *
 * Real Tier-1 rule: matches `ts.SyntaxKind.AnyKeyword` appearing in type
 * position (a `ts.KeywordTypeNode`). No checker needed — the keyword token is
 * syntactic. `any` disables type-checking for everything it touches and
 * propagates silently. Manual fix (replacing it well needs intent / the checker).
 */
export const rule = defineRule(
  {
    id: "no-explicit-any",
    severity: "warning",
    category: "Type Safety",
    tier: "SYN",
    fixKind: "manual",
    tags: ["type-safety"],
    recommendation:
      "Replace `any` with a precise type, `unknown` (then narrow), or a generic parameter. `any` opts the value out of all type checking.",
  },
  (ctx) => ({
    [ts.SyntaxKind.AnyKeyword]: (node) => {
      const pos = ctx.sourceFile.getLineAndCharacterOfPosition(node.getStart(ctx.sourceFile));
      ctx.report({
        filePath: ctx.filePath,
        message: "Unexpected `any`. Specify a precise type or use `unknown`.",
        help: "`any` disables type checking and propagates through assignments and calls.",
        line: pos.line + 1,
        column: pos.character + 1,
      });
    },
  }),
);
