import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag exported mutable bindings (`export let` / `export var`).
 *
 * A mutable export is a live, reassignable cell in the public API: consumers
 * can observe it change (or change it via re-export plumbing), which makes the
 * module's surface unpredictable and defeats the static reasoning bundlers and
 * the checker do. AST-only: an exported `VariableStatement` whose declaration
 * list is not `const` (i.e. `let` or `var`).
 */
export const rule = defineRule(
  {
    id: "no-mutable-exports",
    severity: "warning",
    category: "Declaration & API Hygiene",
    tier: "SYN",
    fixKind: "manual",
    tags: ["api-hygiene"],
    recommendation:
      "Export immutable bindings: replace `export let`/`export var` with `export const` so the module's public surface can't be reassigned.",
  },
  () => ({
    [ts.SyntaxKind.VariableStatement]: (node, ctx) => {
      if (!ts.isVariableStatement(node)) return;
      if (!ts.canHaveModifiers(node)) return;
      const isExported =
        ts
          .getModifiers(node)
          ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (!isExported) return;
      if ((node.declarationList.flags & ts.NodeFlags.Const) !== 0) return; // `export const` is fine.

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Exported mutable binding; use `export const`.",
        help: "Replace `export let`/`export var` with `export const` so the binding can't be reassigned.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
