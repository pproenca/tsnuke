import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * SYN — flag a type parameter whose name does not start with an uppercase
 * letter. The TypeScript ecosystem convention is PascalCase type parameters
 * (`T`, `TKey`, `TValue`), which keeps them visually distinct from value-level
 * identifiers. AST-only: the parameter name is a syntactic `Identifier`.
 *
 * Ported VERBATIM from legacy
 * `packages/ts-fix-rules/src/rules/generics/generic-name-convention.ts`;
 * the only change is importing `defineRule` from the `@ts-fix/rules-core-effect`
 * substrate rather than the legacy `../../define-rule.js`.
 */
export const rule = defineRule(
  {
    id: "generic-name-convention",
    severity: "warning",
    category: "Generics & Type-Level Complexity",
    tier: "SYN",
    fixKind: "manual",
    tags: ["generics"],
    recommendation:
      "Name type parameters in PascalCase (`T`, `TKey`, `TValue`) so they read as types, not values.",
  },
  () => ({
    [ts.SyntaxKind.TypeParameter]: (node, ctx) => {
      if (!ts.isTypeParameterDeclaration(node)) return;

      const name = node.name.text;
      if (/^[A-Z]/.test(name)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Type parameter names should be PascalCase, e.g. `T`, `TKey`, `TValue`.",
        help: `Rename type parameter \`${name}\` to start with an uppercase letter (PascalCase).`,
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
