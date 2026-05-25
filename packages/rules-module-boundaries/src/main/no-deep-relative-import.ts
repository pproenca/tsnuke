import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * A deep chain of `../` segments signals a missing module boundary / path alias.
 *
 * INCLUSIVE boundary (RULE-011): the rule fires on `depth >= 4` — distinct from the
 * type-performance budget rules (RULE-008/009/010), which use the EXCLUSIVE `> N`.
 * Here exactly 4 leading `..` segments DOES fire; exactly 3 does not.
 */
const MAX_RELATIVE_DEPTH = 4;

/**
 * SYN — flag deep relative imports/exports such as `../../../../deep/mod` (RULE-011).
 *
 * A specifier that climbs four or more directories typically reaches across a
 * module boundary that should be a stable path alias instead. AST-only: we read
 * the module specifier string literal and count its leading `../` segments. Only
 * LEADING `..` segments count — the scan breaks at the first non-`..` segment, so a
 * mid-path climb (`a/../b`) is not counted. Non-string specifiers are skipped.
 *
 * Ported verbatim from legacy
 * `packages/tsnuke-rules/src/rules/module-boundaries/no-deep-relative-import.ts`;
 * the only change is importing `defineRule` / `RuleContext` from the
 * `@tsnuke/rules-core-effect` substrate rather than the legacy `../../define-rule.js`.
 */
export const rule = defineRule(
  {
    id: "no-deep-relative-import",
    severity: "warning",
    category: "Module Boundaries & Architecture",
    tier: "SYN",
    fixKind: "manual",
    tags: ["architecture"],
    recommendation:
      "Replace a deep relative import (`../../../../…`) with a path alias (e.g. `@app/…`); deep climbs couple modules across boundaries and break when files move.",
  },
  () => {
    const check = (
      moduleSpecifier: ts.Expression | undefined,
      ctx: RuleContext,
    ): void => {
      if (moduleSpecifier === undefined) return;
      if (!ts.isStringLiteral(moduleSpecifier)) return;

      // Count LEADING `..` segments: the index of the first non-`..` segment is
      // exactly that count; -1 (no non-`..` found) means every segment is `..`.
      const segments = moduleSpecifier.text.split("/");
      const firstNonDotDot = segments.findIndex((s) => s !== "..");
      const depth = firstNonDotDot === -1 ? segments.length : firstNonDotDot;
      if (depth < MAX_RELATIVE_DEPTH) return;

      const start = moduleSpecifier.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Deep relative import (${depth} levels) signals a missing module boundary.`,
        help: "Use a path alias instead of climbing four or more directories with `../`.",
        line: line + 1,
        column: character + 1,
      });
    };

    return {
      [ts.SyntaxKind.ImportDeclaration]: (node, ctx) => {
        if (!ts.isImportDeclaration(node)) return;
        check(node.moduleSpecifier, ctx);
      },
      [ts.SyntaxKind.ExportDeclaration]: (node, ctx) => {
        if (!ts.isExportDeclaration(node)) return;
        check(node.moduleSpecifier, ctx);
      },
    };
  },
);
