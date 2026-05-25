import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * SYN — exported functions must declare an explicit return type.
 *
 * An exported function with an inferred return type makes the emitted `.d.ts`
 * dependent on inference, which can drift, widen, or pull internal types into the
 * public surface. AST-only: an exported `FunctionDeclaration` with no `type` node
 * has no annotated return type.
 */
export const rule = defineRule(
  {
    id: "explicit-module-boundary-types",
    severity: "warning",
    category: "Declaration & API Hygiene",
    tier: "SYN",
    fixKind: "manual",
    tags: ["api-hygiene"],
    recommendation:
      "Annotate the return type of every exported function so the generated `.d.ts` is stable and the public API is intentional rather than inferred.",
  },
  () => ({
    [ts.SyntaxKind.FunctionDeclaration]: (node, ctx) => {
      if (!ts.isFunctionDeclaration(node)) return;
      if (!ts.canHaveModifiers(node)) return;
      const modifiers = ts.getModifiers(node);
      const isExported =
        modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (!isExported) return;
      if (node.type !== undefined) return; // already has an explicit return type.

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Exported function lacks an explicit return type.",
        help: "Annotate the return type for stable `.d.ts` output.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
