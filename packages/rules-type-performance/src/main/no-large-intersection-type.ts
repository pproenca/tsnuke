import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/** Intersections beyond this many members are expensive to instantiate. */
const MAX_INTERSECTION_MEMBERS = 5;

/**
 * SYN — flag very large intersection types (RULE-009).
 *
 * Each intersection member adds work when the checker resolves, instantiates,
 * and assignability-checks the combined type; wide intersections are also hard
 * to read. AST-only: count the members of an `IntersectionTypeNode`.
 *
 * Scoping (RULE-009 edge case): fires on intersection nodes ANYWHERE (not limited
 * to aliases), so a 6-member intersection nested inside another construct fires.
 *
 * Ported verbatim from legacy
 * `packages/ts-fix-rules/src/rules/type-performance/no-large-intersection-type.ts`;
 * the only change is importing `defineRule` from the `@ts-fix/rules-core-effect`
 * substrate rather than the legacy `../../define-rule.js`.
 */
export const rule = defineRule(
  {
    id: "no-large-intersection-type",
    severity: "warning",
    category: "Type Performance",
    tier: "SYN",
    fixKind: "manual",
    tags: ["performance"],
    recommendation:
      "A large intersection type is expensive to instantiate and hard to read; consolidate the members into a single named type.",
  },
  () => ({
    [ts.SyntaxKind.IntersectionType]: (node, ctx) => {
      if (!ts.isIntersectionTypeNode(node)) return;
      if (node.types.length <= MAX_INTERSECTION_MEMBERS) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Large intersection type (${node.types.length} members) is expensive to instantiate.`,
        help: "Large intersection types are expensive to instantiate and hard to read; consider a single named type.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
