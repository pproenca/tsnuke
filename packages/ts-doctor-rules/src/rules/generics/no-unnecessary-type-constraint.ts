import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — flag a no-op generic constraint: `<T extends any>` or `<T extends unknown>`.
 * Both constraints permit every type, so they add visual noise without narrowing
 * the parameter — identical to writing a bare `<T>`. No checker needed: the
 * constraint is a syntactic `KeywordTypeNode` (`AnyKeyword` / `UnknownKeyword`).
 */
export const rule = defineRule(
  {
    id: "no-unnecessary-type-constraint",
    severity: "warning",
    category: "Generics & Type-Level Complexity",
    tier: "SYN",
    fixKind: "manual",
    tags: ["generics"],
    recommendation:
      "Drop the `extends any` / `extends unknown` constraint — both permit every type, so they are no-ops equivalent to a bare type parameter. Add a real constraint only if you need to narrow.",
  },
  () => ({
    [ts.SyntaxKind.TypeParameter]: (node, ctx) => {
      if (!ts.isTypeParameterDeclaration(node)) return;

      const constraint = node.constraint;
      if (constraint === undefined) return;
      if (
        constraint.kind !== ts.SyntaxKind.AnyKeyword &&
        constraint.kind !== ts.SyntaxKind.UnknownKeyword
      ) {
        return;
      }

      const keyword =
        constraint.kind === ts.SyntaxKind.AnyKeyword ? "any" : "unknown";
      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Unnecessary type constraint: \`extends ${keyword}\` is a no-op.`,
        help: `\`<T extends ${keyword}>\` permits every type, identical to a bare \`<T>\`. Drop the constraint or replace it with a real bound.`,
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
