import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * SYN — flag a type-parameter whose default is `any`, e.g. `<T = any>`.
 * When a caller omits the type argument, the parameter silently becomes `any`,
 * disabling type checking at every use of `T`. AST-only (no checker): the
 * default is a syntactic `AnyKeyword` type node on the `TypeParameter`.
 *
 * Ported VERBATIM from legacy
 * `packages/ts-fix-rules/src/rules/generics/no-generic-with-default-any.ts`;
 * the only change is importing `defineRule` from the `@ts-fix/rules-core-effect`
 * substrate rather than the legacy `../../define-rule.js`.
 */
export const rule = defineRule(
  {
    id: "no-generic-with-default-any",
    severity: "warning",
    category: "Generics & Type-Level Complexity",
    tier: "SYN",
    fixKind: "manual",
    tags: ["generics"],
    recommendation:
      "Avoid `<T = any>`; a type-parameter default of `any` silently disables checking when callers omit the type argument. Default to `unknown` or a real type instead.",
  },
  () => ({
    [ts.SyntaxKind.TypeParameter]: (node, ctx) => {
      if (!ts.isTypeParameterDeclaration(node)) return;

      const dflt = node.default;
      if (dflt === undefined) return;
      if (dflt.kind !== ts.SyntaxKind.AnyKeyword) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Type-parameter \`${node.name.text}\` defaults to \`any\`.`,
        help: "A type-parameter default of `any` silently disables checking when callers omit the type argument; default to `unknown` or a real type.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
