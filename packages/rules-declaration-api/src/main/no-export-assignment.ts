import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag CommonJS-style `export = ...`.
 *
 * `export =` is the TypeScript/CommonJS interop form; it doesn't fit the ES
 * module world (interop is awkward, tree-shaking suffers, and it's incompatible
 * with `verbatimModuleSyntax`). AST-only: an `ExportAssignment` with
 * `isExportEquals === true` is `export = …` (vs `export default …`).
 */
export const rule = defineRule(
  {
    id: "no-export-assignment",
    severity: "warning",
    category: "Declaration & API Hygiene",
    tier: "SYN",
    fixKind: "manual",
    tags: ["api-hygiene"],
    recommendation:
      "Replace `export = …` with an ES module `export default …` or named exports; `export =` is CommonJS-style and doesn't interoperate cleanly with ESM.",
  },
  () => ({
    [ts.SyntaxKind.ExportAssignment]: (node, ctx) => {
      if (!ts.isExportAssignment(node)) return;
      if (node.isExportEquals !== true) return; // `export default …` is fine.

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "`export =` is CommonJS-style.",
        help: "Prefer an ES module `export default` or named exports.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
