import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the non-null assertion operator (`expr!`).
 *
 * Real Tier-1 rule: matches `ts.NonNullExpression` nodes (no checker needed).
 * The `!` operator asserts away `null`/`undefined` without proof; it is a
 * silent escape hatch that the compiler cannot verify. Prefer a runtime guard
 * or narrowing. Manual fix only (a safe rewrite needs the surrounding context).
 */
export const rule = defineRule(
  {
    id: "no-non-null-assertion",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["escape-hatch"],
    recommendation:
      "Replace `x!` with an explicit narrowing/guard (e.g. `if (x == null) return`) so the non-null-ness is verified rather than asserted.",
  },
  (ctx) => ({
    [ts.SyntaxKind.NonNullExpression]: (node) => {
      const pos = ctx.sourceFile.getLineAndCharacterOfPosition(node.getStart(ctx.sourceFile));
      ctx.report({
        filePath: ctx.filePath,
        message: "Avoid the non-null assertion operator `!`.",
        help: "Narrow the value with a runtime check instead of asserting it is non-null.",
        line: pos.line + 1,
        column: pos.character + 1,
      });
    },
  }),
);
