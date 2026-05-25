import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/** Unions beyond this many members make the checker slow to instantiate. */
const MAX_UNION_MEMBERS = 12;

/**
 * SYN — flag very large union types on a `type` alias (RULE-008).
 *
 * Each union member multiplies the work the checker does when the type is
 * instantiated, distributed, or assignability-checked; very wide unions are a
 * common cause of slow type-checking. AST-only: count the members of a union
 * `TypeAliasDeclaration`.
 *
 * Scoping (RULE-008 edge case): fires ONLY when the alias RHS is directly a
 * `UnionTypeNode` — a union nested inside another construct is not counted.
 *
 * Ported verbatim from legacy
 * `packages/ts-fix-rules/src/rules/type-performance/no-large-union-type.ts`;
 * the only change is importing `defineRule` from the `@ts-fix/rules-core-effect`
 * substrate rather than the legacy `../../define-rule.js`.
 */
export const rule = defineRule(
  {
    id: "no-large-union-type",
    severity: "warning",
    category: "Type Performance",
    tier: "SYN",
    fixKind: "manual",
    tags: ["performance"],
    recommendation:
      "A union with many members slows type instantiation; model it differently (e.g. a branded type, a lookup record, or a narrower set) instead of a very wide literal union.",
  },
  () => ({
    [ts.SyntaxKind.TypeAliasDeclaration]: (node, ctx) => {
      if (!ts.isTypeAliasDeclaration(node)) return;
      if (!ts.isUnionTypeNode(node.type)) return;
      if (node.type.types.length <= MAX_UNION_MEMBERS) return;

      const start = node.name.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Very large union type \`${node.name.text}\` (${node.type.types.length} members) slows type instantiation.`,
        help: "Consider a different model than a wide union (e.g. a branded type or lookup record).",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
