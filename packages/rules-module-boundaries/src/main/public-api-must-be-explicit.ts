import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * SYN — flag wildcard re-exports `export * from "..."`.
 *
 * A wildcard re-export makes a module's public API implicit (whatever the target
 * happens to export today) and defeats tree-shaking, since bundlers can't prune
 * an opaque star. AST-only: an `ExportDeclaration` with no `exportClause` but a
 * present `moduleSpecifier` is exactly `export * from "..."`.
 *
 * Ported verbatim from legacy
 * `packages/ts-fix-rules/src/rules/module-boundaries/public-api-must-be-explicit.ts`;
 * the only change is importing `defineRule` from the `@ts-fix/rules-core-effect`
 * substrate rather than the legacy `../../define-rule.js`.
 */
export const rule = defineRule(
  {
    id: "public-api-must-be-explicit",
    severity: "warning",
    category: "Module Boundaries & Architecture",
    tier: "SYN",
    fixKind: "manual",
    tags: ["architecture"],
    recommendation:
      "Replace `export * from \"…\"` with explicit named re-exports (`export { a, b } from \"…\"`) so the public API is intentional and tree-shakeable.",
  },
  () => ({
    [ts.SyntaxKind.ExportDeclaration]: (node, ctx) => {
      if (!ts.isExportDeclaration(node)) return;
      // `export * from "..."` — no export clause, but a module specifier present.
      if (node.exportClause !== undefined) return;
      if (node.moduleSpecifier === undefined) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "`export *` makes the public API implicit and defeats tree-shaking.",
        help: "Re-export named symbols explicitly (`export { a, b } from \"…\"`).",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
