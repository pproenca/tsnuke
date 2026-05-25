import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";
import type { RuleContext } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag `export default`.
 *
 * Default exports have no canonical name at the import site, which hurts
 * refactoring (renames don't propagate), discoverability (no stable identifier
 * to search for), and tree-shaking (bundlers reason better about named bindings).
 * AST-only: a default export appears in two shapes — an `ExportAssignment` that
 * is NOT `export =` (i.e. `export default <expr>`), or any declaration carrying
 * both the `export` and `default` modifiers (e.g. `export default function f(){}`).
 *
 * Ported verbatim from legacy
 * `packages/ts-doctor-rules/src/rules/module-boundaries/no-default-export.ts`;
 * the only change is importing `defineRule` / `RuleContext` from the
 * `@ts-doctor/rules-core-effect` substrate rather than the legacy `../../define-rule.js`.
 */
export const rule = defineRule(
  {
    id: "no-default-export",
    severity: "warning",
    category: "Module Boundaries & Architecture",
    tier: "SYN",
    fixKind: "manual",
    tags: ["architecture"],
    recommendation:
      "Prefer named exports over `export default`: better refactoring, discoverability, and tree-shaking.",
  },
  () => {
    const flag = (node: ts.Node, ctx: RuleContext): void => {
      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "`export default` found; prefer a named export.",
        help: "Replace the default export with a named export for better refactoring, discoverability, and tree-shaking.",
        line: line + 1,
        column: character + 1,
      });
    };

    // Form (b): a declaration carrying BOTH `export` and `default` modifiers,
    // e.g. `export default function f() {}` / `export default class C {}`.
    const checkModifiers = (node: ts.Node, ctx: RuleContext): void => {
      if (!ts.canHaveModifiers(node)) return;
      const modifiers = ts.getModifiers(node);
      if (modifiers === undefined) return;
      const hasExport = modifiers.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      const hasDefault = modifiers.some(
        (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
      );
      if (hasExport && hasDefault) flag(node, ctx);
    };

    return {
      // Form (a): `export default <expr>;` (ExportAssignment that is not `export =`).
      // Note: `isExportEquals` is `true` for `export =` and `undefined` (NOT
      // `false`) for `export default`, so test for "not export-equals".
      [ts.SyntaxKind.ExportAssignment]: (node, ctx) => {
        if (!ts.isExportAssignment(node)) return;
        if (node.isExportEquals !== true) flag(node, ctx);
      },
      [ts.SyntaxKind.FunctionDeclaration]: checkModifiers,
      [ts.SyntaxKind.ClassDeclaration]: checkModifiers,
    };
  },
);
