import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the `var` keyword. `var` is function-scoped and hoisted, which
 * causes subtle bugs; use block-scoped `let`/`const`. (AWS CDK TS best practices:
 * "Don't use the var keyword".)
 *
 * P4 (real codemods): emits a `fix.edits` payload that replaces `var` with `let`
 * — the SAFE conservative choice (always semantically equivalent; const would
 * require proving the binding isn't reassigned, which we can't do cheaply at
 * the declaration site). Agents prefer `const` and will manually downgrade
 * `let` → `const` for the non-reassigned cases on a second pass.
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
      // The `var` keyword is exactly 3 chars at `start`; splice it to `let`.
      // `const` would be the ideal but proving non-reassignment costs more than
      // the codemod is worth — agents make that decision on a second pass.
      ctx.report({
        filePath: ctx.filePath,
        message: "Use `let`/`const`, not `var` (function-scoped and hoisted).",
        help: "Replace `var` with `const`, or `let` if the binding is reassigned.",
        line: line + 1,
        column: character + 1,
        fix: {
          kind: "auto-fix",
          edits: [{ start, end: start + 3, replacement: "let" }],
        },
      });
    },
  }),
);
