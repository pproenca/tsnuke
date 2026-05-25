import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag the `var` keyword. `var` is function-scoped and hoisted, which
 * causes subtle bugs; use block-scoped `let`/`const`. (AWS CDK TS best practices:
 * "Don't use the var keyword".)
 *
 * RULE-026 (broken auto-fix): declares `fixKind: "auto-fix"` but attaches NO
 * `fix` payload — preserved verbatim from the legacy rule.
 */
export const rule = defineRule(
  {
    id: "no-var",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "auto-fix",
    tags: ["convention"],
    recommendation:
      "Use `const` (or `let` when reassigned) instead of `var`. `var` is function-scoped and hoisted, leaking out of blocks.",
  },
  () => ({
    [ts.SyntaxKind.VariableDeclarationList]: (node, ctx) => {
      if (!ts.isVariableDeclarationList(node)) return;
      // `var` = neither the Let nor Const flag is set on the declaration list.
      if ((node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0) return;
      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Use `let`/`const`, not `var` (function-scoped and hoisted).",
        help: "Replace `var` with `const`, or `let` if the binding is reassigned.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
